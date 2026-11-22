import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class MoveTaskDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  columnId!: string;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  position?: number;
}
