jest.mock('../auth/firebase-auth.guard', () => ({
  FirebaseAuthGuard: class FirebaseAuthGuard {
    canActivate() {
      return true;
    }
  },
}));
jest.mock('../users/user-sync.guard', () => ({
  UserSyncGuard: class UserSyncGuard {
    canActivate() {
      return true;
    }
  },
}));

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrescriptionConfirmationService } from './prescription-confirmation.service';
import { PrescriptionController } from './prescription.controller';
import { PrescriptionFileValidationPipe } from './prescription-file-validation.pipe';
import { PrescriptionService } from './prescription.service';
import { PrescriptionUpload } from './prescription-upload';
import { PrescriptionUploadExceptionFilter } from './prescription-upload-exception.filter';

describe('PrescriptionController', () => {
  it('delegates the validated upload to the service', async () => {
    const response = { status: 'draft' as const, ocr: { text: 'Rx text' } };
    const service = {
      scanPrescription: jest.fn().mockResolvedValue(response),
    };
    const controller = new PrescriptionController(
      service as never,
      { confirmPrescription: jest.fn() } as never,
    );
    const file = { buffer: Buffer.from('file') } as PrescriptionUpload;

    await expect(controller.scan(file)).resolves.toBe(response);
    expect(service.scanPrescription).toHaveBeenCalledWith(file);
  });

  it('delegates confirmation to the confirmation service with the caller uid', async () => {
    const response = {
      addedCount: 1,
      blockedCount: 0,
      failedCount: 0,
      results: [],
    };
    const confirmationService = {
      confirmPrescription: jest.fn().mockResolvedValue(response),
    };
    const controller = new PrescriptionController(
      { scanPrescription: jest.fn() } as never,
      confirmationService as never,
    );
    const dto = { medications: [] } as never;

    await expect(controller.confirm('firebase-uid', dto)).resolves.toBe(
      response,
    );
    expect(confirmationService.confirmPrescription).toHaveBeenCalledWith(
      dto,
      'firebase-uid',
    );
  });
});

describe('PrescriptionController upload limit', () => {
  let app: INestApplication;
  let transform: jest.SpyInstance;
  const scanPrescription = jest.fn();

  beforeAll(async () => {
    transform = jest.spyOn(
      PrescriptionFileValidationPipe.prototype,
      'transform',
    );
    const moduleRef = await Test.createTestingModule({
      imports: [MulterModule.register({ limits: { fileSize: 4 } })],
      controllers: [PrescriptionController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 4) },
        },
        PrescriptionUploadExceptionFilter,
        PrescriptionFileValidationPipe,
        {
          provide: PrescriptionService,
          useValue: { scanPrescription },
        },
        {
          provide: PrescriptionConfirmationService,
          useValue: { confirmPrescription: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects an oversized upload before the validation pipe runs', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/prescriptions/scan')
      .attach('file', Buffer.from('12345'), {
        filename: 'prescription.jpg',
        contentType: 'image/jpeg',
      })
      .expect(413);

    expect(response.body).toEqual({
      statusCode: 413,
      message: 'The prescription file is too large',
      error: 'Payload Too Large',
    });
    expect(transform).not.toHaveBeenCalled();
    expect(scanPrescription).not.toHaveBeenCalled();
  });
});
