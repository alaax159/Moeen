import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import DocumentIntelligence, {
  type AnalyzeDocumentFromStreamLogicalResponse,
  getLongRunningPoller,
  isUnexpected,
} from '@azure-rest/ai-document-intelligence';
import {
  PrescriptionOcrProvider,
  PrescriptionOcrResult,
  PrescriptionOcrTimeoutError,
  PrescriptionOcrUnavailableError,
} from './prescription-ocr.provider';

const AZURE_READ_MODEL = 'prebuilt-read';
const DEFAULT_TIMEOUT_MS = 30_000;

type SupportedMimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

interface AzureAnalysisResponse {
  body?: {
    analyzeResult?: {
      content?: unknown;
    };
  };
}

export interface AzureAnalysisPoller {
  pollUntilDone(options?: {
    abortSignal?: AbortSignal;
  }): Promise<AzureAnalysisResponse>;
}

export interface AzureDocumentIntelligenceClient {
  beginAnalyze(
    modelId: string,
    file: Buffer,
    mimeType: SupportedMimeType,
    abortSignal: AbortSignal,
  ): Promise<AzureAnalysisPoller>;
}

interface AzureProviderError {
  azureCode?: string;
  code?: string;
  name?: string;
  status?: number;
  statusCode?: number;
}

interface ThenableAzureAnalysisPoller<TResult> {
  pollUntilDone(options?: { abortSignal?: AbortSignal }): Promise<TResult>;
  then?: unknown;
}

class AzureDocumentIntelligenceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly azureCode?: string,
  ) {
    super('Azure Document Intelligence request failed');
    this.name = AzureDocumentIntelligenceHttpError.name;
  }
}

@Injectable()
export class AzureDocumentIntelligencePrescriptionOcrProvider implements PrescriptionOcrProvider {
  private readonly logger = new Logger(
    AzureDocumentIntelligencePrescriptionOcrProvider.name,
  );

  constructor(
    private readonly config: ConfigService,
    private readonly client: AzureDocumentIntelligenceClient,
  ) {}

  async extract(
    file: Buffer,
    mimeType: string,
  ): Promise<PrescriptionOcrResult> {
    const controller = new AbortController();
    let timedOut = false;
    let stage: 'initial_analyze' | 'polling' = 'initial_analyze';
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs());

    try {
      const poller = await this.client.beginAnalyze(
        AZURE_READ_MODEL,
        file,
        mimeType as SupportedMimeType,
        controller.signal,
      );
      stage = 'polling';
      const response = await poller.pollUntilDone({
        abortSignal: controller.signal,
      });
      const content = response.body?.analyzeResult?.content;

      if (typeof content !== 'string') {
        throw new Error(
          'Azure Document Intelligence returned a malformed response',
        );
      }

      return { text: content };
    } catch (error) {
      this.logSafeDiagnostic(error, stage, timedOut);
      if (timedOut || this.isTimeout(error)) {
        throw new PrescriptionOcrTimeoutError();
      }
      if (this.isUnavailable(error)) {
        throw new PrescriptionOcrUnavailableError();
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private logSafeDiagnostic(
    error: unknown,
    stage: 'initial_analyze' | 'polling',
    timedOut: boolean,
  ): void {
    const providerError = error as AzureProviderError;
    const httpStatusCode = providerError?.status ?? providerError?.statusCode;
    const azureErrorCode = providerError?.azureCode ?? providerError?.code;

    this.logger.error({
      errorName:
        typeof providerError?.name === 'string'
          ? providerError.name
          : 'UnknownError',
      ...(httpStatusCode === undefined ? {} : { httpStatusCode }),
      ...(azureErrorCode === undefined ? {} : { azureErrorCode }),
      safeMessage: this.safeMessage(error, timedOut),
      stage,
      ...(error instanceof TypeError
        ? { typeErrorMessage: error.message }
        : {}),
    });
  }

  private safeMessage(error: unknown, timedOut: boolean): string {
    const providerError = error as AzureProviderError;
    const status = providerError?.status ?? providerError?.statusCode;

    if (timedOut || this.isTimeout(error)) {
      return 'Azure Document Intelligence operation timed out';
    }
    if (status === 401) {
      return 'Azure Document Intelligence authentication failed';
    }
    if (status === 403) {
      return 'Azure Document Intelligence authorization failed';
    }
    if (this.isUnavailable(error)) {
      return 'Azure Document Intelligence service or network is unavailable';
    }
    if (error instanceof AzureDocumentIntelligenceHttpError) {
      return 'Azure Document Intelligence rejected the analyze request';
    }
    if (
      error instanceof Error &&
      error.message.includes('malformed response')
    ) {
      return 'Azure Document Intelligence returned an invalid response';
    }
    return 'Azure Document Intelligence SDK operation failed';
  }

  private timeoutMs(): number {
    const configured = Number(
      this.config.get('AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS'),
    );
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_TIMEOUT_MS;
  }

  private isTimeout(error: unknown): boolean {
    const providerError = error as AzureProviderError;
    return (
      providerError?.name === 'AbortError' ||
      providerError?.code === 'ETIMEDOUT' ||
      providerError?.status === 408 ||
      providerError?.statusCode === 408
    );
  }

  private isUnavailable(error: unknown): boolean {
    const providerError = error as AzureProviderError;
    const status = providerError?.status ?? providerError?.statusCode;
    return (
      status === 401 ||
      status === 403 ||
      status === 429 ||
      (status !== undefined && status >= 500) ||
      providerError?.code === 'ENOTFOUND' ||
      providerError?.code === 'ECONNREFUSED' ||
      providerError?.code === 'ECONNRESET' ||
      providerError?.code === 'REQUEST_SEND_ERROR'
    );
  }
}

export function createAzureDocumentIntelligenceClient(
  endpoint: string,
  key: string,
): AzureDocumentIntelligenceClient {
  const sdkClient = DocumentIntelligence(endpoint, { key });
  return {
    async beginAnalyze(modelId, file, mimeType, abortSignal) {
      const initialResponse = await sdkClient
        .path('/documentModels/{modelId}:analyze', modelId)
        .post({
          contentType: mimeType,
          body: file,
          abortSignal,
        });

      if (isUnexpected(initialResponse)) {
        throw new AzureDocumentIntelligenceHttpError(
          Number(initialResponse.status),
          initialResponse.body?.error?.code,
        );
      }

      const poller =
        getLongRunningPoller<AnalyzeDocumentFromStreamLogicalResponse>(
          sdkClient,
          initialResponse,
        );

      return wrapAzureAnalysisPoller(poller);
    },
  };
}

export function wrapAzureAnalysisPoller(
  poller: ThenableAzureAnalysisPoller<unknown>,
): AzureAnalysisPoller {
  return {
    pollUntilDone: async (options) =>
      (await poller.pollUntilDone(options)) as AzureAnalysisResponse,
  };
}
