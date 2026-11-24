import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { WORKSPACE_ROLES_KEY } from '../decorators/workspace-roles.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(WORKSPACE_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const workspaceId = await this.resolveWorkspaceId(request);
    if (!workspaceId) throw new NotFoundException('Workspace resource was not found');

    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: request.user.id } },
    });
    if (!membership) throw new ForbiddenException('You do not have access to this workspace');

    request.workspace = { id: workspaceId, role: membership.role };
    if (!requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Your workspace role cannot perform this action');
    }
    return true;
  }

  private async resolveWorkspaceId(request: AuthenticatedRequest): Promise<string | undefined> {
    const params = request.params as Record<string, string | undefined>;
    if (params.workspaceId) return params.workspaceId;
    if (params.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: params.projectId },
        select: { workspaceId: true },
      });
      return project?.workspaceId;
    }
    if (params.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: params.taskId },
        select: { project: { select: { workspaceId: true } } },
      });
      return task?.project.workspaceId;
    }
    return undefined;
  }
}
