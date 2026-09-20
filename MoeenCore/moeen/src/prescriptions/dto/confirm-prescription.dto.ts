import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AddMedicationDto } from '../../medications/dto/add-medication.dto';

// A single reviewed medication from the prescription review screen. It is the
// existing AddMedicationDto so the confirmation flow validates and persists
// through exactly the same contract as the manual add flow.
export class ConfirmPrescriptionMedicationDto extends AddMedicationDto {
  // Set once the user has seen the safety warnings for this medication and
  // chose to continue. Without it a medication with warnings is reported back
  // as blocked instead of being saved, so safety checks are never bypassed.
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  acknowledgeWarnings?: boolean;
}

export class ConfirmPrescriptionDto {
  @ApiProperty({ type: [ConfirmPrescriptionMedicationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConfirmPrescriptionMedicationDto)
  medications!: ConfirmPrescriptionMedicationDto[];
}
