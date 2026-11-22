import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { WorkspaceGuard } from './workspace.guard';

describe('WorkspaceGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const prisma = {
    membership: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    task: { findUnique: jest.fn() },
  };
  const guard = new WorkspaceGuard(reflector as unknown as Reflector, prisma as never);

  function context(params: Record<string, string>) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ params, user: { id: 'user-a' } }),
      }),
    } as never;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue([Role.OWNER, Role.ADMIN, Role.MEMBER]);
  });

  it('denies a user without a workspace membership', async () => {
    prisma.membership.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(context({ workspaceId: 'workspace-a' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies a viewer when the endpoint requires write access', async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: Role.VIEWER });

    await expect(guard.canActivate(context({ workspaceId: 'workspace-a' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows a member with an appropriate role', async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: Role.MEMBER });

    await expect(guard.canActivate(context({ workspaceId: 'workspace-a' }))).resolves.toBe(true);
  });
});
