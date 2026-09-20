import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { SAFETY_RESULT_PORT } from '../adapters/safety-result-adapter/safety-result-adapter.port';
import { RETRIEVER_PORT } from '../context/retriever/retriever.port';
import { PATIENT_SCOPE_BUILDER_PORT } from '../context/scope-builder/patient-scope-builder.port';
import { PROVIDER_GATEWAY_PORT } from '../generation/provider-gateway/provider-gateway.port';
import { ASSEMBLER_PORT } from './assembler.port';
import { AUDIT_HOOK_PORT } from './audit-hook.port';
import { OrchestratorModule } from './orchestrator.module';
import { PipelineOrchestrator } from './pipeline-orchestrator.service';
import { VALIDATOR_PORT } from './validator.port';

describe('OrchestratorModule', () => {
  async function compile() {
    return Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), OrchestratorModule],
    }).compile();
  }

  it('resolves PipelineOrchestrator through the real Nest DI container', async () => {
    const moduleRef = await compile();

    expect(moduleRef.get(PipelineOrchestrator)).toBeInstanceOf(
      PipelineOrchestrator,
    );
  });

  /**
   * The regression this file exists for.
   *
   * Every one of these ports spent a period bound to a stub while its story
   * was in flight — NotImplementedAssembler, NotImplementedValidator and
   * NoopAuditHook — and because each stub satisfies its interface, nothing
   * failed to compile and no unit test noticed. The pipeline simply threw at
   * the assemble stage on every real run and audited nothing.
   *
   * Asserting the concrete class name is deliberately strict. A stub rebound
   * here should fail loudly rather than being caught in production.
   */
  it.each([
    [PATIENT_SCOPE_BUILDER_PORT, 'PatientScopeBuilder'],
    [SAFETY_RESULT_PORT, 'SafetyResultAdapter'],
    [RETRIEVER_PORT, 'RetrieverService'],
    [ASSEMBLER_PORT, 'PromptAssemblyStage'],
    [PROVIDER_GATEWAY_PORT, 'ProviderGateway'],
    [VALIDATOR_PORT, 'ResponseFinalizer'],
    [AUDIT_HOOK_PORT, 'DrizzleAuditWriter'],
  ])('binds a real implementation, not a stub (%s)', async (port, expected) => {
    const moduleRef = await compile();

    expect(moduleRef.get(port).constructor.name).toBe(expected);
  });
});
