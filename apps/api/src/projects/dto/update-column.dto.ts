import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, Length } from 'class-validator';

export class UpdateColumnDto {
  @ApiPropertyOptional({ example: 'In review' })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  title?: string;

  @ApiPropertyOptional({ example: '#8b5cf6' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
