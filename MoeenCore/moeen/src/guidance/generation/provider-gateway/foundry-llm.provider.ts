import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { GenerationConfig } from './generation.config';
import { LlmProviderError } from './llm-provider.error';
import {
  LlmGenerateOptions,
  LlmGenerationResult,
  LlmProviderPort,
} from './llm-provider.port';
import { PromptPayload } from './prompt-payload';

interface FoundryChatCompletionResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface FoundryErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

const CONTENT_FILTER_CODES = new Set([
  'content_filter',
  'ResponsibleAIPolicyViolation',
]);

/**
 * Microsoft Foundry (Azure AI Foundry) behind the LlmProvider interface.
 *
 * Calls the deployment's chat-completions endpoint. Only systemPrompt and
 * userPrompt leave this method — the gateway has already redacted them, and
 * nothing else from the payload is read, so nothing else can be sent.
 *
 * Nothing here retries, times itself out or counts failures. That is
 * LlmCallExecutor's job. This adapter's one extra responsibility is
 * classification: it is the only place that knows what a Foundry status code
 * means, and it converts that into the transient/permanent/refused decision
 * the executor acts on.
 */
@Injectable()
export class FoundryLlmProvider implements LlmProviderPort {
  readonly name = 'foundry';

  constructor(
    private readonly http: HttpService,
    private readonly config: GenerationConfig,
  ) {}

  async generate(
    prompt: PromptPayload,
    options: LlmGenerateOptions,
  ): Promise<LlmGenerationResult> {
    const endpoint = this.config.foundryEndpoint;
    const apiKey = this.config.foundryApiKey;

    if (!endpoint || !apiKey) {
      // A misconfiguration, not an outage — retrying it would just burn the
      // retry budget on a call that cannot be made.
      throw LlmProviderError.permanentFailure(
        'Foundry is selected but FOUNDRY_ENDPOINT or FOUNDRY_API_KEY is not set',
      );
    }

    const deployment = this.config.foundryDeployment;
    const url =
      `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions` +
      `?api-version=${encodeURIComponent(this.config.foundryApiVersion)}`;

    try {
      const response = await firstValueFrom(
        this.http.post<FoundryChatCompletionResponse>(
          url,
          {
            messages: [
              { role: 'system', content: prompt.systemPrompt },
              { role: 'user', content: prompt.userPrompt },
            ],
            // max_completion_tokens rather than max_tokens: the reasoning
            // deployments (the o-series) reject the older name, and the
            // newer one is accepted by the gpt-* deployments too. Temperature
            // is deliberately not sent — reasoning models reject it, and we do
            // not want a knob here that quietly changes safety behaviour.
            max_completion_tokens: options.maxOutputTokens,
          },
          {
            headers: {
              'api-key': apiKey,
              'Content-Type': 'application/json',
            },
            signal: options.signal,
          },
        ),
      );

      return this.toGenerationResult(response.data, deployment);
    } catch (error) {
      throw this.toProviderError(error);
    }
  }

  private toGenerationResult(
    body: FoundryChatCompletionResponse,
    deployment: string,
  ): LlmGenerationResult {
    const choice = body.choices?.[0];

    if (choice?.finish_reason === 'content_filter') {
      throw LlmProviderError.refusal(
        'Foundry content filter blocked the completion',
      );
    }

    const text = choice?.message?.content;

    if (typeof text !== 'string' || text.trim().length === 0) {
      // A 200 with nothing usable in it. Treated as transient because an empty
      // completion is most often a truncation or a transport hiccup, and one
      // more attempt is cheap; the breaker still sees it if it keeps happening.
      throw LlmProviderError.transientFailure(
        'Foundry returned no completion content',
      );
    }

    return {
      text,
      usage: {
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
      },
      model: body.model ?? deployment,
    };
  }

  private toProviderError(error: unknown): Error {
    if (error instanceof LlmProviderError) return error;

    if (!isAxiosError(error)) {
      return LlmProviderError.transientFailure(
        error instanceof Error ? error.message : 'unknown Foundry failure',
        undefined,
        error,
      );
    }

    const status = error.response?.status;

    if (status === undefined) {
      // No response at all: DNS, connection reset, socket timeout, abort.
      return LlmProviderError.transientFailure(
        `Foundry request failed without a response (${error.code ?? 'no code'})`,
        undefined,
        error,
      );
    }

    const body = error.response?.data as FoundryErrorBody | undefined;
    const code = body?.error?.code;
    const message = body?.error?.message ?? error.message;

    if (code && CONTENT_FILTER_CODES.has(code)) {
      return LlmProviderError.refusal(
        `Foundry refused the request: ${message}`,
        status,
        error,
      );
    }

    if (status >= 500) {
      return LlmProviderError.transientFailure(
        `Foundry returned ${status}: ${message}`,
        status,
        error,
      );
    }

    // Every 4xx is permanent, 429 included. Resending identical bytes to a
    // provider that just told us we are over quota does not make us under
    // quota — it makes the next patient wait for a second doomed call. Our own
    // rate limits are what keep us under the provider's; if 429s show up in
    // guidance_call, the fix is to lower GENERATION_GLOBAL_RATE_LIMIT, not to
    // retry harder.
    return LlmProviderError.permanentFailure(
      `Foundry returned ${status}: ${message}`,
      status,
      error,
    );
  }
}
