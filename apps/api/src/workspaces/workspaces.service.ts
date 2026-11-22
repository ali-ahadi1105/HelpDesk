import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(userId: string) {
    return this.prisma.workspace.findMany({
      where: { memberships: { some: { userId } } },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        memberships: { where: { userId }, select: { role: true } },
        _count: { select: { projects: true, memberships: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    const slug = dto.slug ?? this.slugify(dto.name);
    if (await this.prisma.workspace.findUnique({ where: { slug } })) {
      throw new ConflictException('Workspace slug is already in use');
    }
    return this.prisma.workspace.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        createdById: userId,
        memberships: { create: { userId, role: Role.OWNER } },
      },
      include: { memberships: { where: { userId }, select: { role: true } } },
    });
  }

  async get(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { projects: true } },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace was not found');
    return workspace;
  }

  async invite(workspaceId: string, invitedById: string, dto: InviteMemberDto) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const membership = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      });
      if (membership) throw new ConflictException('This user is already a workspace member');
    }
    const pending = await this.prisma.workspaceInvite.findFirst({
      where: { workspaceId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending) throw new ConflictException('An invitation is already pending');

    const invite = await this.prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email,
        role: dto.role,
        token: randomBytes(32).toString('hex'),
        invitedById,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt };
  }

  async updateMemberRole(workspaceId: string, memberId: string, role: Role): Promise<void> {
    const membership = await this.prisma.membership.findFirst({ where: { id: memberId, workspaceId } });
    if (!membership) throw new NotFoundException('Workspace member was not found');
    if (membership.role === Role.OWNER) {
      throw new ForbiddenException('The workspace owner role cannot be changed');
    }
    await this.prisma.membership.update({ where: { id: memberId }, data: { role } });
    await this.redis.deleteWorkspaceCache(workspaceId);
  }

  async removeMember(workspaceId: string, memberId: string, actingUserId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({ where: { id: memberId, workspaceId } });
    if (!membership) throw new NotFoundException('Workspace member was not found');
    if (membership.role === Role.OWNER) throw new ForbiddenException('The workspace owner cannot be removed');
    if (membership.userId === actingUserId) throw new ForbiddenException('You cannot remove yourself');
    await this.prisma.membership.delete({ where: { id: memberId } });
    await this.redis.deleteWorkspaceCache(workspaceId);
  }

  private slugify(name: string): string {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${slug || 'workspace'}-${randomBytes(3).toString('hex')}`;
  }
}
