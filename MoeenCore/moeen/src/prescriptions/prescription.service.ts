import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrescriptionScanResponseDto } from './dto/prescription-scan-response.dto';
import {
  PrescriptionMedicationParserOutputError,
  PrescriptionMedicationParsingService,
} from './prescription-medication-parsing.service';
import {
  PRESCRIPTION_OCR_PROVIDER,
  PrescriptionOcrProvider,
  PrescriptionOcrTimeoutError,
  PrescriptionOcrUnavailableError,
} from './prescription-ocr.provider';
import { PrescriptionUpload } from './prescription-upload';

@Injectable()
export class PrescriptionService {
  private readonly logger = new Logger(PrescriptionService.name);

  constructor(
    @Inject(PRESCRIPTION_OCR_PROVIDER)
    private readonly ocrProvider: PrescriptionOcrProvider,
    private readonly medicationParsing: PrescriptionMedicationParsingService,
  ) {}

  async scanPrescription(
    file: PrescriptionUpload,
  ): Promise<PrescriptionScanResponseDto> {
    let result;
    try {
      result = await this.ocrProvider.extract(file.buffer, file.mimetype);
    } catch (error) {
      if (error instanceof PrescriptionOcrTimeoutError) {
        this.logger.warn('Prescription OCR provider timed out');
        throw new GatewayTimeoutException('Prescription OCR timed out');
      }
      if (error instanceof PrescriptionOcrUnavailableError) {
        this.logger.warn('Prescription OCR provider is unavailable');
        throw new ServiceUnavailableException(
          'Prescription OCR is temporarily unavailable',
        );
      }
      this.logger.error('Unexpected prescription OCR provider failure');
      throw new BadGatewayException('Prescription OCR failed');
    }

    const text = result.text?.trim();
    if (!text) {
      throw new UnprocessableEntityException(
        'No readable text was found in the prescription',
      );
    }

    let items;
    try {
      items = await this.medicationParsing.parseAndNormalize(text);
    } catch (error) {
      if (error instanceof PrescriptionMedicationParserOutputError) {
        this.logger.error(
          'Prescription medication parser returned invalid output',
        );
        throw new BadGatewayException('Prescription parsing failed');
      }
      this.logger.error('Unexpected prescription medication parsing failure');
      throw new BadGatewayException('Prescription parsing failed');
    }

    if (items.length === 0) {
      throw new UnprocessableEntityException(
        'No medications could be identified in the prescription',
      );
    }

    return {
      status: 'draft',
      ocr: {
        text,
        ...(result.confidence === undefined
          ? {}
          : { confidence: result.confidence }),
      },
      items,
    };
  }
}
