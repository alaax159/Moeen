import { CandidateResponse } from '../candidate-response';
import { ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';
import {
  CARDINAL_PHRASE,
  DIGITS,
  EXPLICIT_QUANTITY,
  VAGUE_QUANTITY_WORDS,
} from './number-words';
import { findHits, maskSpans, normalizeForMatching } from './text-utils';

const TIMES = String.raw`(?:once|twice|thrice|${DIGITS}\s*times|(?:${CARDINAL_PHRASE}|${VAGUE_QUANTITY_WORDS})\s+times)`;

const PERIODS = [
  'days?',
  'weeks?',
  'fortnights?',
  'months?',
  'hours?',
  'mornings?',
  'afternoons?',
  'evenings?',
  'nights?',
  'bedtimes?',
  'meals?',
  'mealtimes?',
  'breakfasts?',
  'lunch(?:es|times?)?',
  'dinners?',
  'suppers?',
  'teatimes?',
  'doses?',
].join('|');

const FREQUENCY_ADVERBS = [
  'daily',
  'nightly',
  'hourly',
  'weekly',
  'fortnightly',
  'monthly',
  String.raw`(?:once|twice)[\s-]daily`,
].join('|');

/**
 * Latin dosing shorthand. A patient should never see it, and a model that
 * produces it has copied a prescribing direction verbatim.
 */
/**
 * The three-letter forms allow spaces between their letters, because "b i d"
 * is how a model spells bid when it is trying not to write bid. The two-letter
 * forms (`bd`, `od`) do not: "b d" and "o d" as separate words are far more
 * likely to be an accident of some other sentence than a prescribing
 * direction, and this rule is strict enough elsewhere not to need them.
 */
const SEP = String.raw`[\s.]*`;

const LATIN_SHORTHAND = [
  String.raw`q${SEP}\d+${SEP}h`,
  String.raw`q\.?(?:d|h|id|od|ds)`,
  String.raw`b${SEP}i${SEP}d`,
  String.raw`t${SEP}i${SEP}d`,
  String.raw`q${SEP}i${SEP}d`,
  String.raw`t${SEP}d${SEP}s`,
  String.raw`q${SEP}d${SEP}s`,
  String.raw`p${SEP}r${SEP}n`,
  String.raw`b\.?d`,
  String.raw`o\.?d`,
  'nocte',
  'mane',
].join('|');

/**
 * The one carve-out in this rule, and the only place in T1 where a pattern is
 * deliberately loosened.
 *
 * "daily" on its own is a dosing frequency in "taken daily" and ordinary
 * English in "your daily routine" — and the templates ask for warm,
 * plain-language copy, which is exactly where "day to day" shows up. Masking
 * these collocations is narrower than dropping the adverb pattern, and it is
 * one array to delete if we decide even this is too generous.
 */
export const NON_CLINICAL_FREQUENCY_COLLOCATIONS: readonly RegExp[] = [
  /\bdaily\s+(?:life|living|routine|activities|tasks|basis)\b/gi,
  /\bday[\s-]to[\s-]day\b/gi,
];

const PATTERNS: readonly { pattern: RegExp; detail: string }[] = [
  {
    pattern: new RegExp(
      String.raw`\b${TIMES}\s+(?:a|an|per|each|every)\s+(?:${PERIODS})\b`,
      'gi',
    ),
    detail: 'States how often something is taken.',
  },
  {
    pattern: new RegExp(
      String.raw`\b${TIMES}\s+(?:${FREQUENCY_ADVERBS})\b`,
      'gi',
    ),
    detail: 'States how often something is taken.',
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:every|each|per)\s+(?:other\s+)?(?:${EXPLICIT_QUANTITY}\s*)?(?:${PERIODS})\b`,
      'gi',
    ),
    detail: 'States a dosing interval.',
  },
  {
    pattern: new RegExp(String.raw`\bevery\s+${DIGITS}\s*(?:h|hr|hrs)\b`, 'gi'),
    detail: 'States a dosing interval.',
  },
  {
    /** "on alternate days", "alternating mornings". */
    pattern: new RegExp(
      String.raw`\b(?:alternate|alternating)\s+(?:${PERIODS})\b`,
      'gi',
    ),
    detail: 'States a dosing interval.',
  },
  {
    /** "8-hourly", "24 hourly", "12-weekly". */
    pattern: new RegExp(
      String.raw`\b(?:${DIGITS}|${CARDINAL_PHRASE})[\s-]?(?:hourly|daily|nightly|weekly|monthly)\b`,
      'gi',
    ),
    detail: 'States how often something is taken.',
  },
  {
    pattern: new RegExp(String.raw`\b(?:${LATIN_SHORTHAND})\b`, 'gi'),
    detail: 'Uses prescribing shorthand for a dosing frequency.',
  },
  {
    pattern:
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?o'clock\b/gi,
    detail: 'Names a clock time, which is a time to take a medicine.',
  },
  {
    pattern:
      /\b(?:at\s+bedtime|before\s+bed|before\s+you\s+(?:go\s+to\s+bed|sleep|turn\s+in)|when\s+you\s+(?:wake(?:\s+up)?|get\s+up|go\s+to\s+bed)|at\s+night|in\s+the\s+(?:morning|afternoon|evening)|morning\s+and\s+(?:night|evening)|night\s+and\s+morning|first\s+thing|round\s+the\s+clock|from\s+time\s+to\s+time|every\s+so\s+often|(?:as|when|if)\s+(?:needed|required)|with\s+(?:food|meals?|water|breakfast|lunch|dinner|supper)|at\s+(?:breakfast|lunch(?:time)?|dinner(?:time)?|supper|teatime|mealtimes?)|on\s+an\s+empty\s+stomach|(?:before|after)\s+(?:food|meals?|breakfast|lunch|dinner|supper))\b/gi,
    detail:
      'Gives a time or circumstance for taking a medicine — an administration instruction, not an explanation.',
  },
];

const ADVERB_PATTERN = new RegExp(
  String.raw`\b(?:${FREQUENCY_ADVERBS})\b`,
  'gi',
);

/**
 * Rule 3b — no dosing frequency.
 *
 * Frequency is half of a dose. "Twice a day" without an amount is still a
 * direction the patient can act on, and it is still the prescriber's to give.
 */
export class DosingFrequencyRule implements ValidationRule {
  readonly name = 'dosing-frequency';

  check(candidate: CandidateResponse): ValidationViolation[] {
    const text = normalizeForMatching(candidate.text);
    const violations: ValidationViolation[] = [];

    for (const { pattern, detail } of PATTERNS) {
      for (const hit of findHits(text, pattern)) {
        violations.push(this.violation(detail, hit.matched, hit.evidence));
      }
    }

    const masked = maskSpans(text, NON_CLINICAL_FREQUENCY_COLLOCATIONS);
    for (const hit of findHits(masked, ADVERB_PATTERN)) {
      violations.push(
        this.violation(
          'Uses a frequency word.',
          hit.matched,
          hit.evidence.replace(/ {2,}/g, ' '),
        ),
      );
    }

    return violations;
  }

  private violation(
    detail: string,
    matched: string,
    evidence: string,
  ): ValidationViolation {
    return {
      code: 'dosing_frequency',
      rule: this.name,
      detail: `${detail} Matched "${matched}".`,
      evidence,
    };
  }
}
