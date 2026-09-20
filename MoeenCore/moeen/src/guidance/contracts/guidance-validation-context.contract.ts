import type { GuidanceIntent } from './guidance-request.contract';
import type { SafetyCheckSummary } from './safety-check-result.contract';

/** Everything the validate/fallback stage needs from the deterministic run. */
export interface GuidanceValidationContext {
  intent: GuidanceIntent;
  patientId: number;
  /** Null only when this request genuinely had no safety check behind it. */
  safety: SafetyCheckSummary | null;
}
