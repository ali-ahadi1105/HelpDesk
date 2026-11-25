import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  const prisma = {
    workspace: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    membership: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    workspaceInvite: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const redis = { deleteWorkspaceCache: jest.fn() };
  const service = new WorkspacesService(prisma as never, redis as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns only workspaces where the user has a membership', async () => {
      prisma.workspace.findMany.mockResolvedValue([{ id: 'workspace-a' }]);

      const result = await service.list('user-a');

      expect(result).toEqual([{ id: 'workspace-a' }]);
      expect(prisma.workspace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { memberships: { some: { userId: 'user-a' } } } }),
      );
    });
  });

  describe('create', () => {
    it('makes the creator the workspace owner', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);
      prisma.workspace.create.mockResolvedValue({ id: 'workspace-a' });

      await service.create('user-a', { name: 'Acme Team' });

      expect(prisma.workspace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Acme Team',
            createdById: 'user-a',
            memberships: { create: { userId: 'user-a', role: Role.OWNER } },
          }),
        }),
      );
    });

    it('rejects a slug that is already in use', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'workspace-b' });

      await expect(service.create('user-a', { name: 'Acme', slug: 'acme' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.workspace.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects an unknown workspace', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'New name' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('updates the name and invalidates the workspace cache', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'workspace-a', slug: 'acme' });
      prisma.workspace.update.mockResolvedValue({ id: 'workspace-a', name: 'New name' });

      const result = await service.update('workspace-a', { name: 'New name' });

      expect(result.name).toBe('New name');
      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: 'workspace-a' },
        data: { name: 'New name' },
        include: { memberships: true },
      });
      expect(redis.deleteWorkspaceCache).toHaveBeenCalledWith('workspace-a');
    });

    it('rejects a slug owned by another workspace', async () => {
      prisma.workspace.findUnique
        .mockResolvedValueOnce({ id: 'workspace-a', slug: 'acme' })
        .mockResolvedValueOnce({ id: 'workspace-b', slug: 'taken' });

      await expect(service.update('workspace-a', { slug: 'taken' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.workspace.update).not.toHaveBeenCalled();
    });

    it('allows keeping the current slug', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'workspace-a', slug: 'acme' });
      prisma.workspace.update.mockResolvedValue({ id: 'workspace-a', slug: 'acme' });

      await service.update('workspace-a', { slug: 'acme' });

      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: 'workspace-a' },
        data: {},
        include: { memberships: true },
      });
    });
  });

  describe('invite', () => {
    it('normalizes the email and rejects an existing member', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-b' });
      prisma.membership.findUnique.mockResolvedValue({ id: 'membership-b' });

      await expect(
        service.invite('workspace-a', 'user-a', { email: 'Member@Example.com ', role: Role.MEMBER }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.workspaceInvite.create).not.toHaveBeenCalled();
    });

    it('rejects a second pending invitation for the same email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.workspaceInvite.findFirst.mockResolvedValue({ id: 'invite-a' });

      await expect(
        service.invite('workspace-a', 'user-a', { email: 'new@example.com', role: Role.ADMIN }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.workspaceInvite.create).not.toHaveBeenCalled();
    });

    it('creates an invitation with a 32-byte token and a 7-day expiry', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.workspaceInvite.findFirst.mockResolvedValue(null);
      prisma.workspaceInvite.create.mockResolvedValue({
        id: 'invite-a',
        email: 'new@example.com',
        role: Role.VIEWER,
        token: 't'.repeat(64),
        expiresAt: new Date(),
      });

      const result = await service.invite('workspace-a', 'user-a', {
        email: 'New@Example.com',
        role: Role.VIEWER,
      });

      expect(result.email).toBe('new@example.com');
      const call = prisma.workspaceInvite.create.mock.calls[0][0] as {
        data: { email: string; role: Role; token: string; expiresAt: Date; workspaceId: string };
      };
      expect(call.data.email).toBe('new@example.com');
      expect(call.data.token).toHaveLength(64);
      expect(call.data.expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    });
  });

  describe('listInvitations', () => {
    it('returns only pending, unexpired invitations without tokens', async () => {
      prisma.workspaceInvite.findMany.mockResolvedValue([{ id: 'invite-a', email: 'a@example.com' }]);

      const result = await service.listInvitations('workspace-a');

      expect(result).toHaveLength(1);
      const call = prisma.workspaceInvite.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        select: Record<string, unknown>;
      };
      expect(call.where).toMatchObject({ workspaceId: 'workspace-a', acceptedAt: null });
      expect(call.select).not.toHaveProperty('token');
    });
  });

  describe('cancelInvitation', () => {
    it('consumes the pending invitation atomically', async () => {
      prisma.workspaceInvite.updateMany.mockResolvedValue({ count: 1 });

      await service.cancelInvitation('workspace-a', 'invite-a');

      expect(prisma.workspaceInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-a', workspaceId: 'workspace-a', acceptedAt: null },
        data: { acceptedAt: expect.any(Date) },
      });
      expect(redis.deleteWorkspaceCache).toHaveBeenCalledWith('workspace-a');
    });

    it('fails when the invitation is not pending in this workspace', async () => {
      prisma.workspaceInvite.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancelInvitation('workspace-a', 'invite-a')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(redis.deleteWorkspaceCache).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvitation', () => {
    const invite = {
      id: 'invite-a',
      workspaceId: 'workspace-a',
      email: 'invitee@example.com',
      role: Role.MEMBER,
      token: 't'.repeat(64),
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('rejects an invitation issued to a different email', async () => {
      prisma.workspaceInvite.findUnique.mockResolvedValue(invite);

      await expect(
        service.acceptInvitation(invite.token, 'user-a', 'someone-else@example.com'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an already accepted invitation', async () => {
      prisma.workspaceInvite.findUnique.mockResolvedValue({ ...invite, acceptedAt: new Date() });

      await expect(
        service.acceptInvitation(invite.token, 'user-a', 'invitee@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks the invitation consumed and creates the membership in one transaction', async () => {
      prisma.workspaceInvite.findUnique.mockResolvedValue(invite);
      prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          membership: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'membership-a', role: Role.MEMBER }) },
          workspaceInvite: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        }),
      );

      const result = await service.acceptInvitation(invite.token, 'user-a', 'Invitee@Example.com');

      expect(result).toEqual({ membershipId: 'membership-a', workspaceId: 'workspace-a', role: Role.MEMBER });
    });

    it('refuses a replayed token that was consumed concurrently', async () => {
      prisma.workspaceInvite.findUnique.mockResolvedValue(invite);
      prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          membership: { findUnique: jest.fn().mockResolvedValue(null) },
          workspaceInvite: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        }),
      );

      await expect(
        service.acceptInvitation(invite.token, 'user-a', 'invitee@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateMemberRole', () => {
    it('refuses to change the owner role', async () => {
      prisma.membership.findFirst.mockResolvedValue({ id: 'membership-a', role: Role.OWNER });

      await expect(
        service.updateMemberRole('workspace-a', 'membership-a', Role.ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.membership.update).not.toHaveBeenCalled();
    });

    it('updates the role and invalidates the workspace cache', async () => {
      prisma.membership.findFirst.mockResolvedValue({ id: 'membership-a', role: Role.MEMBER });

      await service.updateMemberRole('workspace-a', 'membership-a', Role.ADMIN);

      expect(prisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'membership-a' },
        data: { role: Role.ADMIN },
      });
      expect(redis.deleteWorkspaceCache).toHaveBeenCalledWith('workspace-a');
    });

    it('rejects a membership from another workspace', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.updateMemberRole('workspace-a', 'membership-b', Role.ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeMember', () => {
    it('refuses to remove the owner', async () => {
      prisma.membership.findFirst.mockResolvedValue({ id: 'membership-a', userId: 'user-b', role: Role.OWNER });

      await expect(service.removeMember('workspace-a', 'membership-a', 'user-a')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.membership.delete).not.toHaveBeenCalled();
    });

    it('refuses self-removal', async () => {
      prisma.membership.findFirst.mockResolvedValue({ id: 'membership-a', userId: 'user-a', role: Role.ADMIN });

      await expect(service.removeMember('workspace-a', 'membership-a', 'user-a')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.membership.delete).not.toHaveBeenCalled();
    });

    it('removes the member and invalidates the workspace cache', async () => {
      prisma.membership.findFirst.mockResolvedValue({ id: 'membership-a', userId: 'user-b', role: Role.MEMBER });

      await service.removeMember('workspace-a', 'membership-a', 'user-a');

      expect(prisma.membership.delete).toHaveBeenCalledWith({ where: { id: 'membership-a' } });
      expect(redis.deleteWorkspaceCache).toHaveBeenCalledWith('workspace-a');
    });
  });
});
