import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'The copy is ready for review.' })
  @IsString()
  @Length(1, 5000)
  body!: string;
}
