import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 10000)
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
