import { ProviderGateway } from './provider-gateway.service';
import { GenerationConfig } from './generation.config';
import { CircuitBreaker } from './circuit-breaker.service';
import { GuidanceRateLimiter } from './guidance-rate-limiter.service';
import { LlmCallExecutor } from './llm-call-executor.service';
import { StubLlmProvider } from './stub-llm.provider';
import { Redactor } from '../../context/redactor/redactor.service';
import { RedactionSubject } from '../../context/redactor/redactor.port';
import {
  RecordingGuidanceCallRecorder,
  RecordingRedactionMetrics,
  testGenerationConfig,
} from './provider-gateway.fixtures';

/**
 * The PII test the gateway exists to satisfy: a payload seeded with a name, an
 * email, a phone number and a UUID must reach the provider carrying none of
 * them. Uses the real Redactor and the real gateway, with only the provider
 * itself replaced by the stub, so this proves the actual redaction behaviour
 * at the boundary it protects.
 */
describe('ProviderGateway PII boundary', () => {
  it('never lets a name, email, phone number or UUID reach the provider', async () => {
    const name = 'Jane Doe';
    const email = 'jane.doe@example.com';
    const phone = '(555) 123-4567';
    const uuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

    const subject: RedactionSubject = {
      fullName: name,
      firstName: 'Jane',
      lastName: 'Doe',
    };
    const payload = {
      systemPrompt: 'You explain. You never prescribe.',
      userPrompt: `${name} missed her dose. Reach her at ${email} or ${phone}. Ref ${uuid}.`,
    };

    const config: GenerationConfig = testGenerationConfig();
    const stub = new StubLlmProvider(config);
    const gateway = new ProviderGateway(
      new Redactor(),
      new RecordingRedactionMetrics(),
      config,
      new CircuitBreaker(config),
      new GuidanceRateLimiter(config),
      new LlmCallExecutor(stub, config),
      new RecordingGuidanceCallRecorder(),
    );

    await gateway.dispatch(payload, subject);

    expect(stub.received).toHaveLength(1);
    const received = JSON.stringify(stub.received[0]);

    expect(received).not.toContain(name);
    expect(received).not.toContain(email);
    expect(received).not.toContain(phone);
    expect(received).not.toContain(phone.replace(/\D/g, ''));
    expect(received).not.toContain(uuid);
  });
});
