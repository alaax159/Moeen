import { Module } from '@nestjs/common';

import { AuditWriterModule } from '../audit/audit-writer.module';
import { PatientScopeBuilderModule } from '../context/scope-builder/patient-scope-builder.module';
import { RetrieverModule } from '../context/retriever/retriever.module';
import { PromptAssemblerModule } from '../generation/prompt-assembler/prompt-assembler.module';
import { ProviderGatewayModule } from '../generation/provider-gateway/provider-gateway.module';
import { ResponseFinalizerModule } from '../generation/response-finalizer/response-finalizer.module';
import { IntentRegistry } from './intent-registry';
import { PipelineOrchestrator } from './pipeline-orchestrator.service';
import { FallbackRendererModule } from '../generation/fallback-renderer/fallback-renderer.module';

/**
 * Every stage of the pipeline, bound to its real implementation.
 *
 * The three ports the orchestrator owns are each provided by the module that
 * implements them, not re-declared here:
 *
 *   ASSEMBLER_PORT   PromptAssemblerModule  (PromptAssemblyStage)
 *   VALIDATOR_PORT   ResponseFinalizerModule (ResponseFinalizer)
 *   AUDIT_HOOK_PORT  AuditWriterModule       (DrizzleAuditWriter)
 *
 * They were previously bound to NotImplementedAssembler, NotImplementedValidator
 * and NoopAuditHook while those stories were in flight, which meant every real
 * run threw at the assemble stage and no run was ever audited. The stubs are
 * kept in not-implemented-stage.stubs.ts for tests that want a deliberately
 * failing stage; nothing in the production graph binds them any more.
 */
@Module({
  imports: [
    ProviderGatewayModule,
    PatientScopeBuilderModule,
    RetrieverModule,
    PromptAssemblerModule,
    ResponseFinalizerModule,
    AuditWriterModule,
    FallbackRendererModule,
  ],
  providers: [IntentRegistry, PipelineOrchestrator],
  exports: [PipelineOrchestrator],
})
export class OrchestratorModule {}
