import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrescriptionOcrTimeoutError,
  PrescriptionOcrUnavailableError,
} from './prescription-ocr.provider';
import {
  AzureDocumentIntelligenceClient,
  AzureDocumentIntelligencePrescriptionOcrProvider,
  wrapAzureAnalysisPoller,
} from './azure-document-intelligence-prescription-ocr.provider';

function config(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((name: string) => values[name]),
  } as unknown as ConfigService;
}

function setup(
  pollUntilDone = jest
    .fn()
    .mockResolvedValue({ body: { analyzeResult: { content: 'OCR text' } } }),
  values: Record<string, string> = {},
) {
  const beginAnalyze = jest.fn().mockResolvedValue({ pollUntilDone });
  const client = { beginAnalyze } as AzureDocumentIntelligenceClient;
  const provider = new AzureDocumentIntelligencePrescriptionOcrProvider(
    config(values),
    client,
  );
  return { provider, beginAnalyze, pollUntilDone };
}

describe('AzureDocumentIntelligencePrescriptionOcrProvider', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each(['image/jpeg', 'image/png', 'application/pdf'])(
    'sends %s bytes to prebuilt-read and waits for completion',
    async (mimeType) => {
      const { provider, beginAnalyze, pollUntilDone } = setup();
      const file = Buffer.from('document bytes');

      await expect(provider.extract(file, mimeType)).resolves.toEqual({
        text: 'OCR text',
      });
      expect(beginAnalyze).toHaveBeenCalledWith(
        'prebuilt-read',
        file,
        mimeType,
        expect.any(AbortSignal),
      );
      expect(pollUntilDone).toHaveBeenCalledWith({
        abortSignal: expect.any(AbortSignal),
      });
    },
  );

  it('uses the configured timeout and aborts polling', async () => {
    jest.useFakeTimers();
    const pollUntilDone = jest.fn(
      ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const { provider } = setup(pollUntilDone, {
      AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS: '50',
    });

    const result = provider.extract(Buffer.from('file'), 'application/pdf');
    const expectation = expect(result).rejects.toThrow(
      PrescriptionOcrTimeoutError,
    );
    await jest.advanceTimersByTimeAsync(50);
    await expectation;
  });

  it.each([401, 403, 429, 500, 503])(
    'maps Azure HTTP status %s to unavailable',
    async (status) => {
      const beginAnalyze = jest.fn().mockRejectedValue({ status });
      const provider = new AzureDocumentIntelligencePrescriptionOcrProvider(
        config(),
        { beginAnalyze } as never,
      );
      await expect(
        provider.extract(Buffer.from('file'), 'image/jpeg'),
      ).rejects.toThrow(PrescriptionOcrUnavailableError);
    },
  );

  it.each(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET'])(
    'maps network error %s to unavailable',
    async (code) => {
      const beginAnalyze = jest.fn().mockRejectedValue({ code });
      const provider = new AzureDocumentIntelligencePrescriptionOcrProvider(
        config(),
        { beginAnalyze } as never,
      );
      await expect(
        provider.extract(Buffer.from('file'), 'image/png'),
      ).rejects.toThrow(PrescriptionOcrUnavailableError);
    },
  );

  it('returns empty content for PrescriptionService to handle', async () => {
    const { provider } = setup(
      jest.fn().mockResolvedValue({ body: { analyzeResult: { content: '' } } }),
    );
    await expect(
      provider.extract(Buffer.from('file'), 'image/jpeg'),
    ).resolves.toEqual({ text: '' });
  });

  it.each([
    {},
    { body: {} },
    { body: { analyzeResult: {} } },
    { body: { analyzeResult: { content: 42 } } },
  ])('rejects malformed Azure response %#', async (response) => {
    const { provider } = setup(jest.fn().mockResolvedValue(response));
    await expect(
      provider.extract(Buffer.from('file'), 'image/jpeg'),
    ).rejects.toThrow('malformed response');
  });

  it('passes unexpected failures through for service sanitization', async () => {
    const failure = new Error('SDK internal failure');
    const beginAnalyze = jest.fn().mockRejectedValue(failure);
    const provider = new AzureDocumentIntelligencePrescriptionOcrProvider(
      config(),
      { beginAnalyze } as never,
    );
    await expect(
      provider.extract(Buffer.from('sensitive'), 'image/jpeg'),
    ).rejects.toBe(failure);
  });

  it('logs only safe diagnostic fields and the failure stage', async () => {
    const sensitiveFailure = Object.assign(
      new Error(
        'request failed for https://secret.example with key and prescription text',
      ),
      { statusCode: 400, code: 'InvalidRequest' },
    );
    const beginAnalyze = jest.fn().mockRejectedValue(sensitiveFailure);
    const provider = new AzureDocumentIntelligencePrescriptionOcrProvider(
      config(),
      { beginAnalyze } as never,
    );

    await expect(
      provider.extract(Buffer.from('sensitive file'), 'image/jpeg'),
    ).rejects.toBe(sensitiveFailure);

    expect(Logger.prototype.error).toHaveBeenCalledWith({
      errorName: 'Error',
      httpStatusCode: 400,
      azureErrorCode: 'InvalidRequest',
      safeMessage: 'Azure Document Intelligence SDK operation failed',
      stage: 'initial_analyze',
    });
    expect(
      JSON.stringify((Logger.prototype.error as jest.Mock).mock.calls),
    ).not.toContain('secret.example');
    expect(
      JSON.stringify((Logger.prototype.error as jest.Mock).mock.calls),
    ).not.toContain('sensitive file');
  });

  it('wraps the SDK thenable poller without awaiting it as a Promise', async () => {
    const finalResponse = {
      body: { analyzeResult: { content: 'OCR text' } },
    };
    const sdkPoller = Object.assign(Promise.resolve(finalResponse), {
      pollUntilDone: jest.fn().mockResolvedValue(finalResponse),
    });

    const wrappedPoller = wrapAzureAnalysisPoller(sdkPoller);

    expect('then' in wrappedPoller).toBe(false);
    await expect(wrappedPoller.pollUntilDone()).resolves.toBe(finalResponse);
    expect(sdkPoller.pollUntilDone).toHaveBeenCalledWith(undefined);
  });

  it('omits confidence when Azure has no document-level confidence', async () => {
    const { provider } = setup(
      jest.fn().mockResolvedValue({
        body: {
          analyzeResult: {
            content: 'Text',
            pages: [{ words: [{ confidence: 0.99 }] }],
          },
        },
      }),
    );
    await expect(
      provider.extract(Buffer.from('file'), 'image/jpeg'),
    ).resolves.toEqual({ text: 'Text' });
  });
});
