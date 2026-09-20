/**
 * PROVISIONAL naming — the day-zero doc only describes the two outcomes in
 * prose (cited-and-clean vs. rejected-and-fallback), not as a named enum.
 * Flagging for team sign-off before this file is treated as frozen.
 */
export type ValidationStatus = 'accepted' | 'rejected_fallback';

/**
 * Present on a GuidanceResponse only when the resolved safety severity meets
 * ESCALATION_THRESHOLD (src/guidance/escalation-policy.ts). The threshold is
 * null today, so this is never attached — the wiring exists so that flipping
 * the threshold is the only remaining step. `directive` is the fixed,
 * non-generated ESCALATION_DIRECTIVE text for the resolved severity.
 */
export interface GuidanceEscalation {
  triggered: boolean;
  directive: string;
}

export interface GuidanceResponse {
  text: string;
  /** Citation ids actually used by `text` — a subset of what was retrieved, never a superset. */
  citationIds: string[];
  validationStatus: ValidationStatus;
  /** Persisted alongside every chat message and cached dose message. */
  promptVersion: string;
  /** Set only when the safety severity meets the (currently null) escalation threshold. */
  escalation?: GuidanceEscalation;
}
