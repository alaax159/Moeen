import { CandidateResponse } from '../candidate-response';
import { ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';
import { findHits, normalizeForMatching, splitSentences } from './text-utils';

/**
 * Verbs that only ever mean one thing in a sentence about medicines. These
 * fire wherever they appear — no object required, no modal required. There is
 * no innocent use of "skip" or "double up" in an answer about a patient's
 * treatment.
 */
const UNAMBIGUOUS_VERBS = [
  'skips?',
  'skipped',
  'skipping',
  String.raw`double\s+up`,
  String.raw`doubling\s+up`,
  'halve',
  'halving',
  'split',
  'splitting',
  String.raw`catch\s+up`,
  String.raw`catching\s+up`,
  String.raw`space\s+out`,
  String.raw`spacing\s+out`,
  'tapers?',
  'tapering',
  'weans?',
  'weaning',
  String.raw`top\s+up`,
  // "leave it out", "left one out" — a skip, phrased as a phrasal verb.
  String.raw`leaves?\s+(?:\S+\s+){0,2}out`,
  String.raw`(?:left|leaving)\s+(?:\S+\s+){0,2}out`,
  // "make up for it", "making it up" — the missed-dose leaflet's other verb.
  String.raw`makes?\s+(?:\S+\s+){0,2}up`,
  String.raw`making\s+(?:\S+\s+){0,2}up`,
  String.raw`keeps?\s+going`,
  String.raw`keep\s+(?:on\s+)?(?:taking|going)`,
  String.raw`carry(?:ing)?\s+on`,
  String.raw`carries\s+on`,
].join('|');

/**
 * Verbs that mean a dosing change only when they act on a medicine.
 *
 * Splitting these out is what keeps the rule usable. "change" is in this list
 * because every answer produced from our own templates ends with "whether
 * anything about your medicines should change is a decision for your doctor" —
 * an unconditional match on "change" would reject 100% of otherwise-perfect
 * answers, and a validator that rejects everything teaches the team to switch
 * it off.
 */
const OBJECT_TAKING_VERBS = [
  'takes?',
  'taking',
  'took',
  'taken',
  'stops?',
  'stopping',
  'starts?',
  'starting',
  'restarts?',
  'restarting',
  'resumes?',
  'resuming',
  'continues?',
  'continuing',
  'discontinues?',
  'discontinuing',
  'delays?',
  'delaying',
  'postpones?',
  'postponing',
  'waits?',
  'waiting',
  'holds?',
  'holding',
  'omits?',
  'omitting',
  'increases?',
  'increasing',
  'decreases?',
  'decreasing',
  'reduces?',
  'reducing',
  'lowers?',
  'lowering',
  'raises?',
  'raising',
  'adjusts?',
  'adjusting',
  'changes?',
  'changing',
  'switch(?:es)?',
  'switching',
  'alters?',
  'altering',
  'misses?',
  'missing',
].join('|');

const ALL_VERBS = `(?:${UNAMBIGUOUS_VERBS}|${OBJECT_TAKING_VERBS})`;

const MEDICINE_OBJECT = [
  'doses?',
  'dosages?',
  'tablets?',
  'capsules?',
  'pills?',
  'medicines?',
  'medications?',
  'drugs?',
  'treatments?',
  'it',
  'them',
  'this',
  'that',
  'these',
  'those',
  'one',
  'both',
  String.raw`any\s+more`,
].join('|');

/** Verb, then a medicine within three words: "stop taking your medicine". */
const OBJECT_WINDOW = String.raw`(?:\s+\S+){0,2}\s+(?:${MEDICINE_OBJECT})\b`;

/**
 * Phrases that turn a bare verb into a direction to the patient. "You should
 * wait" and "it is fine to wait" are instructions; "your pharmacist decides
 * when to wait" is a referral, and the object window is what separates them.
 */
const INSTRUCTION_FRAMES = [
  String.raw`you\s+(?:should|must|can|could|may|might|need\s+to|ought\s+to|will\s+want\s+to|had\s+better|are\s+able\s+to|do\s+not\s+need\s+to|don't\s+need\s+to)`,
  String.raw`it\s+is\s+(?:safe|fine|ok|okay|best|better|advisable|important|a\s+good\s+idea)\s+to`,
  String.raw`there\s+is\s+no\s+(?:need|harm)\s+(?:to|in)`,
  String.raw`no\s+harm\s+in`,
  String.raw`(?:feel\s+free|try|make\s+sure|remember|be\s+sure|aim|the\s+best\s+thing)\s+to`,
  String.raw`(?:do\s+not|don't|never|always|simply|just)`,
  String.raw`what\s+you\s+should\s+do\s+is`,
].join('|');

/**
 * Set phrases from the missed-dose leaflet. Individually they contain no verb
 * this rule would otherwise catch; together they are the single most likely
 * shape for unsafe missed-dose output, which is the intent this validator
 * protects first.
 */
const DOSING_IDIOMS = [
  String.raw`as\s+soon\s+as\s+you\s+remember`,
  String.raw`when(?:ever)?\s+you\s+remember`,
  String.raw`(?:almost|nearly)\s+time\s+for`,
  String.raw`back\s+to\s+your\s+(?:usual|normal|regular)`,
  String.raw`your\s+(?:usual|normal|regular)\s+(?:schedule|routine|time|times|pattern|dosing|doses|rhythm)`,
  String.raw`at\s+the\s+(?:usual|normal|regular|next)\s+(?:time|point|stage|slot)`,
  String.raw`(?:first|last|final|next|following|remaining)\s+(?:scheduled\s+)?doses?`,
  String.raw`next\s+(?:scheduled\s+)?dose`,
  String.raw`double\s+dose`,
  String.raw`extra\s+dose`,
  String.raw`two\s+doses(?:\s+at\s+once)?`,
  String.raw`both\s+doses`,
  String.raw`make\s+up\s+for\s+(?:the|a|your)\s+missed`,
  String.raw`carry\s+on\s+as\s+(?:normal|usual|before|you\s+were)`,
  String.raw`as\s+(?:planned|scheduled|normal|usual|before)`,
  String.raw`leave\s+it\s+until`,
  String.raw`wait\s+until\s+(?:the|your|tomorrow|tonight)`,
].join('|');

const PATTERNS: readonly { pattern: RegExp; detail: string }[] = [
  {
    pattern: new RegExp(String.raw`\b(?:${UNAMBIGUOUS_VERBS})\b`, 'gi'),
    detail: 'Names an action taken on a dose.',
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:${OBJECT_TAKING_VERBS})\b${OBJECT_WINDOW}`,
      'gi',
    ),
    detail: 'Acts on the patient\u2019s medicine or dose.',
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:${INSTRUCTION_FRAMES})\s+(?:\S+\s+){0,2}${ALL_VERBS}\b`,
      'gi',
    ),
    detail: 'Tells the patient what to do about their medicine.',
  },
  {
    pattern: new RegExp(String.raw`\b(?:${DOSING_IDIOMS})\b`, 'gi'),
    detail: 'Uses a set phrase from missed-dose dosing instructions.',
  },
  {
    /**
     * The passive voice, which is how an instruction escapes a rule built
     * around a patient-facing frame. "You can take it at the usual time" is
     * caught by INSTRUCTION_FRAMES; "it can be taken at the usual time" says
     * exactly the same thing to the patient with no "you" anywhere in it.
     */
    pattern:
      /\b(?:can|may|should|could|might|must|will|is|are)\s+(?:not\s+|safely\s+|still\s+)*be\s+(?:taken|skipped|delayed|postponed|doubled|split|halved|stopped|started|restarted|resumed|continued|discontinued|omitted|missed|left\s+out|made\s+up|caught\s+up|spaced\s+out)\b/gi,
    detail:
      'Tells the patient what to do about their medicine, in the passive voice.',
  },
];

