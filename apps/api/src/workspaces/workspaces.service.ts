import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

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

  async update(workspaceId: string, dto: UpdateWorkspaceDto) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace was not found');

    const data: { name?: string; description?: string | null; slug?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.slug !== undefined && dto.slug !== workspace.slug) {
      if (await this.prisma.workspace.findUnique({ where: { slug: dto.slug } })) {
        throw new ConflictException('Workspace slug is already in use');
      }
      data.slug = dto.slug;
    }

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data,
      include: { memberships: true },
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
    return updated;
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
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
    };
  }

  async listInvitations(workspaceId: string) {
    const invites = await this.prisma.workspaceInvite.findMany({
      where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return invites;
  }

  async cancelInvitation(workspaceId: string, invitationId: string) {
    // Consume the invite with a conditional update so a replayed cancel
    // cannot affect an invitation that was already accepted or cancelled.
    const consumed = await this.prisma.workspaceInvite.updateMany({
      where: { id: invitationId, workspaceId, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (consumed.count !== 1) throw new NotFoundException('Pending invitation was not found');
    await this.redis.deleteWorkspaceCache(workspaceId);
  }

  async acceptInvitation(token: string, userId: string, userEmail: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
      throw new NotFoundException('Invitation is invalid or expired');
    }
    if (invite.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new ForbiddenException('This invitation was issued to a different email address');
    }

    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
      });
      if (membership) {
        throw new ConflictException('You are already a member of this workspace');
      }

      // Mark the invitation consumed with a conditional update so a replayed
      // token cannot create a second membership.
      const consumed = await tx.workspaceInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new ConflictException('Invitation has already been accepted');
      }

      const created = await tx.membership.create({
        data: { workspaceId: invite.workspaceId, userId, role: invite.role },
      });
      return {
        membershipId: created.id,
        workspaceId: invite.workspaceId,
        role: created.role,
      };
    });
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
