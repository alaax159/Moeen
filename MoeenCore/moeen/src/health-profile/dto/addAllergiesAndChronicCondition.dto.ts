import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

const ALLERGY_EXTERNAL_ID_PATTERN = /^snomed:\d+$/;
const CONDITION_EXTERNAL_ID_PATTERN = /^(icd10cm|snomed):[A-Za-z0-9.-]+$/;

export class CreateAllergyDto {
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 255)
  reaction?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 50)
  severity?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 100)
  @Matches(ALLERGY_EXTERNAL_ID_PATTERN)
  externalId?: string;
}

export class CreateChronicConditionDto {
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  diagnosisDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 1000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 100)
  @Matches(CONDITION_EXTERNAL_ID_PATTERN)
  externalId?: string;
}
