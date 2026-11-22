import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const WORKSPACE_ROLES_KEY = 'workspaceRoles';
export const WorkspaceRoles = (...roles: Role[]) => SetMetadata(WORKSPACE_ROLES_KEY, roles);
