import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

import { DurationOption, TIME_RE } from './add-medication.dto';

export class UpdateMedicationDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  frequency?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  dosageAmount?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  dosageUnit?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  dosageForm?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @Matches(TIME_RE, {
    each: true,
    message: 'scheduleTimes must be HH:mm or HH:mm:ss',
  })
  scheduleTimes?: string[];

  @IsOptional()
  @IsEnum(DurationOption)
  durationOption?: DurationOption;

  @IsOptional()
  @IsInt()
  @IsPositive()
  customDays?: number;
}
