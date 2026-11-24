import { Role } from '@prisma/client';

export const ASSIGNABLE_ROLES = [Role.ADMIN, Role.MEMBER, Role.VIEWER] as const;
