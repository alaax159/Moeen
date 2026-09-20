import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum DeviceType {
  ANDROID = 'android',
  IOS = 'ios',
  EMULATOR = 'emulator',
}

export class UpdateNotificationPreferencesDto {
  @ValidateIf(
    (dto: UpdateNotificationPreferencesDto) =>
      dto.expoPushToken !== undefined ||
      dto.deviceType !== undefined ||
      dto.isActive !== undefined,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  expoPushToken?: string;

  @ValidateIf(
    (dto: UpdateNotificationPreferencesDto) =>
      dto.expoPushToken !== undefined ||
      dto.deviceType !== undefined ||
      dto.isActive !== undefined,
  )
  @IsEnum(DeviceType)
  deviceType?: DeviceType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  followUpEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emergencyContactSmsEnabled?: boolean;

  @ValidateIf(
    (dto: UpdateNotificationPreferencesDto) =>
      dto.followUpEnabled === true ||
      dto.followUpDelayMin !== undefined,
  )
  @IsInt()
  @Min(1)
  followUpDelayMin?: number;
}
