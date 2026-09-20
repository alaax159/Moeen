import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Which LlmProvider the gateway binds. This is the single config key that
 * switches the whole app between the real provider and the stub — nothing
 * else needs to change, no code edit, no test flag.
 */
export type LlmProviderName = 'stub' | 'foundry';

/**
 * Every knob GN-2 introduces, with its default, in one place. Kept as a
 * literal object rather than scattered `?? 5000` expressions so the answer
 * to "what can be tuned and what happens if I tune nothing" is one file.
 */
export const GENERATION_CONFIG_DEFAULTS = {
  /** Kill switch. false disables generative output entirely; the pipeline still answers. */
  GENERATION_ENABLED: true,
  GENERATION_PROVIDER: 'stub' as LlmProviderName,

  /** Per-attempt wall clock. Exceeding it is a typed failure, never a thrown error. */
  GENERATION_TIMEOUT_MS: 15_000,
  /** 2 = one initial attempt plus one retry. Clamped to at least 1. */
  GENERATION_MAX_ATTEMPTS: 2,
  GENERATION_RETRY_DELAY_MS: 250,
  GENERATION_MAX_OUTPUT_TOKENS: 700,

  /** Consecutive qualifying failures that open the breaker. */
  GENERATION_BREAKER_FAILURE_THRESHOLD: 5,
  /** How long the breaker stays open before it allows one probe through. */
  GENERATION_BREAKER_COOLDOWN_MS: 30_000,
  /** Probe successes needed to close a half-open breaker. */
  GENERATION_BREAKER_PROBE_SUCCESSES: 1,

  GENERATION_PATIENT_RATE_LIMIT: 10,
  GENERATION_PATIENT_RATE_WINDOW_MS: 60_000,
  GENERATION_GLOBAL_RATE_LIMIT: 300,
  GENERATION_GLOBAL_RATE_WINDOW_MS: 60_000,

  /** Artificial delay the stub sleeps for, so local work can feel a real call. */
  GENERATION_STUB_LATENCY_MS: 0,

  /** e.g. https://my-resource.services.ai.azure.com — no trailing slash needed. */
  FOUNDRY_ENDPOINT: '',
  FOUNDRY_API_KEY: '',
  /** The deployment name in Foundry, not the vendor model id. */
  FOUNDRY_DEPLOYMENT: 'gpt-5.4-mini',
  FOUNDRY_API_VERSION: '2024-12-01-preview',
} as const;

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

@Injectable()
export class GenerationConfig {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.bool('GENERATION_ENABLED');
  }

  get providerName(): LlmProviderName {
    const raw = this.string('GENERATION_PROVIDER').trim().toLowerCase();
    return raw === 'foundry' ? 'foundry' : 'stub';
  }

  get timeoutMs(): number {
    return this.positiveInt('GENERATION_TIMEOUT_MS');
  }

  /** At least 1 — a value of 0 would mean "never call the provider", which is what the kill switch is for. */
  get maxAttempts(): number {
    return Math.max(1, this.positiveInt('GENERATION_MAX_ATTEMPTS'));
  }

  get retryDelayMs(): number {
    return this.int('GENERATION_RETRY_DELAY_MS');
  }

  get maxOutputTokens(): number {
    return this.positiveInt('GENERATION_MAX_OUTPUT_TOKENS');
  }

  get breakerFailureThreshold(): number {
    return this.positiveInt('GENERATION_BREAKER_FAILURE_THRESHOLD');
  }

  get breakerCooldownMs(): number {
    return this.positiveInt('GENERATION_BREAKER_COOLDOWN_MS');
  }

  get breakerProbeSuccesses(): number {
    return this.positiveInt('GENERATION_BREAKER_PROBE_SUCCESSES');
  }

  get patientRateLimit(): number {
    return this.positiveInt('GENERATION_PATIENT_RATE_LIMIT');
  }

  get patientRateWindowMs(): number {
    return this.positiveInt('GENERATION_PATIENT_RATE_WINDOW_MS');
  }

  get globalRateLimit(): number {
    return this.positiveInt('GENERATION_GLOBAL_RATE_LIMIT');
  }

  get globalRateWindowMs(): number {
    return this.positiveInt('GENERATION_GLOBAL_RATE_WINDOW_MS');
  }

  get stubLatencyMs(): number {
    return this.int('GENERATION_STUB_LATENCY_MS');
  }

  get foundryEndpoint(): string {
    return this.string('FOUNDRY_ENDPOINT').replace(/\/+$/, '');
  }

  get foundryApiKey(): string {
    return this.string('FOUNDRY_API_KEY');
  }

  get foundryDeployment(): string {
    return this.string('FOUNDRY_DEPLOYMENT');
  }

  get foundryApiVersion(): string {
    return this.string('FOUNDRY_API_VERSION');
  }

  private raw(
    key: keyof typeof GENERATION_CONFIG_DEFAULTS,
  ): string | undefined {
    const value = this.config.get<string | number | boolean>(key);
    return value === undefined || value === null ? undefined : String(value);
  }

  private string(key: keyof typeof GENERATION_CONFIG_DEFAULTS): string {
    return this.raw(key) ?? String(GENERATION_CONFIG_DEFAULTS[key]);
  }

  private bool(key: keyof typeof GENERATION_CONFIG_DEFAULTS): boolean {
    const raw = this.raw(key)?.trim().toLowerCase();
    if (raw === undefined || raw === '') {
      return Boolean(GENERATION_CONFIG_DEFAULTS[key]);
    }
    if (TRUTHY.has(raw)) return true;
    if (FALSY.has(raw)) return false;
    // An unparseable kill switch must not silently read as "on". Anything we
    // cannot recognise falls back to the declared default, not to truthiness.
    return Boolean(GENERATION_CONFIG_DEFAULTS[key]);
  }

  private int(key: keyof typeof GENERATION_CONFIG_DEFAULTS): number {
    const fallback = Number(GENERATION_CONFIG_DEFAULTS[key]);
    const parsed = Number(this.raw(key));
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }

  private positiveInt(key: keyof typeof GENERATION_CONFIG_DEFAULTS): number {
    const value = this.int(key);
    return value > 0 ? value : Number(GENERATION_CONFIG_DEFAULTS[key]);
  }
}
