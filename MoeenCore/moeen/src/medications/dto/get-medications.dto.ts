import { IsEnum, IsOptional } from 'class-validator';

import { UserMedicationStatus } from './add-medication.dto';

export class GetMedicationsDto {
  @IsOptional()
  @IsEnum(UserMedicationStatus)
  status?: UserMedicationStatus;
}