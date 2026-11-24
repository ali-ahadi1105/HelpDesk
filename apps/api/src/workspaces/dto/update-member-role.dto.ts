import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsIn } from 'class-validator';
import { ASSIGNABLE_ROLES } from '../roles';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'VIEWER'] })
  @IsIn(ASSIGNABLE_ROLES)
  role!: Role;
}
