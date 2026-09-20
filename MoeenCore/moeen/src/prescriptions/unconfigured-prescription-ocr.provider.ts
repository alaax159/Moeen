import { Injectable } from '@nestjs/common';
import {
  PrescriptionOcrProvider,
  PrescriptionOcrResult,
  PrescriptionOcrUnavailableError,
} from './prescription-ocr.provider';

/** Production-safe placeholder until an OCR vendor is configured. */
@Injectable()
export class UnconfiguredPrescriptionOcrProvider implements PrescriptionOcrProvider {
  extract(): Promise<PrescriptionOcrResult> {
    throw new PrescriptionOcrUnavailableError(
      'No prescription OCR provider is configured',
    );
  }
}
