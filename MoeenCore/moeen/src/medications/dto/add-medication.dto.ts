// src/medications/add-medication/dto/add-medication.dto.ts

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum MedicationSource {
  EXISTING_DB = 'existing_db',
  PALESTINE_MOH = 'palestine_moh',
  DAILYMED = 'dailymed',
  RXNORM = 'rxnorm',
  MANUAL = 'manual',
}

export enum UserMedicationStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum CompletionStatus {
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum DurationOption {
  THREE_DAYS = '3_days',
  ONE_WEEK = '1_week',
  TWO_WEEKS = '2_weeks',
  ONE_MONTH = '1_month',
  ONGOING = 'ongoing',
  CUSTOM = 'custom',
}

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

export class MedicationRefDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  id?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  medicationCatalogId?: number;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsString()
  genericName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  dailymedId?: string;

  @IsOptional()
  @IsString()
  rxcui?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UserMedicationDto {
  @IsInt()
  @Min(0)
  frequency!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  dosageAmount!: number;

  @IsString()
  @MaxLength(50)
  dosageUnit!: string;

  @IsString()
  @MaxLength(50)
  dosageForm!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsEnum(UserMedicationStatus)
  status?: UserMedicationStatus;

  @IsOptional()
  @IsEnum(CompletionStatus)
  completion?: CompletionStatus;

  @IsEnum(DurationOption)
  durationOption!: DurationOption;

  @IsOptional()
  @IsInt()
  @IsPositive()
  customDays?: number;
}

export class AddMedicationDto {
  @IsEnum(MedicationSource)
  source!: MedicationSource;

  @ValidateNested()
  @Type(() => MedicationRefDto)
  medication!: MedicationRefDto;

  @ValidateNested()
  @Type(() => UserMedicationDto)
  userMedication!: UserMedicationDto;

  @IsArray()
  @ArrayMaxSize(12)
  @Matches(TIME_RE, {
    each: true,
    message: 'scheduleTimes must be HH:mm or HH:mm:ss',
  })
  scheduleTimes!: string[];
}
