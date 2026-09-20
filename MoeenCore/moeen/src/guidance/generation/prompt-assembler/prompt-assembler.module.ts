import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../database/database.module';
import { ASSEMBLER_PORT } from '../../orchestrator/assembler.port';
import { PromptAssembler } from './prompt-assembler.service';
import { PromptAssemblyStage } from './prompt-assembly.stage';
import { TemplateLoader } from './template-loader.service';
import { TemplateRenderer } from './template-renderer.service';
import { ScopeFormatter } from './scope-formatter.service';
import { ChunkFormatter } from './chunk-formatter.service';
import { PROMPT_ASSEMBLER_PORT } from './prompt-assembler.port';

/**
 * The assemble stage, whole.
 *
 * PROMPT_ASSEMBLER_PORT is the pure formatter; ASSEMBLER_PORT is what the
 * orchestrator injects. Both are exported so a test can drive the formatter
 * directly without the database, while the production pipeline can only reach
 * it through the stage — which is the thing that supplies the redaction
 * subject the gateway needs.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    TemplateLoader,
    TemplateRenderer,
    ScopeFormatter,
    ChunkFormatter,
    { provide: PROMPT_ASSEMBLER_PORT, useClass: PromptAssembler },
    { provide: ASSEMBLER_PORT, useClass: PromptAssemblyStage },
  ],
  exports: [PROMPT_ASSEMBLER_PORT, ASSEMBLER_PORT],
})
export class PromptAssemblerModule {}
