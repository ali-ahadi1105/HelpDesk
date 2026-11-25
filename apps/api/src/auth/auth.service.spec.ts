import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    refreshToken: { create: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
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
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-id',
      email: 'alex@example.com',
      name: 'Alex',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          refreshToken: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn(),
          },
        }),
    );

    await expect(service.refresh('invalid-refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects a refresh token when the claim does not match exactly one row', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-id',
      email: 'alex@example.com',
      name: 'Alex',
    });
    const create = jest.fn();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          refreshToken: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create,
          },
        }),
    );

    await expect(service.refresh('reused-refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(create).not.toHaveBeenCalled();
  });

  it('claims a refresh token once and stores the replacement', async () => {
    const user = {
      id: 'user-id',
      email: 'alex@example.com',
      name: 'Alex',
      globalRole: 'USER',
    };
    prisma.user.findFirst.mockResolvedValue(user);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ refreshToken: { updateMany, create } }),
    );
    jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');

    const result = await service.refresh('valid-refresh-token');

    expect(result.accessToken).toBe('access-token');
    expect(result.user.globalRole).toBe('USER');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('embeds the global role in the signed access token', async () => {
    const user = {
      id: 'user-id',
      email: 'alex@example.com',
      name: 'Alex',
      passwordHash: await hash('password', 4),
      globalRole: 'ADMIN',
    };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.refreshToken.create.mockResolvedValue({});
    jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');

    const result = await service.login({ email: 'alex@example.com', password: 'password' });

    expect(result.user.globalRole).toBe('ADMIN');
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN', type: 'access' }),
      expect.anything(),
    );
  });

  it('rejects a self-demotion of the global role', async () => {
    await expect(service.updateGlobalRole('user-id', 'USER' as never, 'user-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('updates the global role of another user', async () => {
    prisma.user.update = jest.fn().mockResolvedValue({
      id: 'other-id',
      email: 'other@example.com',
      name: 'Other',
      globalRole: 'ADMIN',
    });

    const result = await service.updateGlobalRole('other-id', 'ADMIN' as never, 'user-id');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'other-id' },
      data: { globalRole: 'ADMIN' },
    });
    expect(result.globalRole).toBe('ADMIN');
  });
});
