import type {
  GuidanceIntent,
  PatientScope,
  RetrievalResult,
  SafetyCheckSeverity,
} from '../../contracts';

/** Which wording of a template produced a prompt. Persisted inside the prompt version. */
export type PromptVariant = 'with-evidence' | 'no-evidence';

export interface AssemblePromptInput {
  intent: GuidanceIntent;
  scope: PatientScope;
  /** Discriminated on purpose — `found: false` selects the no-evidence variant. */
  retrieval: RetrievalResult;
  /**
   * The severity the safety engine already resolved for this check. Passed in
   * rather than derived from scope.findings: the generative layer explains this
   * value, it never recomputes it.
   */
  severity: SafetyCheckSeverity;
  /** medication_question only — the patient's free-text question. */
  question?: string;
  /**
   * Ingredient name of the medicine identified by scope.subjectMedicationId,
   * resolved by the caller.
   *
   * It arrives as an input rather than being looked up here because it cannot
   * be looked up here: PatientScopeMedication carries no id, so the scope
   * cannot map subjectMedicationId onto one of its own entries. The flow can —
   * it holds the request and can reach the medication records — and resolving
   * it there also keeps this service a pure formatter.
   *
   * Optional because subjectMedicationId is itself optional. When it is
   * missing the prompt says so plainly rather than guessing.
   */
  subjectMedicationName?: string;
}

export interface AssembledPrompt {
  systemPrompt: string;
  userPrompt: string;
  /** Stamped onto GuidanceResponse.promptVersion and persisted with the answer. */
  promptVersion: string;
  variant: PromptVariant;
  /**
   * The citation ids actually placed in front of the model. GN-3 validates
   * generated citations against exactly this list — anything outside it is a
   * fabricated citation.
   */
  suppliedCitationIds: string[];
}

export interface PromptAssemblerPort {
  /**
   * Builds the prompt for one guidance run. Throws
   * PromptAssemblyFailedError rather than returning a partially assembled
   * prompt.
   */
  assemble(input: AssemblePromptInput): AssembledPrompt;
}

export const PROMPT_ASSEMBLER_PORT = Symbol('PROMPT_ASSEMBLER_PORT');
