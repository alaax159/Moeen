jest.mock('../auth/auth.module', () => ({ AuthModule: class AuthModule {} }));
jest.mock('../auth/firebase-auth.guard', () => ({
  FirebaseAuthGuard: class FirebaseAuthGuard {},
}));
jest.mock('../users/users.module', () => ({
  UsersModule: class UsersModule {},
}));
jest.mock('../users/user-sync.guard', () => ({
  UserSyncGuard: class UserSyncGuard {},
}));

import { ConfigService } from '@nestjs/config';
import { AzureDocumentIntelligencePrescriptionOcrProvider } from './azure-document-intelligence-prescription-ocr.provider';
import {
  createPrescriptionMulterOptions,
  createPrescriptionOcrProvider,
} from './prescriptions.module';
import { UnconfiguredPrescriptionOcrProvider } from './unconfigured-prescription-ocr.provider';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((name: string) => values[name]),
  } as unknown as ConfigService;
}

describe('createPrescriptionOcrProvider', () => {
  it.each([
    { AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://example.test' },
    { AZURE_DOCUMENT_INTELLIGENCE_KEY: 'key' },
  ])('uses the safe fallback when configuration is incomplete', (values) => {
    expect(createPrescriptionOcrProvider(config(values))).toBeInstanceOf(
      UnconfiguredPrescriptionOcrProvider,
    );
  });

  it('uses Azure Document Intelligence when configuration is complete', () => {
    expect(
      createPrescriptionOcrProvider(
        config({
          AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://example.test',
          AZURE_DOCUMENT_INTELLIGENCE_KEY: 'key',
        }),
      ),
    ).toBeInstanceOf(AzureDocumentIntelligencePrescriptionOcrProvider);
  });
});

describe('createPrescriptionMulterOptions', () => {
  it('uses the same configured maximum as prescription validation', () => {
    expect(
      createPrescriptionMulterOptions(
        config({ PRESCRIPTION_SCAN_MAX_FILE_SIZE_BYTES: '1234' }),
      ),
    ).toEqual({ limits: { fileSize: 1234 } });
  });
});
