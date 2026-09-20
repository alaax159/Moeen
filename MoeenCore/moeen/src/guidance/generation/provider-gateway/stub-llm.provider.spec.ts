import { StubLlmProvider, StubReplyEnvelope } from './stub-llm.provider';
import { LlmProviderError } from './llm-provider.error';
import {
  promptPayload,
  testGenerationConfig,
} from './provider-gateway.fixtures';

function options() {
  return { signal: new AbortController().signal, maxOutputTokens: 700 };
}

describe('StubLlmProvider', () => {
  let stub: StubLlmProvider;

  beforeEach(() => {
    stub = new StubLlmProvider(testGenerationConfig());
  });

  it('answers through the same interface as the real adapter: text plus token usage', async () => {
    const result = await stub.generate(promptPayload(), options());

    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
    expect(result.model).toBe('stub-1');
  });

  it('returns the JSON envelope the GN-1 templates ask the model for', async () => {
    const result = await stub.generate(promptPayload(), options());
    const envelope = JSON.parse(result.text) as StubReplyEnvelope;

    expect(typeof envelope.text).toBe('string');
    expect(Array.isArray(envelope.citationIds)).toBe(true);
    expect(Array.isArray(envelope.grounding)).toBe(true);
  });

  it('cites only ids that were actually supplied in the prompt', async () => {
    const prompt = promptPayload({
      userPrompt: [
        '[citation id: chunk-warfarin-interactions-01]',
        'Text about the medicine.',
        '',
        '[citation id: chunk-aspirin-warnings-01]',
        'More text.',
      ].join('\n'),
    });

    const result = await stub.generate(prompt, options());
    const envelope = JSON.parse(result.text) as StubReplyEnvelope;

    expect(envelope.citationIds).toEqual([
      'chunk-warfarin-interactions-01',
      'chunk-aspirin-warnings-01',
    ]);
    expect(
      envelope.grounding.filter((claim) => claim.citationIds.length > 0),
    ).toEqual([
      expect.objectContaining({
        citationIds: [
          'chunk-warfarin-interactions-01',
          'chunk-aspirin-warnings-01',
        ],
      }),
    ]);
  });

  it('cites nothing when no evidence was supplied, rather than inventing an id', async () => {
    const prompt = promptPayload({
      userPrompt: 'NONE. No reference excerpts were supplied for this request.',
    });

    const result = await stub.generate(prompt, options());
    const envelope = JSON.parse(result.text) as StubReplyEnvelope;

    expect(envelope.citationIds).toEqual([]);
    expect(
      envelope.grounding.every((claim) => claim.citationIds.length === 0),
    ).toBe(true);
    expect(envelope.text).toContain('do not have reference information');
  });

  it('produces canned text that stays inside the GN-1 constraints', async () => {
    const result = await stub.generate(promptPayload(), options());
    const envelope = JSON.parse(result.text) as StubReplyEnvelope;

    // The team develops against this text. If it carried a dose, a frequency
    // or no referral line, everyone downstream would be building against
    // output GN-3 is required to reject.
    expect(envelope.text).not.toMatch(/\d+\s?(mg|ml|mcg|g)\b/i);
    expect(envelope.text).not.toMatch(
      /once a day|twice daily|every \w+ hours/i,
    );
    expect(envelope.text).toMatch(/doctor or pharmacist/);
    expect(envelope.text).toMatch(/medical help is available now/);
  });

  it('is deterministic, so usage assertions cannot go flaky', async () => {
    const first = await stub.generate(promptPayload(), options());
    const second = await stub.generate(promptPayload(), options());

    expect(second.text).toBe(first.text);
    expect(second.usage).toEqual(first.usage);
  });

  it('records the prompts it was handed, so a spec can assert on what reached the provider', async () => {
    await stub.generate(promptPayload({ systemPrompt: 'S1' }), options());

    expect(stub.received).toHaveLength(1);
    expect(stub.received[0].systemPrompt).toBe('S1');
  });

  describe('scripted outcomes', () => {
    it('throws the queued error, then returns to canned behaviour once drained', async () => {
      stub.enqueue({
        kind: 'error',
        error: LlmProviderError.transientFailure('provider down', 503),
      });

      await expect(stub.generate(promptPayload(), options())).rejects.toThrow(
        'provider down',
      );
      await expect(
        stub.generate(promptPayload(), options()),
      ).resolves.toHaveProperty('model', 'stub-1');
    });

    it('queues a repeated outcome, for driving a failure threshold', async () => {
      stub.enqueueRepeated({ kind: 'error', error: new Error('boom') }, 3);

      for (let i = 0; i < 3; i += 1) {
        await expect(stub.generate(promptPayload(), options())).rejects.toThrow(
          'boom',
        );
      }
      await expect(
        stub.generate(promptPayload(), options()),
      ).resolves.toBeDefined();
    });

    it('hangs until the caller aborts, so the timeout path can be driven without a real wait', async () => {
      stub.enqueue({ kind: 'hang' });
      const controller = new AbortController();

      const pending = stub.generate(promptPayload(), {
        signal: controller.signal,
        maxOutputTokens: 700,
      });
      controller.abort();

      await expect(pending).rejects.toThrow('stub call aborted');
    });

    it('returns a queued reply verbatim', async () => {
      stub.enqueue({
        kind: 'reply',
        text: '{"text":"scripted","citationIds":[]}',
      });

      const result = await stub.generate(promptPayload(), options());

      expect(result.text).toBe('{"text":"scripted","citationIds":[]}');
    });
  });

  it('sleeps for the configured latency and gives it up when aborted', async () => {
    const slow = new StubLlmProvider(
      testGenerationConfig({ GENERATION_STUB_LATENCY_MS: 5_000 }),
    );
    const controller = new AbortController();

    const pending = slow.generate(promptPayload(), {
      signal: controller.signal,
      maxOutputTokens: 700,
    });
    controller.abort();

    await expect(pending).rejects.toThrow('stub call aborted');
  });
});
