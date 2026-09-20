import { PromptAssembler } from './prompt-assembler.service';
import { TemplateLoader } from './template-loader.service';
import { TemplateRenderer } from './template-renderer.service';
import { ScopeFormatter } from './scope-formatter.service';
import { ChunkFormatter } from './chunk-formatter.service';
import { PromptAssemblyFailedError } from './prompt-assembly-failed.error';
import { PROMPT_VERSION } from './prompt-version';
import type { AssemblePromptInput } from './prompt-assembler.port';
import {
  patientScopeFixtures,
  retrievalResultFixtures,
  retrievedChunkFixtures,
  safetyCheckResultFixtures,
} from '../../__fixtures__';
import type { GuidanceIntent, RetrievalResult } from '../../contracts';

function makeAssembler(): PromptAssembler {
  return new PromptAssembler(
    new TemplateLoader(),
    new TemplateRenderer(),
    new ScopeFormatter(),
    new ChunkFormatter(),
  );
}

function makeInput(
  overrides: Partial<AssemblePromptInput> = {},
): AssemblePromptInput {
  return {
    intent: 'explain_finding',
    scope: patientScopeFixtures.interactionCase,
    retrieval: retrievalResultFixtures.found,
    severity: safetyCheckResultFixtures.moderateInteraction.severity,
    ...overrides,
  };
}

const ALL_INTENTS: GuidanceIntent[] = [
  'missed_dose',
  'explain_finding',
  'medication_question',
];

