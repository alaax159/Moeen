import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';

import { FoundryLlmProvider } from './foundry-llm.provider';
import { LlmProviderError } from './llm-provider.error';
import {
  promptPayload,
  testGenerationConfig,
} from './provider-gateway.fixtures';

/**
 * Every call here goes to a mocked HttpService. No test in this suite — or any
 * other — is permitted to reach a real provider: it would cost money, leak the
 * prompt off the machine, and fail in CI where no key exists.
 */
const CONFIGURED = {
  FOUNDRY_ENDPOINT: 'https://moeen.services.ai.azure.com',
  FOUNDRY_API_KEY: 'test-key',
  FOUNDRY_DEPLOYMENT: 'o4-mini',
  FOUNDRY_API_VERSION: '2024-12-01-preview',
};

function buildProvider(overrides: Record<string, string> = {}) {
  const post = jest.fn();
  const http = { post } as unknown as HttpService;
  const provider = new FoundryLlmProvider(
    http,
    testGenerationConfig({ ...CONFIGURED, ...overrides }),
  );

  return { provider, post };
}

function options() {
  return { signal: new AbortController().signal, maxOutputTokens: 700 };
}

interface SentBody {
  messages: Array<{ role: string; content: string }>;
  max_completion_tokens: number;
}

interface SentConfig {
  headers: Record<string, string>;
  signal: AbortSignal;
}

/** The three arguments the adapter handed to HttpService.post, typed so assertions stay checked. */
function sentRequest(post: jest.Mock): [string, SentBody, SentConfig] {
  return post.mock.calls[0] as [string, SentBody, SentConfig];
}

function axiosFailure(status: number, data: unknown): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      status,
      statusText: '',
      data,
      headers: {},
      config: { headers: new AxiosHeaders() },
    },
  );
}

function completion(overrides: Record<string, unknown> = {}) {
  return {
    model: 'o4-mini-2025-04-16',
    choices: [
      {
        finish_reason: 'stop',
        message: { content: '{"text":"ok","citationIds":[]}' },
      },
    ],
    usage: { prompt_tokens: 812, completion_tokens: 143 },
    ...overrides,
  };
}

