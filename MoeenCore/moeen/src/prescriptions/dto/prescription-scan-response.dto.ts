import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrescriptionMedicationDraftDto } from './prescription-medication-draft.dto';

class PrescriptionOcrResponseDto {
  @ApiProperty()
  text: string;

  @ApiPropertyOptional()
  confidence?: number;
}

export class PrescriptionScanResponseDto {
  @ApiProperty({ enum: ['draft'] })
  status: 'draft';

  @ApiProperty({ type: PrescriptionOcrResponseDto })
  ocr: PrescriptionOcrResponseDto;

  @ApiProperty({ type: [PrescriptionMedicationDraftDto] })
  items: PrescriptionMedicationDraftDto[];
}
