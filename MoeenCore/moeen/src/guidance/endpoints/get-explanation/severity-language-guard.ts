import { SafetyFindingSeverity } from '../../contracts';

/**
 * A second, independent check on top of whatever GN-3's own validator does
 * (or will do — it doesn't exist yet). DL-3 exists specifically because a
 * softened major alert is a real patient-safety failure, so this endpoint
 * doesn't only trust upstream validation for that one property; it checks
 * it again itself, on the actual text it's about to hand back.
 *
 * Deliberately narrow and lexical, not a general sentiment classifier:
 * - major/contraindicated: reject phrases that read as reassurance or
 *   minimization. Getting a false negative here (missed softening) is the
 *   failure this whole guard exists to catch, so the phrase list errs
 *   toward being broad rather than precise.
 * - minor: reject phrases that escalate toward an emergency framing the
 *   deterministic engine didn't assign. Same direction of harm, reversed —
 *   overstating a minor finding could send a patient to the ER unnecessarily
 *   or make them distrust every future alert.
 * - moderate: no directional check. Both a mild and a fairly serious
 *   framing are plausible for "moderate," and drawing a line here would be
 *   guessing, not enforcing something the deterministic layer actually
 *   decided.
 *
 * A miss in either direction still isn't the last line of defense —
 * unmatched phrasing that changes meaning without using any of these words
 * gets through. That's a known limitation of a keyword approach, recorded
 * here rather than left implicit; see the README for the caching
 * implication.
 */

const MINIMIZING_PHRASES = [
  'nothing to worry about',
  'not serious',
  'no need to worry',
  'not a big deal',
  'minor concern',
  'mild issue',
  'low risk',
  'no cause for concern',
  'not dangerous',
  'harmless',
  'you can ignore',
  'no need to see',
  'not urgent',
  'no immediate concern',
];

const ESCALATING_PHRASES = [
  'emergency',
  'call 911',
  'go to the er',
  'go to the emergency room',
  'life-threatening',
  'life threatening',
  'seek immediate',
  'urgent care now',
  'call an ambulance',
];

export function severityLanguageIsConsistent(
  text: string,
  severity: SafetyFindingSeverity,
): boolean {
  const lower = text.toLowerCase();

  if (severity === 'major' || severity === 'contraindicated') {
    return !MINIMIZING_PHRASES.some((phrase) => lower.includes(phrase));
  }

  if (severity === 'minor') {
    return !ESCALATING_PHRASES.some((phrase) => lower.includes(phrase));
  }

  return true;
}
