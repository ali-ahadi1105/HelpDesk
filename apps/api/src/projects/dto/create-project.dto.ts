import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, Length } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Website redesign' })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({ example: 'Plan and deliver the new marketing site' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({ example: '#6d5dfc' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
