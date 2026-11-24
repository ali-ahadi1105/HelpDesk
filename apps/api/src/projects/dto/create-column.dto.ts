import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { IsEnum, IsHexColor, IsOptional, IsString, Length } from 'class-validator';

export class CreateColumnDto {
  @ApiProperty({ example: 'Review' })
  @IsString()
  @Length(2, 50)
  title!: string;

  @ApiPropertyOptional({ enum: TaskStatus, example: TaskStatus.IN_PROGRESS })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ example: '#f59e0b' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
