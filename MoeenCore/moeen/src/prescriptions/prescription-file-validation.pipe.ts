import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  PipeTransform,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrescriptionUpload } from './prescription-upload';

export const PRESCRIPTION_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function prescriptionScanMaxFileSizeBytes(
  config: ConfigService,
): number {
  const configured = Number(
    config.get('PRESCRIPTION_SCAN_MAX_FILE_SIZE_BYTES'),
  );
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_FILE_SIZE_BYTES;
}

@Injectable()
export class PrescriptionFileValidationPipe implements PipeTransform<
  PrescriptionUpload,
  PrescriptionUpload
> {
  constructor(private readonly config: ConfigService) {}

  transform(file?: PrescriptionUpload): PrescriptionUpload {
    if (!file) {
      throw new BadRequestException('A prescription file is required');
    }
    if (file.size === 0 || file.buffer.length === 0) {
      throw new BadRequestException('The prescription file is empty');
    }
    if (!PRESCRIPTION_MIME_TYPES.includes(file.mimetype as never)) {
      throw new UnsupportedMediaTypeException(
        'Only JPEG, PNG, and PDF prescription files are supported',
      );
    }
    if (file.size > prescriptionScanMaxFileSizeBytes(this.config)) {
      throw new PayloadTooLargeException('The prescription file is too large');
    }
    return file;
  }
}
