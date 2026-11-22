import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  };
  const jwtService = { signAsync: jest.fn() };
  const configValues: Record<string, string> = {
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback),
    getOrThrow: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const redis = { revokeAccessToken: jest.fn() };

  const service = new AuthService(
    prisma as never,
    jwtService as unknown as JwtService,
    config,
    redis as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService.signAsync.mockResolvedValue('signed-token');
  });

  it('rejects a login when the email does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login({ email: 'missing@example.com', password: 'password' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('stores only a hash of the refresh token', async () => {
    const user = {
      id: 'user-id',
      email: 'alex@example.com',
      name: 'Alex',
      passwordHash: await hash('password', 4),
    };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.refreshToken.create.mockResolvedValue({});
    jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');

    const result = await service.login({ email: 'ALEX@example.com', password: 'password' });

    expect(result.accessToken).toBe('access-token');
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenHash: expect.not.stringContaining('refresh-token') }),
      }),
    );
  });

  it('rejects an expired or revoked refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-id',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    });

    await expect(service.refresh('invalid-refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
