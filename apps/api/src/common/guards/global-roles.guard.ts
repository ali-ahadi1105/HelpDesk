import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '@prisma/client';
import { GLOBAL_ROLES_KEY } from '../decorators/global-roles.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class GlobalRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<GlobalRole[]>(GLOBAL_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) return false;
    if (!requiredRoles.includes(request.user.globalRole)) {
      throw new ForbiddenException('Your account role cannot perform this action');
    }
    return true;
  }
}
