import { PromptPayload } from './prompt-payload';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmGenerationResult {
  /**
   * Raw model output, exactly as returned. The GN-1 templates ask for a JSON
   * object; parsing and validating it is GN-3's job, not this port's. An
   * adapter that "helpfully" parsed here would be deciding what a valid
   * response looks like at the wrong layer.
   */
  text: string;
  usage: TokenUsage;
  /** What actually answered — the deployment or model id the provider reports back. */
  model: string;
}

export interface LlmGenerateOptions {
  /**
   * Aborted by the executor when the timeout fires. An adapter must pass this
   * to its transport so an abandoned call stops consuming a socket, rather
   * than being merely ignored.
   */
  signal: AbortSignal;
  maxOutputTokens: number;
}

/**
 * The network boundary — the only interface that puts bytes on the wire to a
 * model provider. ProviderGateway is the only class permitted to hold a
 * reference to it; see provider-gateway.module.ts (which never exports
 * LLM_PROVIDER) and provider-gateway.architecture.spec.ts (which fails the
 * build if any file outside this folder mentions the token).
 *
 * Implementations receive an already-redacted payload. They do not redact, and
 * they must not log the prompt.
 */
export interface LlmProviderPort {
  /** Identifies the binding in logs and in the guidance_call trail. */
  readonly name: string;

  generate(
    prompt: PromptPayload,
    options: LlmGenerateOptions,
  ): Promise<LlmGenerationResult>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
