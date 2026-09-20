import { Test } from '@nestjs/testing';

import { AppModule } from './app.module';
import { PipelineOrchestrator } from './guidance/orchestrator/pipeline-orchestrator.service';

jest.setTimeout(120000);

/**
 * The cheapest test that would have caught the guidance layer being built but
 * not plugged in.
 *
 * Every stage of the pipeline had unit tests and passed them; what nothing
 * asserted was that the application actually reaches those stages. A module
 * that is never imported has no failing test — it simply does nothing, which
 * is how PromptAssemblerModule, ResponseFinalizerModule and AuditWriterModule
 * all stayed orphaned while their stories read as done.
 *
 * Compiling the real AppModule does not open a database or Redis connection —
 * both are lazy — so this stays a wiring test, not an integration one.
 */
describe('AppModule', () => {
  it('compiles the full DI graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  it('can resolve the guidance pipeline from the running application', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(
      moduleRef.get(PipelineOrchestrator, { strict: false }),
    ).toBeInstanceOf(PipelineOrchestrator);

    await moduleRef.close();
  });
});
