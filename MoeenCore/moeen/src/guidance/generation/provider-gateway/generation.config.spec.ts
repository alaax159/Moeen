import { GENERATION_CONFIG_DEFAULTS } from './generation.config';
import { testGenerationConfig } from './provider-gateway.fixtures';

describe('GenerationConfig', () => {
  it('runs on defaults when nothing is set', () => {
    const config = testGenerationConfig();

    expect(config.enabled).toBe(true);
    expect(config.providerName).toBe('stub');
    expect(config.timeoutMs).toBe(
      GENERATION_CONFIG_DEFAULTS.GENERATION_TIMEOUT_MS,
    );
    expect(config.maxAttempts).toBe(2);
    expect(config.patientRateLimit).toBe(10);
    expect(config.foundryDeployment).toBe('gpt-5.4-mini');
  });

  it('defaults to the stub, so a fresh checkout cannot call a real provider by accident', () => {
    expect(GENERATION_CONFIG_DEFAULTS.GENERATION_PROVIDER).toBe('stub');
    expect(
      testGenerationConfig({ GENERATION_PROVIDER: 'anything-else' })
        .providerName,
    ).toBe('stub');
    expect(
      testGenerationConfig({ GENERATION_PROVIDER: 'FOUNDRY' }).providerName,
    ).toBe('foundry');
  });

  it('reads the kill switch from the usual spellings', () => {
    for (const off of ['false', '0', 'no', 'off', 'FALSE']) {
      expect(testGenerationConfig({ GENERATION_ENABLED: off }).enabled).toBe(
        false,
      );
    }
    for (const on of ['true', '1', 'yes', 'on']) {
      expect(testGenerationConfig({ GENERATION_ENABLED: on }).enabled).toBe(
        true,
      );
    }
  });

  it('falls back to the default rather than reading an unparseable kill switch as on', () => {
    // "disabled" is a plausible thing for someone to type into GENERATION_ENABLED
    // meaning off. It is not a boolean we recognise, and guessing either way
    // would be worse than using the documented default.
    expect(
      testGenerationConfig({ GENERATION_ENABLED: 'disabled' }).enabled,
    ).toBe(true);
    expect(testGenerationConfig({ GENERATION_ENABLED: '' }).enabled).toBe(true);
  });

  it('ignores values that would disable calling entirely and uses the default instead', () => {
    // maxAttempts of 0 would mean "never call the provider", which is the kill
    // switch's job — a typo in a retry setting must not silently become one.
    expect(
      testGenerationConfig({ GENERATION_MAX_ATTEMPTS: 0 }).maxAttempts,
    ).toBe(2);
    expect(testGenerationConfig({ GENERATION_TIMEOUT_MS: -1 }).timeoutMs).toBe(
      15_000,
    );
    expect(
      testGenerationConfig({ GENERATION_TIMEOUT_MS: 'not-a-number' }).timeoutMs,
    ).toBe(15_000);
  });

  it('accepts overrides as strings, the way an environment supplies them', () => {
    const config = testGenerationConfig({
      GENERATION_TIMEOUT_MS: '2500',
      GENERATION_PATIENT_RATE_LIMIT: '3',
    });

    expect(config.timeoutMs).toBe(2500);
    expect(config.patientRateLimit).toBe(3);
  });

  it('trims a trailing slash off the Foundry endpoint so the built URL is never doubled', () => {
    const config = testGenerationConfig({
      FOUNDRY_ENDPOINT: 'https://moeen.services.ai.azure.com/',
    });

    expect(config.foundryEndpoint).toBe('https://moeen.services.ai.azure.com');
  });
});
