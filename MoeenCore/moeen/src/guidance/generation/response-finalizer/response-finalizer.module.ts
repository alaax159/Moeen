import { Module } from '@nestjs/common';

import { VALIDATOR_PORT } from '../../orchestrator/validator.port';
import { FallbackRendererModule } from '../fallback-renderer/fallback-renderer.module';
import { ResponseValidatorModule } from '../response-validator/response-validator.module';
import { InMemoryRejectedCandidateStore } from './in-memory-rejected-candidate-store.service';
import { REJECTED_CANDIDATE_STORE } from './rejected-candidate-store.port';
import { ResponseFinalizer } from './response-finalizer.service';

/**
 * The validate stage, whole: rules, fallback and retention behind one
 * provider.
 *
 * The store binding is the line to change when the durable table lands — swap
 * InMemoryRejectedCandidateStore for the Drizzle store and nothing else in
 * this folder moves. See README.md for the table it needs.
 *
 * Exported through the orchestrator's VALIDATOR_PORT as well as by class so the
 * production pipeline cannot accidentally substitute the raw validator and
 * bypass deterministic fallback/context handling.
 */
@Module({
  imports: [ResponseValidatorModule, FallbackRendererModule],
  providers: [
    InMemoryRejectedCandidateStore,
    {
      provide: REJECTED_CANDIDATE_STORE,
      useExisting: InMemoryRejectedCandidateStore,
    },
    ResponseFinalizer,
    { provide: VALIDATOR_PORT, useExisting: ResponseFinalizer },
  ],
  exports: [ResponseFinalizer, REJECTED_CANDIDATE_STORE, VALIDATOR_PORT],
})
export class ResponseFinalizerModule {}
