import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { MedicationSafetyWarning } from '../../medication-safety/medication-safety.contracts';

export enum ConfirmPrescriptionItemStatus {
  // Saved through the existing add-medication flow.
  ADDED = 'added',
  // Not saved: safety warnings or an active duplicate need the user's
  // decision first. The client re-sends this item with acknowledgeWarnings.
  BLOCKED = 'blocked',
  // Not saved: validation or a server error for this medication only.
  FAILED = 'failed',
}

export class ConfirmPrescriptionDuplicateDto {
  @ApiProperty()
  userMedicationId: number;

  @ApiProperty()
  medicationId: number;

  @ApiProperty()
  name: string;
}

export class ConfirmPrescriptionItemResultDto {
  // Index into the submitted medications array so the client can map the
  // result back to the row the user reviewed.
  @ApiProperty()
  index: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ConfirmPrescriptionItemStatus })
  status: ConfirmPrescriptionItemStatus;

  @ApiPropertyOptional({ nullable: true })
  userMedicationId?: number | null;

  @ApiProperty({ type: [Object] })
  warnings: MedicationSafetyWarning[];

  @ApiPropertyOptional({
    type: ConfirmPrescriptionDuplicateDto,
    nullable: true,
  })
  duplicateMedication?: ConfirmPrescriptionDuplicateDto | null;

  // User-safe reason for a blocked or failed item.
  @ApiPropertyOptional({ nullable: true })
  message?: string | null;
}

export class ConfirmPrescriptionResponseDto {
  @ApiProperty()
  addedCount: number;

  @ApiProperty()
  blockedCount: number;

  @ApiProperty()
  failedCount: number;

  @ApiProperty({ type: [ConfirmPrescriptionItemResultDto] })
  results: ConfirmPrescriptionItemResultDto[];
}
