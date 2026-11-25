import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GlobalRole, Prisma, Role, User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse extends TokenPair {
  user: AuthUserProfile;
}

export type AuthUserProfile = Pick<User, 'id' | 'email' | 'name' | 'globalRole'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with this email already exists');
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await hash(dto.password, 12),
      },
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const tokenHash = this.hashToken(refreshToken);
    const user = await this.prisma.user.findFirst({
      where: { refreshTokens: { some: { tokenHash } } },
    });
    if (!user) throw new UnauthorizedException('Refresh token is invalid or expired');

    const session = await this.signSession(user);
    const replaced = await this.prisma.$transaction(async (tx) => {
      // Claim the presented token with a conditional update so exactly one
      // concurrent request can win: the WHERE clause only matches a row that
      // is still unrevoked and unexpired when the update executes.
      const claimed = await tx.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1) return false;

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(session.refreshToken),
          expiresAt: new Date(Date.now() + this.refreshTtlSeconds() * 1000),
        },
      });
      return true;
    });
    if (!replaced) throw new UnauthorizedException('Refresh token is invalid or expired');

    return { ...session, user: this.profileOf(user) };
  }

  async logout(userId: string, accessJti: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.redis.revokeAccessToken(accessJti, this.accessTtlSeconds());
  }

  async membershipFor(userId: string, workspaceId: string): Promise<Role | undefined> {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    return membership?.role;
  }

  async me(userId: string): Promise<AuthUserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return this.profileOf(user);
  }

  async updateGlobalRole(userId: string, role: GlobalRole, actorId: string): Promise<AuthUserProfile> {
    if (userId === actorId && role !== GlobalRole.ADMIN) {
      throw new BadRequestException('You cannot change your own global role');
    }
    try {
      const user = await this.prisma.user.update({ where: { id: userId }, data: { globalRole: role } });
      return this.profileOf(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('User was not found');
      }
      throw error;
    }
  }

  private async issueTokens(user: User): Promise<AuthResponse> {
    const session = await this.signSession(user);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(session.refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds() * 1000),
      },
    });
    return session;
  }

  private async signSession(user: User): Promise<AuthResponse> {
    const jti = randomUUID();
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const refreshTtl = this.refreshTtlSeconds();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: user.id, email: user.email, name: user.name, jti, role: user.globalRole, type: 'access' as const },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn: accessTtl as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      ),
      this.jwtService.signAsync(
        { sub: user.id, type: 'refresh' as const, nonce: randomBytes(16).toString('hex') },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshTtl,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds(),
      user: this.profileOf(user),
    };
  }

  private profileOf(user: User): AuthUserProfile {
    return { id: user.id, email: user.email, name: user.name, globalRole: user.globalRole as GlobalRole };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessTtlSeconds(): number {
    return this.durationSeconds(this.config.get<string>('JWT_ACCESS_TTL', '15m'));
  }

  private refreshTtlSeconds(): number {
    return this.durationSeconds(this.config.get<string>('JWT_REFRESH_TTL', '7d'));
  }

  private durationSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 900;
    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return amount * multiplier;
  }
}
