import {
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  PrescriptionOcrTimeoutError,
  PrescriptionOcrUnavailableError,
} from './prescription-ocr.provider';
import { PrescriptionService } from './prescription.service';
import { PrescriptionUpload } from './prescription-upload';

const uploadedFile = {
  buffer: Buffer.from('binary prescription'),
  mimetype: 'image/jpeg',
} as PrescriptionUpload;

const draftItem = {
  name: 'Amoxicillin',
  dose: 500,
  unit: 'mg',
  dosageForm: null,
  frequency: null,
  duration: null,
  times: [],
  instructions: null,
  rxcui: '723',
  normalizedName: 'amoxicillin',
  needsReview: false,
};

function serviceWith(provider: { extract: jest.Mock }, items = [draftItem]) {
  const medicationParsing = {
    parseAndNormalize: jest.fn().mockResolvedValue(items),
  };
  return {
    service: new PrescriptionService(provider, medicationParsing as never),
    medicationParsing,
  };
}

describe('PrescriptionService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('calls OCR and returns its result', async () => {
    const provider = {
      extract: jest.fn().mockResolvedValue({
        text: '  Amoxicillin 500 mg  ',
        confidence: 0.91,
      }),
    };
    const { service, medicationParsing } = serviceWith(provider);

    await expect(service.scanPrescription(uploadedFile)).resolves.toEqual({
      status: 'draft',
      ocr: { text: 'Amoxicillin 500 mg', confidence: 0.91 },
      items: [draftItem],
    });
    expect(provider.extract).toHaveBeenCalledWith(
      uploadedFile.buffer,
      'image/jpeg',
    );
    expect(medicationParsing.parseAndNormalize).toHaveBeenCalledWith(
      'Amoxicillin 500 mg',
    );
  });

  it('omits confidence when the provider does not return one', async () => {
    const { service } = serviceWith({
      extract: jest.fn().mockResolvedValue({ text: 'Readable text' }),
    });
    await expect(service.scanPrescription(uploadedFile)).resolves.toEqual({
      status: 'draft',
      ocr: { text: 'Readable text' },
      items: [draftItem],
    });
  });

  it('rejects empty OCR text', async () => {
    const { service } = serviceWith({
      extract: jest.fn().mockResolvedValue({ text: '   ' }),
    });
    await expect(service.scanPrescription(uploadedFile)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it.each([
    [new PrescriptionOcrUnavailableError(), ServiceUnavailableException],
    [new PrescriptionOcrTimeoutError(), GatewayTimeoutException],
    [new Error('vendor secret'), BadGatewayException],
  ])('translates provider failure %#', async (failure, expected) => {
    const { service } = serviceWith({
      extract: jest.fn().mockRejectedValue(failure),
    });
    await expect(service.scanPrescription(uploadedFile)).rejects.toThrow(
      expected,
    );
  });

  it('rejects OCR text that contains no identifiable medications', async () => {
    const { service } = serviceWith(
      { extract: jest.fn().mockResolvedValue({ text: 'Clinic header' }) },
      [],
    );

    await expect(service.scanPrescription(uploadedFile)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('sanitizes structural parser failures', async () => {
    const medicationParsing = {
      parseAndNormalize: jest.fn().mockRejectedValue(new Error('model secret')),
    };
    const service = new PrescriptionService(
      { extract: jest.fn().mockResolvedValue({ text: 'Drug 5 mg' }) },
      medicationParsing as never,
    );

    await expect(service.scanPrescription(uploadedFile)).rejects.toThrow(
      BadGatewayException,
    );
  });
});
