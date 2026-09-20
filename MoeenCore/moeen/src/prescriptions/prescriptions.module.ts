import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { MedicationsModule } from '../medications/medications.module';
import { RxNormModule } from '../medication-safety/rxnorm/rxnorm.module';
import { PrescriptionController } from './prescription.controller';
import {
  PrescriptionFileValidationPipe,
  prescriptionScanMaxFileSizeBytes,
} from './prescription-file-validation.pipe';
import { PRESCRIPTION_OCR_PROVIDER } from './prescription-ocr.provider';
import { PrescriptionConfirmationService } from './prescription-confirmation.service';
import { PrescriptionService } from './prescription.service';
import { DeterministicPrescriptionMedicationParser } from './deterministic-prescription-medication.parser';
import { PRESCRIPTION_MEDICATION_PARSER } from './prescription-medication-parser';
import { PrescriptionMedicationParsingService } from './prescription-medication-parsing.service';
import { PrescriptionUploadExceptionFilter } from './prescription-upload-exception.filter';
import { UnconfiguredPrescriptionOcrProvider } from './unconfigured-prescription-ocr.provider';
import {
  AzureDocumentIntelligencePrescriptionOcrProvider,
  createAzureDocumentIntelligenceClient,
} from './azure-document-intelligence-prescription-ocr.provider';

export function createPrescriptionOcrProvider(config: ConfigService) {
  const endpoint = config
    .get<string>('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')
    ?.trim();
  const key = config.get<string>('AZURE_DOCUMENT_INTELLIGENCE_KEY')?.trim();

  if (!endpoint || !key) {
    return new UnconfiguredPrescriptionOcrProvider();
  }

  return new AzureDocumentIntelligencePrescriptionOcrProvider(
    config,
    createAzureDocumentIntelligenceClient(endpoint, key),
  );
}

export function createPrescriptionMulterOptions(config: ConfigService) {
  return {
    limits: { fileSize: prescriptionScanMaxFileSizeBytes(config) },
  };
}

@Module({
  imports: [
    AuthModule,
    UsersModule,
    RxNormModule,
    MedicationsModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: createPrescriptionMulterOptions,
    }),
  ],
  controllers: [PrescriptionController],
  providers: [
    PrescriptionService,
    PrescriptionConfirmationService,
    PrescriptionFileValidationPipe,
    PrescriptionUploadExceptionFilter,
    DeterministicPrescriptionMedicationParser,
    PrescriptionMedicationParsingService,
    {
      provide: PRESCRIPTION_MEDICATION_PARSER,
      useExisting: DeterministicPrescriptionMedicationParser,
    },
    {
      provide: PRESCRIPTION_OCR_PROVIDER,
      inject: [ConfigService],
      useFactory: createPrescriptionOcrProvider,
    },
  ],
})
export class PrescriptionsModule {}
