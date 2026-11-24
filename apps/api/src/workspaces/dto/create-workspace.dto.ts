import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Product Team' })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiPropertyOptional({ example: 'Product and engineering' })
  @IsOptional()
  @IsString()
  @Length(0, 240)
  description?: string;

  @ApiPropertyOptional({ example: 'acme-product' })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;
}