describe('PromptAssembler', () => {
  let assembler: PromptAssembler;

  beforeEach(() => {
    assembler = makeAssembler();
  });

  describe('chunk injection', () => {
    it('puts every supplied citation id in front of the model', () => {
      const prompt = assembler.assemble(makeInput());

      expect(prompt.userPrompt).toContain(
        retrievedChunkFixtures.warfarinInteractions.citationId,
      );
      expect(prompt.userPrompt).toContain(
        retrievedChunkFixtures.aspirinWarnings.citationId,
      );
    });

    it('injects the chunk text alongside its id', () => {
      const prompt = assembler.assemble(makeInput());

      expect(prompt.userPrompt).toContain(
        retrievedChunkFixtures.warfarinInteractions.text,
      );
    });

    it('reports the supplied citation ids for the validator to check against', () => {
      const prompt = assembler.assemble(makeInput());

      expect(prompt.suppliedCitationIds).toEqual([
        retrievedChunkFixtures.warfarinInteractions.citationId,
        retrievedChunkFixtures.aspirinWarnings.citationId,
      ]);
    });

    it('does not leak the internal setId to the provider', () => {
      const prompt = assembler.assemble(makeInput());

      expect(prompt.userPrompt).not.toContain(
        retrievedChunkFixtures.warfarinInteractions.setId,
      );
    });
  });

  describe('the no-evidence variant', () => {
    it('instructs a refusal when the retriever signals no evidence', () => {
      const prompt = assembler.assemble(
        makeInput({ retrieval: retrievalResultFixtures.noEvidence }),
      );

      expect(prompt.variant).toBe('no-evidence');
      expect(prompt.systemPrompt).toContain(
        'No reference material was supplied',
      );
      expect(prompt.systemPrompt).toContain('Make no factual claim');
      expect(prompt.suppliedCitationIds).toEqual([]);
    });

    it('treats a found-but-empty chunk list as no evidence rather than assembling silently', () => {
      const emptyButFound: RetrievalResult = { found: true, chunks: [] };

      const prompt = assembler.assemble(
        makeInput({ retrieval: emptyButFound }),
      );

      expect(prompt.variant).toBe('no-evidence');
      expect(prompt.systemPrompt).toContain(
        'No reference material was supplied',
      );
    });

    it('never leaves the evidence directive slot empty in the with-evidence case', () => {
      const prompt = assembler.assemble(makeInput());

      expect(prompt.variant).toBe('with-evidence');
      expect(prompt.systemPrompt).toContain(
        'Reference material was supplied for this request',
      );
    });

    it('still lets the model explain findings when there is no evidence', () => {
      const prompt = assembler.assemble(
        makeInput({ retrieval: retrievalResultFixtures.noEvidence }),
      );

      expect(prompt.userPrompt).toContain(
        safetyCheckResultFixtures.moderateInteraction.findings[0].rationale,
      );
    });
  });

  describe('prompt versioning', () => {
    it.each(ALL_INTENTS)('stamps a version for %s', (intent) => {
      const prompt = assembler.assemble(makeInput({ intent }));

      expect(prompt.promptVersion).toContain(PROMPT_VERSION);
      expect(prompt.promptVersion).toContain(intent);
      expect(prompt.promptVersion).toContain('with-evidence');
    });

    it('stamps the two evidence variants of one template differently', () => {
      const withEvidence = assembler.assemble(makeInput());
      const withoutEvidence = assembler.assemble(
        makeInput({ retrieval: retrievalResultFixtures.noEvidence }),
      );

      expect(withEvidence.promptVersion).not.toBe(
        withoutEvidence.promptVersion,
      );
      expect(withoutEvidence.promptVersion).toContain('no-evidence');
    });

    it('stamps different intents differently', () => {
      const missedDose = assembler.assemble(
        makeInput({ intent: 'missed_dose' }),
      );
      const explainFinding = assembler.assemble(
        makeInput({ intent: 'explain_finding' }),
      );

      expect(missedDose.promptVersion).not.toBe(explainFinding.promptVersion);
    });

    it('is stable across repeated assembly of the same inputs', () => {
      expect(assembler.assemble(makeInput()).promptVersion).toBe(
        makeAssembler().assemble(makeInput()).promptVersion,
      );
    });
  });

  describe('constraints reach every assembled prompt', () => {
    it.each(ALL_INTENTS)(
      '%s carries the shared constraint block in its system prompt',
      (intent) => {
        const prompt = assembler.assemble(makeInput({ intent }));

        expect(prompt.systemPrompt).toContain('You never prescribe');
        expect(prompt.systemPrompt).toContain('Never diagnose');
        expect(prompt.systemPrompt).toContain('doctor or pharmacist');
      },
    );

    it.each(ALL_INTENTS)(
      '%s leaves no unrendered placeholder in either half',
      (intent) => {
        const prompt = assembler.assemble(makeInput({ intent }));

        expect(prompt.systemPrompt).not.toMatch(/\{\{/);
        expect(prompt.userPrompt).not.toMatch(/\{\{/);
      },
    );
  });

  describe('scope rendering', () => {
    it('lists medications by ingredient name', () => {
      const prompt = assembler.assemble(makeInput());

      expect(prompt.userPrompt).toContain('warfarin');
      expect(prompt.userPrompt).toContain('aspirin');
    });

    it('does not put dosing frequency or schedule slots in front of the model', () => {
      const prompt = assembler.assemble(
        makeInput({ scope: patientScopeFixtures.interactionCase }),
      );

      expect(prompt.userPrompt).not.toContain('20:00');
      expect(prompt.userPrompt).not.toContain('08:00');
    });

    it('renders the pre-resolved severity rather than recomputing one', () => {
      const prompt = assembler.assemble(
        makeInput({ intent: 'explain_finding', severity: 'contraindicated' }),
      );

      expect(prompt.userPrompt).toContain('contraindicated');
    });

    it('says so explicitly when a patient has no findings, instead of rendering a blank', () => {
      const prompt = assembler.assemble(
        makeInput({ scope: patientScopeFixtures.singleMedicationClear }),
      );

      expect(prompt.userPrompt).toContain('No safety findings were raised');
    });

    it('names the subject medicine when the caller resolved it', () => {
      const prompt = assembler.assemble(
        makeInput({ intent: 'missed_dose', subjectMedicationName: 'warfarin' }),
      );

      expect(prompt.userPrompt).toContain('warfarin');
      expect(prompt.userPrompt).not.toContain('could not identify');
    });

    it.each(['missed_dose', 'medication_question'] as GuidanceIntent[])(
      '%s receives the resolved subject medicine, not a placeholder',
      (intent) => {
        const prompt = assembler.assemble(
          makeInput({ intent, subjectMedicationName: 'amoxicillin' }),
        );

        expect(prompt.userPrompt).toContain('amoxicillin');
      },
    );

    it('says so plainly when the caller could not resolve the subject medicine', () => {
      const prompt = assembler.assemble(
        makeInput({ intent: 'missed_dose', subjectMedicationName: undefined }),
      );

      expect(prompt.userPrompt).toContain('could not identify');
    });

    it('treats a blank resolved name as unresolved rather than rendering an empty gap', () => {
      const prompt = assembler.assemble(
        makeInput({ intent: 'missed_dose', subjectMedicationName: '   ' }),
      );

      expect(prompt.userPrompt).toContain('could not identify');
    });

    it('renders the patient question for medication_question', () => {
      const prompt = assembler.assemble(
        makeInput({
          intent: 'medication_question',
          question: 'Can I take this with food?',
        }),
      );

      expect(prompt.userPrompt).toContain('Can I take this with food?');
    });
  });

  describe('failing loud', () => {
    it('throws rather than assembling a prompt from an unregistered intent', () => {
      expect(() =>
        assembler.assemble(
          makeInput({ intent: 'not_an_intent' as GuidanceIntent }),
        ),
      ).toThrow(PromptAssemblyFailedError);
    });

    it('throws when a template asks for a placeholder that has no value', () => {
      const renderer = new TemplateRenderer();

      expect(() => renderer.render('Allergies: {{allergies}}', {})).toThrow(
        PromptAssemblyFailedError,
      );
    });
  });
});
