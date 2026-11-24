import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'alex@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Alex Morgan' })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @Length(10, 72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'password must contain uppercase, lowercase, and numeric characters',
  })
  password!: string;
}
