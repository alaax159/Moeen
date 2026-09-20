import { ApiProperty } from '@nestjs/swagger';

export class SafetyWarningItemDto {
  @ApiProperty({ enum: ['drug_allergy', 'drug_condition'] })
  warningType: 'drug_allergy' | 'drug_condition';

  @ApiProperty()
  severity: string;

  @ApiProperty()
  message: string;
}

export class MedicationSafetyWarningsDto {
  @ApiProperty()
  userMedicationId: number;

  @ApiProperty()
  medicationId: number;

  @ApiProperty({ type: String, nullable: true })
  brandName: string | null;

  @ApiProperty({ type: String, nullable: true })
  genericName: string | null;

  @ApiProperty({
    enum: ['checked', 'failed'],
    description:
      "Outcome of the most recent safety check attempt. 'failed' means the live " +
      'check could not complete; any warnings shown are the last known-good set.',
  })
  status: 'checked' | 'failed';

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'ISO timestamp of the most recent *successful* safety check, or null if ' +
      'this medication has never been checked successfully. Pair with `status`.',
  })
  lastCheckedAt: string | null;

  @ApiProperty({
    enum: ['allergy', 'condition'],
    isArray: true,
    description:
      'Safety areas that could not be verified because the profile lacks ' +
      'allergy and/or chronic-condition information. Empty when fully verified.',
  })
  unverified: ('allergy' | 'condition')[];

  @ApiProperty({ type: [SafetyWarningItemDto] })
  warnings: SafetyWarningItemDto[];
}

export class SafetyWarningsResponseDto {
  @ApiProperty({ type: [MedicationSafetyWarningsDto] })
  medications: MedicationSafetyWarningsDto[];
}
