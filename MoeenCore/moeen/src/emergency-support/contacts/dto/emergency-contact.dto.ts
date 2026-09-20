import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export class CreateEmergencyContactDto {
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 100)
  name!: string;

  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @Matches(E164_PHONE_PATTERN)
  phone!: string;

  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 50)
  relationship?: string;
}

export class UpdateEmergencyContactDto {
  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @Matches(E164_PHONE_PATTERN)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 50)
  relationship?: string;
}

export class EmergencyContactResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  relationship: string | null;

  @ApiProperty()
  isPrimary: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
