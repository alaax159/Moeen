import type {
  GuidanceIntent,
  SafetyCheckSummary,
  SafetyCheckSeverity,
} from '../../contracts';

export interface FallbackInput {
  intent: GuidanceIntent;
  /**
   * The engine's own result for this run, or null when the run had no safety
   * check behind it (a free-text medication question, or a check that could
   * not be loaded).
   *
   * Null is a real case, not a defensive one, and it is the reason this
   * renderer never assumes there are findings to describe.
   */
  safety: SafetyCheckSummary | null;
}

export interface FallbackRendering {
  /** Patient-facing text. Never empty. */
  text: string;
  /**
   * The severity the text reports — copied from the engine's result, never
   * re-derived from the finding list. 'clear' when there was no check at all,
   * which reads the same way to a patient as a check that found nothing.
   */
  severity: SafetyCheckSeverity;
  /** Finding types described, in the order they appear. For the rejection log. */
  describedTypes: string[];
}

/**
 * Renders the answer a patient gets when no generated answer may be shown.
 *
 * Total by construction: every input produces text, no input produces an
 * error, and nothing here calls a model, a database or the network.
 */
export interface FallbackRendererPort {
  render(input: FallbackInput): FallbackRendering;
}

export const FALLBACK_RENDERER_PORT = Symbol('FALLBACK_RENDERER_PORT');
