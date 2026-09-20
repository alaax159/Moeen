import { Module } from '@nestjs/common';

import {
  DeterministicEmbeddingProvider,
  EMBEDDING_PROVIDER,
} from './embedding-provider';
import { LabelChunkRepository } from './label-chunk.repository';
import { LabelProcessingService } from './label-processing.service';

@Module({
  providers: [
    LabelChunkRepository,
    LabelProcessingService,
    // Only real EmbeddingProvider today — no vendor/model has been chosen
    // yet (open item since Day Zero). Swapping in a real one only means
    // changing this binding.
    { provide: EMBEDDING_PROVIDER, useClass: DeterministicEmbeddingProvider },
  ],
  // EMBEDDING_PROVIDER is exported alongside the service so CX-2's
  // retriever (context/retriever/) can embed query text with the same
  // provider label ingestion uses, instead of standing up a second binding.
  exports: [LabelProcessingService, EMBEDDING_PROVIDER],
})
export class LabelProcessingModule {}
