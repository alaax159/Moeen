import {
  Global,
  Inject,
  Injectable,
  LoggerService,
  Module,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { DRIZZLE } from '../../../database/database.constants';
import { ProviderGatewayModule } from './provider-gateway.module';
import { LLM_PROVIDER, LlmProviderPort } from './llm-provider.port';
import {
  PROVIDER_GATEWAY_PORT,
  ProviderGatewayPort,
} from './provider-gateway.port';
import { promptPayload } from './provider-gateway.fixtures';

/** Nest prints a large banner when a dependency cannot be resolved; one spec expects exactly that. */
const SILENT_LOGGER: LoggerService = {
  log: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
  verbose: () => undefined,
};

function infraModule(env: Record<string, string>) {
  @Global()
  @Module({
    providers: [
      { provide: DRIZZLE, useValue: {} },
      {
        provide: ConfigService,
        useValue: { get: (key: string) => env[key] },
      },
    ],
    exports: [DRIZZLE, ConfigService],
  })
  class TestInfraModule {}

  return TestInfraModule;
}

async function compile(env: Record<string, string> = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [infraModule(env), ProviderGatewayModule],
  }).compile();

  return moduleRef;
}

describe('ProviderGatewayModule', () => {
  it('wires a gateway that answers, with no environment configured at all', async () => {
    const moduleRef = await compile();
    const gateway = moduleRef.get<ProviderGatewayPort>(PROVIDER_GATEWAY_PORT);

    const result = await gateway.dispatch(promptPayload(), {});

    expect(result.outcome).toBe('generated');
    await moduleRef.close();
  });

  it('switches provider on one config key, with no code change', async () => {
    const onStub = await compile();
    const onFoundry = await compile({ GENERATION_PROVIDER: 'foundry' });

    // strict: false because LLM_PROVIDER is intentionally not exported — only
    // a file inside this folder is allowed to reach it, and only a test does.
    const stub = onStub.get<LlmProviderPort>(LLM_PROVIDER, { strict: false });
    const foundry = onFoundry.get<LlmProviderPort>(LLM_PROVIDER, {
      strict: false,
    });

    expect(stub.name).toBe('stub');
    expect(foundry.name).toBe('foundry');

    await onStub.close();
    await onFoundry.close();
  });

  it('defaults to the stub, so a checkout with no keys cannot call a real provider', async () => {
    const moduleRef = await compile();

    const provider = moduleRef.get<LlmProviderPort>(LLM_PROVIDER, {
      strict: false,
    });

    expect(provider.name).toBe('stub');
    await moduleRef.close();
  });

  describe('what a consuming module can reach', () => {
    function consumerModule(token: symbol) {
      @Injectable()
      class Consumer {
        constructor(@Inject(token) readonly dependency: unknown) {}
      }

      @Module({ imports: [ProviderGatewayModule], providers: [Consumer] })
      class ConsumerModule {}

      return Test.createTestingModule({
        imports: [infraModule({}), ConsumerModule],
      })
        .setLogger(SILENT_LOGGER)
        .compile();
    }

    it('can inject the gateway port', async () => {
      const moduleRef = await consumerModule(PROVIDER_GATEWAY_PORT);

      expect(moduleRef.get(PROVIDER_GATEWAY_PORT)).toBeDefined();
      await moduleRef.close();
    });

    it('cannot inject the raw provider, because the module never exports it', async () => {
      // Module encapsulation is the first line of defence: a second call site
      // cannot quietly reach past the gateway, because Nest will not resolve a
      // provider that is not exported. The architecture spec is the backstop
      // for code that skips DI entirely.
      await expect(consumerModule(LLM_PROVIDER)).rejects.toThrow(
        /Nest can't resolve dependencies/,
      );
    });
  });
});
