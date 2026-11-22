import { Role } from '@prisma/client';
import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  jti: string;
}

export interface WorkspaceContext {
  id: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  workspace: WorkspaceContext;
}
