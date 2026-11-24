import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Legacy fallback; the browser uses an HTTP-only cookie' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  refreshToken?: string;
}
