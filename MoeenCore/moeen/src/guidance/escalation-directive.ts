import type { SafetyCheckSeverity } from './contracts';

/**
 * Fixed directive for the serious-reaction escalation screen — one entry per
 * severity the deterministic safety engine can resolve. Same shape as
 * REFERRAL_LINE (generation/fallback-renderer/fallback-copy.ts) but DELIBERATELY
 * SEPARATE: REFERRAL_LINE is tuned to pass GN-3's zero-citation validator, which
 * strips every urgency phrase (see get-explanation/severity-language-guard.ts).
 * This screen is shown *because* a serious reaction was flagged, so its copy has
 * to be more direct than the guidance channel is allowed to be.
 *
 * Values are TODO placeholders. The real per-severity wording is a clinical
 * decision and MUST be authored / reviewed by whoever owns patient-safety copy
 * before this is wired to anything. Never AI-generated, never substituted at
 * runtime — the same invariant REFERRAL_LINE holds.
 */
export const ESCALATION_DIRECTIVE: Record<SafetyCheckSeverity, string> = {
  unverified: 'TODO(clinical): escalation directive for an unverified check',
  clear: 'TODO(clinical): escalation directive for a clear check',
  minor: 'TODO(clinical): escalation directive for a minor finding',
  moderate: 'TODO(clinical): escalation directive for a moderate finding',
  major: 'TODO(clinical): escalation directive for a major finding',
  contraindicated:
    'TODO(clinical): escalation directive for a contraindicated finding',
};
