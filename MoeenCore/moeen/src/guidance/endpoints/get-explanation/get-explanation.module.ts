import { Module } from '@nestjs/common';

import { SafetyResultAdapterModule } from '../../adapters/safety-result-adapter/safety-result-adapter.module';
import { OrchestratorModule } from '../../orchestrator/orchestrator.module';
import { FallbackRendererModule } from '../../generation/fallback-renderer/fallback-renderer.module';
import { CitationResolver } from './citation-resolver.service';
import { FindingExplanationCacheRepository } from './finding-explanation-cache.repository';
import { GetExplanationController } from './get-explanation.controller';
import { GetExplanationService } from './get-explanation.service';

@Module({
  imports: [
    SafetyResultAdapterModule,
    OrchestratorModule,
    FallbackRendererModule,
  ],
  controllers: [GetExplanationController],
  providers: [
    GetExplanationService,
    FindingExplanationCacheRepository,
    CitationResolver,
  ],
})
export class GetExplanationModule {}