describe('FoundryLlmProvider', () => {
  it('posts to the deployment chat-completions endpoint with the api-key header', async () => {
    const { provider, post } = buildProvider();
    post.mockReturnValue(of({ data: completion() }));

    await provider.generate(
      promptPayload({ systemPrompt: 'S', userPrompt: 'U' }),
      options(),
    );

    const [url, body, config] = sentRequest(post);

    expect(url).toBe(
      'https://moeen.services.ai.azure.com/openai/deployments/o4-mini/chat/completions?api-version=2024-12-01-preview',
    );
    expect(config.headers['api-key']).toBe('test-key');
    expect(body.messages).toEqual([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' },
    ]);
  });

  it('sends only the two prompt strings — nothing else from the payload can reach the provider', async () => {
    const { provider, post } = buildProvider();
    post.mockReturnValue(of({ data: completion() }));

    await provider.generate(promptPayload(), options());

    const [, body] = sentRequest(post);
    expect(Object.keys(body).sort()).toEqual([
      'max_completion_tokens',
      'messages',
    ]);
  });

  it('caps output with max_completion_tokens, which the reasoning deployments require', async () => {
    const { provider, post } = buildProvider();
    post.mockReturnValue(of({ data: completion() }));

    await provider.generate(promptPayload(), {
      signal: new AbortController().signal,
      maxOutputTokens: 256,
    });

    const [, body] = sentRequest(post);
    expect(body.max_completion_tokens).toBe(256);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('passes the abort signal through, so an abandoned call actually stops', async () => {
    const { provider, post } = buildProvider();
    post.mockReturnValue(of({ data: completion() }));
    const controller = new AbortController();

    await provider.generate(promptPayload(), {
      signal: controller.signal,
      maxOutputTokens: 700,
    });

    const [, , config] = sentRequest(post);
    expect(config.signal).toBe(controller.signal);
  });

  it('returns the completion text with its token usage', async () => {
    const { provider, post } = buildProvider();
    post.mockReturnValue(of({ data: completion() }));

    const result = await provider.generate(promptPayload(), options());

    expect(result.text).toBe('{"text":"ok","citationIds":[]}');
    expect(result.usage).toEqual({ promptTokens: 812, completionTokens: 143 });
    expect(result.model).toBe('o4-mini-2025-04-16');
  });

  it('reports zero usage rather than failing when the provider omits it', async () => {
    const { provider, post } = buildProvider();
    post.mockReturnValue(of({ data: completion({ usage: undefined }) }));

    const result = await provider.generate(promptPayload(), options());

    expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  describe('error classification', () => {
    it('marks 5xx transient', async () => {
      const { provider, post } = buildProvider();
      post.mockReturnValue(
        throwError(() =>
          axiosFailure(503, { error: { message: 'overloaded' } }),
        ),
      );

      const error = (await provider
        .generate(promptPayload(), options())
        .catch((e: unknown) => e)) as LlmProviderError;

      expect(error).toBeInstanceOf(LlmProviderError);
      expect(error.transient).toBe(true);
      expect(error.status).toBe(503);
    });

    it('marks a transport fault with no response transient', async () => {
      const { provider, post } = buildProvider();
      post.mockReturnValue(
        throwError(() => new AxiosError('socket hang up', 'ECONNRESET')),
      );

      const error = (await provider
        .generate(promptPayload(), options())
        .catch((e: unknown) => e)) as LlmProviderError;

      expect(error.transient).toBe(true);
      expect(error.status).toBeUndefined();
    });

    it('marks every 4xx permanent, 429 included', async () => {
      for (const status of [400, 401, 403, 404, 429]) {
        const { provider, post } = buildProvider();
        post.mockReturnValue(
          throwError(() =>
            axiosFailure(status, { error: { message: 'nope' } }),
          ),
        );

        const error = (await provider
          .generate(promptPayload(), options())
          .catch((e: unknown) => e)) as LlmProviderError;

        expect(error.transient).toBe(false);
        expect(error.refused).toBe(false);
      }
    });

    it('marks a content-filter rejection as a refusal, not an outage', async () => {
      const { provider, post } = buildProvider();
      post.mockReturnValue(
        throwError(() =>
          axiosFailure(400, {
            error: { code: 'content_filter', message: 'blocked' },
          }),
        ),
      );

      const error = (await provider
        .generate(promptPayload(), options())
        .catch((e: unknown) => e)) as LlmProviderError;

      expect(error.refused).toBe(true);
      expect(error.transient).toBe(false);
    });

    it('treats a content_filter finish reason on a 200 as a refusal too', async () => {
      const { provider, post } = buildProvider();
      post.mockReturnValue(
        of({
          data: completion({
            choices: [
              { finish_reason: 'content_filter', message: { content: '' } },
            ],
          }),
        }),
      );

      const error = (await provider
        .generate(promptPayload(), options())
        .catch((e: unknown) => e)) as LlmProviderError;

      expect(error.refused).toBe(true);
    });

    it('treats an empty completion as transient', async () => {
      const { provider, post } = buildProvider();
      post.mockReturnValue(
        of({
          data: completion({
            choices: [{ finish_reason: 'stop', message: { content: '' } }],
          }),
        }),
      );

      const error = (await provider
        .generate(promptPayload(), options())
        .catch((e: unknown) => e)) as LlmProviderError;

      expect(error.transient).toBe(true);
    });

    it('fails permanently, without a request, when the endpoint or key is missing', async () => {
      const { provider, post } = buildProvider({ FOUNDRY_API_KEY: '' });

      const error = (await provider
        .generate(promptPayload(), options())
        .catch((e: unknown) => e)) as LlmProviderError;

      expect(error.transient).toBe(false);
      expect(error.message).toContain('FOUNDRY_ENDPOINT or FOUNDRY_API_KEY');
      expect(post).not.toHaveBeenCalled();
    });
  });
});
