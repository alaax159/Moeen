import { Injectable } from '@nestjs/common';
import { GenerationConfig } from './generation.config';
import {
  LlmGenerateOptions,
  LlmGenerationResult,
  LlmProviderPort,
} from './llm-provider.port';
import { PromptPayload } from './prompt-payload';

/**
 * A queued outcome for the next generate() call. Tests use these to drive the
 * gateway's resilience paths — timeout, retry, breaker — without a network and
 * without a real provider.
 */
export type StubScriptStep =
  | { kind: 'reply'; text: string }
  | { kind: 'error'; error: Error }
  /** Never settles on its own; rejects when the executor's timeout aborts it. Drives the timeout path. */
  | { kind: 'hang' };

/** GN-1's templates require exactly this envelope. The stub honours it so downstream code sees real shapes. */
export interface StubReplyEnvelope {
  text: string;
  citationIds: string[];
  grounding: Array<{ claim: string; citationIds: string[] }>;
}

const CITATION_ID_PATTERN = /\[citation id:\s*([^\]]+?)\s*\]/g;

const CANNED_WITH_EVIDENCE =
  'Thanks for checking — this is a sensible thing to ask about. ' +
  'Here is what the reference material for your medicine says about why it is used and what to watch for, in plain terms. ' +
  'Whether anything about your medicines should change is a decision for your doctor or pharmacist, so please ask them. ' +
  'And if you feel unwell or something is worrying you, medical help is available now.';

const CANNED_NO_EVIDENCE =
  'Thanks for checking — this is a sensible thing to ask about. ' +
  'I do not have reference information I can rely on for this one, so I am not going to guess at it. ' +
  'Your doctor or pharmacist can answer it properly, and any decision about your medicines is theirs to make. ' +
  'And if you feel unwell or something is worrying you, medical help is available now.';

/**
 * The provider the whole team develops against.
 *
 * This is a deliverable, not a test double kept in a spec file: set
 * GENERATION_PROVIDER=stub and the entire pipeline runs end to end with no
 * Foundry account, no key, no cost and no network. Salam's orchestrator and
 * Islam's retrieval work against it exactly as they would against the real
 * adapter, because it is the same interface.
 *
 * Its canned answers deliberately obey the GN-1 constraints — no dose number,
 * no frequency, no diagnosis, referral line present, citation ids echoed only
 * from what was actually supplied. Working against output that would fail
 * GN-3's validator would teach the team the wrong shape.
 */
@Injectable()
export class StubLlmProvider implements LlmProviderPort {
  readonly name = 'stub';

  private readonly script: StubScriptStep[] = [];
  /** Redacted prompts the stub was handed, for assertions. Never logged. */
  readonly received: PromptPayload[] = [];

  constructor(private readonly config: GenerationConfig) {}

  /** Queue outcomes for the next calls. Once drained, the canned behaviour resumes. */
  enqueue(...steps: StubScriptStep[]): this {
    this.script.push(...steps);
    return this;
  }

  /** Queue the same outcome `times` times — one call per breaker-threshold step. */
  enqueueRepeated(step: StubScriptStep, times: number): this {
    for (let i = 0; i < times; i += 1) this.script.push({ ...step });
    return this;
  }

  reset(): this {
    this.script.length = 0;
    this.received.length = 0;
    return this;
  }

  async generate(
    prompt: PromptPayload,
    options: LlmGenerateOptions,
  ): Promise<LlmGenerationResult> {
    this.received.push(prompt);

    const step = this.script.shift();

    if (step?.kind === 'error') {
      throw step.error;
    }

    if (step?.kind === 'hang') {
      return this.hangUntilAborted(options.signal);
    }

    await this.simulateLatency(options.signal);

    const text = step?.kind === 'reply' ? step.text : this.cannedReply(prompt);

    return {
      text,
      usage: {
        promptTokens: estimateTokens(prompt.systemPrompt + prompt.userPrompt),
        completionTokens: estimateTokens(text),
      },
      model: 'stub-1',
    };
  }

  /**
   * Echoes back the citation ids GN-1 actually put in the prompt, and none
   * that it did not. That keeps a local run passing GN-3's citation rule
   * instead of tripping it on every request, while still refusing to invent
   * an id when no evidence was supplied.
   */
  private cannedReply(prompt: PromptPayload): string {
    const citationIds = extractCitationIds(prompt.userPrompt);
    const envelope: StubReplyEnvelope = {
      text: citationIds.length > 0 ? CANNED_WITH_EVIDENCE : CANNED_NO_EVIDENCE,
      citationIds,
      grounding: groundingFor(
        citationIds.length > 0 ? CANNED_WITH_EVIDENCE : CANNED_NO_EVIDENCE,
        citationIds,
      ),
    };

    return JSON.stringify(envelope);
  }

  private async simulateLatency(signal: AbortSignal): Promise<void> {
    const latencyMs = this.config.stubLatencyMs;
    if (latencyMs <= 0) return;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, latencyMs);

      function onAbort() {
        clearTimeout(timer);
        reject(new Error('stub call aborted'));
      }

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private hangUntilAborted(signal: AbortSignal): Promise<never> {
    return new Promise<never>((_resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('stub call aborted'));
        return;
      }
      signal.addEventListener(
        'abort',
        () => reject(new Error('stub call aborted')),
        { once: true },
      );
    });
  }
}

function groundingFor(
  text: string,
  citationIds: readonly string[],
): StubReplyEnvelope['grounding'] {
  const sentences =
    text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()) ??
    [];
  return sentences.map((claim) => ({
    claim,
    citationIds:
      citationIds.length > 0 && /reference material/i.test(claim)
        ? [...citationIds]
        : [],
  }));
}

export function extractCitationIds(userPrompt: string): string[] {
  const ids = new Set<string>();
  for (const match of userPrompt.matchAll(CITATION_ID_PATTERN)) {
    ids.add(match[1]);
  }
  return [...ids];
}

/** Deterministic on purpose — a stub whose token counts moved between runs would make usage assertions flaky. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
