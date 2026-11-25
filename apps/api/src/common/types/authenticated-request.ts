import { GlobalRole, Role } from '@prisma/client';
import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  jti: string;
  globalRole: GlobalRole;
}

export interface WorkspaceContext {
  id: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  workspace: WorkspaceContext;
}
