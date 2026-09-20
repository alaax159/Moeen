import { Inject, Injectable, Logger } from '@nestjs/common';
import { RxNormService } from '../medication-safety/rxnorm/rxnorm.service';
import { PrescriptionMedicationDraftDto } from './dto/prescription-medication-draft.dto';
import {
  ParsedPrescriptionMedication,
  PRESCRIPTION_MEDICATION_PARSER,
  PrescriptionMedicationParser,
} from './prescription-medication-parser';

export class PrescriptionMedicationParserOutputError extends Error {
  constructor() {
    super('Prescription medication parser returned invalid output');
    this.name = 'PrescriptionMedicationParserOutputError';
  }
}

@Injectable()
export class PrescriptionMedicationParsingService {
  private readonly logger = new Logger(
    PrescriptionMedicationParsingService.name,
  );

  constructor(
    @Inject(PRESCRIPTION_MEDICATION_PARSER)
    private readonly parser: PrescriptionMedicationParser,
    private readonly rxNorm: RxNormService,
  ) {}

  async parseAndNormalize(
    ocrText: string,
  ): Promise<PrescriptionMedicationDraftDto[]> {
    const parsed = this.parser.parse(ocrText);
    if (!this.isValidParserOutput(parsed)) {
      throw new PrescriptionMedicationParserOutputError();
    }
    return Promise.all(parsed.map((item) => this.normalize(item)));
  }

  private async normalize(
    item: ParsedPrescriptionMedication,
  ): Promise<PrescriptionMedicationDraftDto> {
    const { requiresReview = false, ...draft } = item;
    let rxcui: string | null = null;
    let normalizedName: string | null = null;

    try {
      const resolution = await this.rxNorm.resolveMedication(item.name, null);
      if (resolution.status === 'resolved') {
        rxcui = resolution.rxcui;
        const ingredientNames = await this.rxNorm.getIngredientNames(rxcui);
        if (ingredientNames.length === 1) normalizedName = ingredientNames[0];
      }
    } catch {
      this.logger.warn('RxNorm normalization failed for a prescription item');
    }

    return {
      ...draft,
      rxcui,
      normalizedName,
      needsReview: requiresReview || !rxcui || !normalizedName,
    };
  }

  private isValidParserOutput(
    value: unknown,
  ): value is ParsedPrescriptionMedication[] {
    return (
      Array.isArray(value) &&
      value.length <= 50 &&
      value.every(
        (item) =>
          this.isRecord(item) &&
          typeof item.name === 'string' &&
          item.name.trim().length > 0 &&
          (item.dose === null ||
            (typeof item.dose === 'number' &&
              Number.isFinite(item.dose) &&
              item.dose > 0)) &&
          (item.unit === null || typeof item.unit === 'string') &&
          (item.dosageForm === null || typeof item.dosageForm === 'string') &&
          (item.frequency === null || typeof item.frequency === 'string') &&
          (item.duration === null || typeof item.duration === 'string') &&
          Array.isArray(item.times) &&
          item.times.every((time) => typeof time === 'string') &&
          (item.instructions === null ||
            typeof item.instructions === 'string') &&
          (item.requiresReview === undefined ||
            typeof item.requiresReview === 'boolean'),
      )
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
