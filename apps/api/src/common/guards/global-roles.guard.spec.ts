import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '@prisma/client';
import { GlobalRolesGuard } from './global-roles.guard';

describe('GlobalRolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new GlobalRolesGuard(reflector as unknown as Reflector);

  function context(globalRole: GlobalRole | undefined) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: globalRole ? { id: 'user-a', globalRole } : undefined }),
      }),
    } as never;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue([GlobalRole.ADMIN]);
  });

  it('allows routes without role metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(context(GlobalRole.USER))).toBe(true);
  });

  it('allows an admin when the endpoint requires the admin role', () => {
    expect(guard.canActivate(context(GlobalRole.ADMIN))).toBe(true);
  });

  it('denies a regular user when the endpoint requires the admin role', () => {
    expect(() => guard.canActivate(context(GlobalRole.USER))).toThrow(ForbiddenException);
  });

  it('denies requests without an authenticated user', () => {
    expect(guard.canActivate(context(undefined))).toBe(false);
  });
});
