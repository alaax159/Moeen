import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
}

export enum BloodType {
  A_POSITIVE = 'A+',
  A_NEGATIVE = 'A-',
  B_POSITIVE = 'B+',
  B_NEGATIVE = 'B-',
  AB_POSITIVE = 'AB+',
  AB_NEGATIVE = 'AB-',
  O_POSITIVE = 'O+',
  O_NEGATIVE = 'O-',
}

export enum HealthKnowledgeStatus {
  NONE_KNOWN = 'none_known',
  HAS_RECORDS = 'has_records',
}

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export class SavePersonalInfoDto {
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 100)
  firstName!: string;

  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 100)
  lastName!: string;

  @IsDateString({ strict: true })
  dateOfBirth!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(500)
  weightKg!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(30)
  @Max(300)
  heightCm!: number;

  @IsEnum(Gender)
  gender!: Gender;

  @IsEnum(BloodType)
  bloodType!: BloodType;

  @IsEnum(HealthKnowledgeStatus)
  allergyKnowledgeStatus!: HealthKnowledgeStatus;

  @IsEnum(HealthKnowledgeStatus)
  conditionKnowledgeStatus!: HealthKnowledgeStatus;

  @IsOptional()
  @Matches(E164_PHONE_PATTERN)
  emergencyContactPhone?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const rawValue: unknown = value;
    return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  })
  @IsString()
  @Length(1, 100)
  doctorName?: string;

  @IsOptional()
  @Matches(E164_PHONE_PATTERN)
  doctorPhone?: string;
}
