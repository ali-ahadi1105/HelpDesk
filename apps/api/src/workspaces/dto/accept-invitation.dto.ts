import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({ example: 'a3f1c2d4e5b6...' })
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  token!: string;
}
