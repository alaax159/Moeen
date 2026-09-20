import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionMedicationDraftDto {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  dose: number | null;

  @ApiPropertyOptional({ nullable: true })
  unit: string | null;

  @ApiPropertyOptional({ nullable: true })
  dosageForm: string | null;

  @ApiPropertyOptional({ nullable: true })
  frequency: string | null;

  @ApiPropertyOptional({ nullable: true })
  duration: string | null;

  @ApiProperty({ type: [String], example: ['08:00', '20:00'] })
  times: string[];

  @ApiPropertyOptional({ nullable: true })
  instructions: string | null;

  @ApiPropertyOptional({ nullable: true })
  rxcui: string | null;

  @ApiPropertyOptional({ nullable: true })
  normalizedName: string | null;

  @ApiProperty()
  needsReview: boolean;
}
