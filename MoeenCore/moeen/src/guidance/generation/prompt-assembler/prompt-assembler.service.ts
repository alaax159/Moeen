import { Injectable } from '@nestjs/common';
import type { GuidanceIntent, RetrievedChunk } from '../../contracts';
import {
  AssembledPrompt,
  AssemblePromptInput,
  PromptAssemblerPort,
  PromptVariant,
} from './prompt-assembler.port';
import { TemplateLoader } from './template-loader.service';
import { TemplateRenderer } from './template-renderer.service';
import { ScopeFormatter } from './scope-formatter.service';
import { ChunkFormatter } from './chunk-formatter.service';
import { buildPromptVersion, fingerprintTemplate } from './prompt-version';
import { PromptAssemblyFailedError } from './prompt-assembly-failed.error';

/** Template file name per intent. Exhaustive by type — a new intent will not compile until it has one. */
const TEMPLATE_BY_INTENT: Record<GuidanceIntent, string> = {
  missed_dose: 'missed_dose',
  explain_finding: 'explain_finding',
  medication_question: 'medication_question',
};

const NO_EVIDENCE_PARTIAL = '_no-evidence';
const EVIDENCE_SUPPLIED_PARTIAL = '_evidence-supplied';

@Injectable()
export class PromptAssembler implements PromptAssemblerPort {
  constructor(
    private readonly loader: TemplateLoader,
    private readonly renderer: TemplateRenderer,
    private readonly scopeFormatter: ScopeFormatter,
    private readonly chunkFormatter: ChunkFormatter,
  ) {}

  assemble(input: AssemblePromptInput): AssembledPrompt {
    const templateName = TEMPLATE_BY_INTENT[input.intent];
    if (!templateName) {
      throw new PromptAssemblyFailedError(
        `no prompt template registered for intent "${input.intent}"`,
      );
    }

    const chunks = this.evidenceChunks(input);
    const variant: PromptVariant =
      chunks.length === 0 ? 'no-evidence' : 'with-evidence';

    const sections = this.loader.loadSections(templateName);
    const evidenceDirective = this.loader.loadRaw(
      variant === 'no-evidence'
        ? NO_EVIDENCE_PARTIAL
        : EVIDENCE_SUPPLIED_PARTIAL,
    );

    const values: Record<string, string> = {
      medications: this.scopeFormatter.formatMedications(input.scope),
      conditions: this.scopeFormatter.formatConditions(input.scope),
      allergies: this.scopeFormatter.formatAllergies(input.scope),
      findings: this.scopeFormatter.formatFindings(input.scope.findings),
      severity: input.severity,
      subjectMedication: this.scopeFormatter.formatSubjectMedication(
        input.subjectMedicationName,
      ),
      question: this.scopeFormatter.formatQuestion(input.question),
      excerpts: this.chunkFormatter.format(chunks),
      evidenceDirective: evidenceDirective.trim(),
    };

    const systemPrompt = this.renderer.render(sections.system, values);
    const userPrompt = this.renderer.render(sections.user, values);

    return {
      systemPrompt,
      userPrompt,
      promptVersion: buildPromptVersion(
        input.intent,
        variant,
        // Fingerprint the composed template plus the directive that was chosen,
        // so the two variants of one template stamp different versions.
        fingerprintTemplate(
          this.loader.loadRaw(templateName) + evidenceDirective,
        ),
      ),
      variant,
      suppliedCitationIds: this.chunkFormatter.citationIdsOf(chunks),
    };
  }

  /**
   * `found: false` is the retriever's explicit no-evidence signal. `found: true`
   * with an empty chunk list is the same situation arriving by accident — a
   * retriever bug — and is treated identically rather than assembling a prompt
   * that claims to have evidence and then shows none. Either way the run is
   * recorded as the no-evidence variant in the persisted prompt version, so the
   * case stays visible in the data instead of passing silently.
   */
  private evidenceChunks(input: AssemblePromptInput): RetrievedChunk[] {
    return input.retrieval.found ? input.retrieval.chunks : [];
  }
}
