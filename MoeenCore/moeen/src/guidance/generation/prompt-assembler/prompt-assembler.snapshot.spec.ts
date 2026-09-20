import { PromptAssembler } from './prompt-assembler.service';
import { TemplateLoader } from './template-loader.service';
import { TemplateRenderer } from './template-renderer.service';
import { ScopeFormatter } from './scope-formatter.service';
import { ChunkFormatter } from './chunk-formatter.service';
import type { AssemblePromptInput } from './prompt-assembler.port';
import {
  patientScopeFixtures,
  retrievalResultFixtures,
  safetyCheckResultFixtures,
} from '../../__fixtures__';
import type { GuidanceIntent } from '../../contracts';

/**
 * Full-text snapshots of every prompt this service can produce, both evidence
 * variants of each template.
 *
 * These exist so a wording change cannot land unnoticed. Any edit to a
 * template, a partial or a formatter shows up here as a reviewable diff in the
 * pull request — which matters more than usual, because the diff is the only
 * place a reviewer can see that, say, the referral line went missing.
 *
 * If a snapshot fails: read the diff before running with -u. If the change was
 * intended, updating the snapshot IS the sign-off, and the diff is what Salam
 * and Islam review.
 */
const ALL_INTENTS: GuidanceIntent[] = [
  'missed_dose',
  'explain_finding',
  'medication_question',
];

function makeAssembler(): PromptAssembler {
  return new PromptAssembler(
    new TemplateLoader(),
    new TemplateRenderer(),
    new ScopeFormatter(),
    new ChunkFormatter(),
  );
}

/** Fixed inputs so a snapshot diff is always a prompt change, never a fixture change. */
function makeInput(
  intent: GuidanceIntent,
  withEvidence: boolean,
): AssemblePromptInput {
  return {
    intent,
    scope: patientScopeFixtures.interactionCase,
    retrieval: withEvidence
      ? retrievalResultFixtures.found
      : retrievalResultFixtures.noEvidence,
    severity: safetyCheckResultFixtures.moderateInteraction.severity,
    question: 'Is it safe to take these two together?',
    // interactionCase sets subjectMedicationId 101, which the flow resolves to
    // warfarin. Supplied here so the snapshots show the normal path rather than
    // the unresolved fallback.
    subjectMedicationName: 'warfarin',
  };
}

describe('assembled prompt snapshots', () => {
  const assembler = makeAssembler();

  describe.each(ALL_INTENTS)('%s', (intent) => {
    it('with evidence', () => {
      const prompt = assembler.assemble(makeInput(intent, true));

      expect({
        promptVersion: prompt.promptVersion,
        variant: prompt.variant,
        suppliedCitationIds: prompt.suppliedCitationIds,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
      }).toMatchSnapshot();
    });

    it('with no evidence', () => {
      const prompt = assembler.assemble(makeInput(intent, false));

      expect({
        promptVersion: prompt.promptVersion,
        variant: prompt.variant,
        suppliedCitationIds: prompt.suppliedCitationIds,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
      }).toMatchSnapshot();
    });
  });
});
