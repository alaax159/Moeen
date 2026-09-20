import type {
  GuidanceIntent,
  SafetyCheckSeverity,
  SafetyFindingSeverity,
  SafetyFindingType,
} from '../../contracts';

/**
 * Every sentence a patient can receive from the fallback path, in one file.
 *
 * Two rules govern edits here, and both are enforced by
 * fallback-renderer.validator-safe.spec.ts rather than by good intentions:
 *
 * 1. Nothing is interpolated except values the deterministic engine produced
 *    (a severity word, a finding type, a count). No model output, no label
 *    text, no free-text rationale reaches a patient through this file — see
 *    the note on rationale in fallback-renderer.service.ts.
 *
 * 2. The composed result has to pass GN-3's own validator with zero
 *    citations, which is the strictest configuration those rules have. That
 *    is why the wording avoids amounts, frequencies, times of day, imperatives
 *    aimed at the patient's medicines, and every urgency phrase: the fallback
 *    must clear the same bar it exists to enforce.
 */

export const FALLBACK_HEADER =
  'Here is a summary of your latest medication safety check.';

export const NOTHING_FLAGGED =
  'Your latest medication safety check found nothing to flag.';

export const CHECK_NOT_FULLY_VERIFIED =
  'Your latest medication safety check could not verify everything it needed to check.';

/**
 * The opening for a run with no safety check behind it. Deliberately not an
 * apology and not an error: the patient is told plainly that this channel is
 * not where the answer comes from, and then told where it does come from.
 */
export const NO_ANSWER_HERE = 'We are not able to answer that here.';

/**
 * Closes every fallback. This is the invariant in one sentence — the
 * deterministic layer decides, the guidance layer explains — written for a
 * patient rather than for a design doc.
 */
export const DECISION_LINE =
  'Whether anything about your medicines should change is a decision for your ' +
  'doctor or pharmacist.';

/** What the engine detected, one fixed sentence per finding type. */
export const FINDING_COPY: Record<SafetyFindingType, string> = {
  duplicate_therapy:
    'Overlapping treatment: the check flagged more than one medicine on your ' +
    'list as covering the same ground',
  drug_interaction:
    'Medicine interaction: the check flagged a possible interaction between ' +
    'medicines on your list',
  allergy_conflict:
    'Allergy conflict: the check flagged a clash with an allergy recorded on ' +
    'your profile',
  condition_caution:
    'Condition caution: the check flagged a caution linked to a health ' +
    'condition recorded on your profile',
};

/**
 * Presentation order for finding lines when the engine returned several
 * types. Fixed so the same finding set always renders the same text — the
 * whole point of a deterministic renderer is that two runs of the same input
 * are byte-identical.
 */
export const FINDING_TYPE_ORDER: readonly SafetyFindingType[] = [
  'allergy_conflict',
  'drug_interaction',
  'duplicate_therapy',
  'condition_caution',
];

/**
 * How severity is said to a patient. The engine's four values, in the
 * engine's own vocabulary — softening 'contraindicated' into something
 * gentler would be re-ranking a severity by wording, which the invariant
 * forbids as squarely as changing the value would.
 */
export const SEVERITY_WORD: Record<SafetyFindingSeverity, string> = {
  minor: 'minor',
  moderate: 'moderate',
  major: 'major',
  contraindicated: 'contraindicated',
};

/**
 * The same severities, said once more for the line that reports the whole
 * check. Only 'contraindicated' differs: it is the one value whose meaning a
 * patient cannot be assumed to know, and the overall line is where there is
 * room to say it without repeating the gloss on every finding above it.
 */
export const OVERALL_SEVERITY_WORD: Record<SafetyFindingSeverity, string> = {
  ...SEVERITY_WORD,
  contraindicated: 'contraindicated, the highest level',
};

/** Ranks severities for presentation order only. Never used to resolve one. */
export const SEVERITY_RANK: Record<SafetyCheckSeverity, number> = {
  unverified: -1,
  clear: 0,
  minor: 1,
  moderate: 2,
  major: 3,
  contraindicated: 4,
};

export const MEDICAL_HELP_LINE =
  'If you feel unwell or something is worrying you, medical help is available now.';

/**
 * The referral line, chosen by the severity the engine already resolved.
 *
 * Urgency is graded here and nowhere else. A model may never make this call —
 * that is exactly what the diagnosis rule's urgency pattern exists to stop —
 * so the one place it is made is a lookup table keyed by a value the
 * deterministic layer produced.
 */
export const REFERRAL_LINE: Record<SafetyCheckSeverity, string> = {
  unverified:
    'Please ask your doctor or pharmacist to review your medicines because the check was incomplete.',
  clear:
    'If anything about your medicines is worrying you, your doctor or ' +
    'pharmacist can help.',
  minor:
    'Please mention this check to your doctor or pharmacist at your next ' +
    'appointment.',
  moderate:
    'Please contact your doctor or pharmacist about this check when you can.',
  major:
    'Please contact your doctor or pharmacist about this check as soon as you can.',
  contraindicated:
    'Please contact your doctor or pharmacist about this check today.',
};

/** Who to ask, by what the patient was asking about. */
export const INTENT_REFERRAL: Record<GuidanceIntent, string> = {
  missed_dose:
    'Your doctor or pharmacist is the right person to ask about a missed dose.',
  explain_finding:
    'Your doctor or pharmacist can talk you through what your check found.',
  medication_question:
    'Your doctor or pharmacist can answer questions about your medicines.',
};

/**
 * Used when the engine sends a finding type this file does not know about.
 *
 * Not defensive padding: SafetyFindingType is marked PROVISIONAL in
 * contracts/, so the engine growing a fifth type before this file learns
 * about it is the expected order of events. When that happens the patient
 * still hears that something was flagged and still gets the referral for the
 * severity the engine resolved, rather than silently hearing nothing.
 */
export const UNKNOWN_FINDING_COPY =
  'Another point was flagged on your medicine list';

/**
 * The floor. Unreachable through FallbackRenderer, which is total — this is
 * what ResponseFinalizer sends if the renderer ever hands it an empty string
 * anyway.
 *
 * It exists because "the patient never receives silence" has to hold even
 * when a future edit to this file gets something wrong, and because the cost
 * of the guarantee is one constant.
 */
export const LAST_RESORT_TEXT = `${NO_ANSWER_HERE}\n\n${INTENT_REFERRAL.medication_question}\n\n${MEDICAL_HELP_LINE}\n\n${DECISION_LINE}`;