/** A sentence opening with a bare verb is an imperative: "Skip it." "Wait until tomorrow." */
const IMPERATIVE_OPENING = new RegExp(
  String.raw`^(?:just\s+|please\s+|now\s+|instead,?\s+)?${ALL_VERBS}\b`,
  'i',
);

/**
 * Rule 3c — no schedule changes.
 *
 * The broadest rule here, and intentionally so. GN-3's brief singles out "any
 * sentence reading as an instruction to change what the patient takes", which
 * is a wider net than dose numbers: an answer can name no amount and no
 * frequency and still tell a patient to stop their medicine.
 */
export class ScheduleChangeRule implements ValidationRule {
  readonly name = 'schedule-change';

  check(candidate: CandidateResponse): ValidationViolation[] {
    const text = normalizeForMatching(candidate.text);
    const violations: ValidationViolation[] = [];

    for (const { pattern, detail } of PATTERNS) {
      for (const hit of findHits(text, pattern)) {
        violations.push({
          code: 'schedule_change',
          rule: this.name,
          detail: `${detail} Matched "${hit.matched}".`,
          evidence: hit.evidence,
        });
      }
    }

    for (const sentence of splitSentences(candidate.text)) {
      const match = IMPERATIVE_OPENING.exec(sentence);
      if (!match) continue;
      violations.push({
        code: 'schedule_change',
        rule: this.name,
        detail: `Sentence is an instruction to the patient. Matched "${match[0]}".`,
        evidence: sentence,
      });
    }

    return violations;
  }
}
