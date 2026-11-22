import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsIn } from 'class-validator';
import { ASSIGNABLE_ROLES } from '../roles';

export class InviteMemberDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'VIEWER'] })
  @IsIn(ASSIGNABLE_ROLES)
  role!: Role;
}
