import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { LabelProcessingModule } from '../../../knowledge/label-processing/label-processing.module';
import { RetrieverService } from './retriever.service';
import { RETRIEVER_PORT } from './retriever.port';

// ConfigModule is global in the real app (see app.module.ts), so this import
// is only load-bearing when RetrieverModule is compiled on its own — e.g. a
// module-boot test for anything that imports it transitively (OrchestratorModule,
// and in turn DL-3's GetExplanationModule). Same pattern already used by
// drug-allergy.module.ts for the same reason.
@Module({
  imports: [LabelProcessingModule, ConfigModule],
  providers: [{ provide: RETRIEVER_PORT, useClass: RetrieverService }],
  exports: [RETRIEVER_PORT],
})
export class RetrieverModule {}
