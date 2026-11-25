import { ApiProperty } from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateGlobalRoleDto {
  @ApiProperty({ enum: GlobalRole, example: GlobalRole.ADMIN })
  @IsEnum(GlobalRole)
  role!: GlobalRole;
}
