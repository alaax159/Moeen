import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrescriptionFileValidationPipe } from './prescription-file-validation.pipe';
import { PrescriptionUpload } from './prescription-upload';

function file(mimetype: string, contents = 'prescription'): PrescriptionUpload {
  const buffer = Buffer.from(contents);
  return { mimetype, buffer, size: buffer.length };
}

describe('PrescriptionFileValidationPipe', () => {
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  const pipe = new PrescriptionFileValidationPipe(config);

  it.each(['image/jpeg', 'image/png', 'application/pdf'])(
    'accepts %s',
    (mimeType) => {
      const uploaded = file(mimeType);
      expect(pipe.transform(uploaded)).toBe(uploaded);
    },
  );

  it('rejects a request without a file', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });

  it('rejects an empty file', () => {
    expect(() => pipe.transform(file('image/jpeg', ''))).toThrow(
      BadRequestException,
    );
  });

  it('rejects an unsupported MIME type', () => {
    expect(() => pipe.transform(file('text/plain'))).toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('uses the configured maximum file size', () => {
    const limitedConfig = {
      get: jest.fn().mockReturnValue('2'),
    } as unknown as ConfigService;
    const limitedPipe = new PrescriptionFileValidationPipe(limitedConfig);

    expect(() => limitedPipe.transform(file('image/png', 'abc'))).toThrow(
      PayloadTooLargeException,
    );
  });
});
