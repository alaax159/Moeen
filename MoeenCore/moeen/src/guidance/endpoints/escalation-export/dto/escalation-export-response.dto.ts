import { ApiProperty } from '@nestjs/swagger';

export class EscalationExportMedicationDto {
  @ApiProperty()
  userMedicationId: number;

  @ApiProperty({ type: String, nullable: true })
  brandName: string | null;

  @ApiProperty({ type: String, nullable: true })
  genericName: string | null;

  @ApiProperty()
  dosageAmount: string;

  @ApiProperty()
  dosageUnit: string;

  @ApiProperty()
  dosageForm: string;

  @ApiProperty()
  frequency: number;

  @ApiProperty({ type: String, nullable: true })
  instructions: string | null;

  @ApiProperty({ type: [String] })
  scheduleTimes: string[];
}

export class EscalationExportDoseDto {
  @ApiProperty()
  userMedicationId: number;

  @ApiProperty({ type: String, nullable: true })
  brandName: string | null;

  @ApiProperty({ type: String, nullable: true })
  genericName: string | null;

  @ApiProperty({ description: "Calendar day this dose belongs to ('YYYY-MM-DD')." })
  date: string;

  @ApiProperty({ description: 'ISO timestamp this dose was scheduled for.' })
  scheduledFor: string;

  @ApiProperty({ enum: ['taken', 'skipped', 'pending', 'snoozed', 'missed'] })
  status: 'taken' | 'skipped' | 'pending' | 'snoozed' | 'missed';

  @ApiProperty({ description: "ISO timestamp of the row's last status change." })
  markedAt: string;
}

export class EscalationExportResponseDto {
  @ApiProperty({ type: [EscalationExportMedicationDto] })
  medications: EscalationExportMedicationDto[];

  @ApiProperty({
    type: [EscalationExportDoseDto],
    description: 'Individual dose_log rows over the recent window, newest first.',
  })
  recentDoses: EscalationExportDoseDto[];
}
