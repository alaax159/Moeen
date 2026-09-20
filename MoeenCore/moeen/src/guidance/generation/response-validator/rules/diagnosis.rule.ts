import { CandidateResponse } from '../candidate-response';
import { ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';
import { findHits, normalizeForMatching } from './text-utils';

/**
 * Clinical nouns that turn a frame into a diagnosis. "You have a reaction" is
 * a diagnosis; "you have any questions" is the end of a normal sentence, and
 * requiring one of these nouns is what separates the two.
 */
const CLINICAL_NOUNS = [
  'conditions?',
  'infections?',
  'reactions?',
  String.raw`allerg(?:y|ies|ic\s+reaction)`,
  String.raw`side[\s-]effects?`,
  'symptoms?',
  'signs?',
  'diseases?',
  'disorders?',
  'syndromes?',
  'deficienc(?:y|ies)',
  'episodes?',
  String.raw`flare(?:[\s-]ups?)?`,
  'attacks?',
  'overdoses?',
  'toxicity',
  'withdrawal',
  'intolerances?',
  'sensitivit(?:y|ies)',
  'complications?',
].join('|');

/**
 * A deliberately small starter list, and NOT a safety guarantee.
 *
 * Condition vocabulary is unbounded, so no list can make this rule complete —
 * the frames below are what carry the weight, and this list only sharpens
 * them. Note that these terms never fire on their own: "this medicine is used
 * to treat high blood pressure" is an indication drawn from a cited excerpt
 * and is explicitly permitted, while "you have high blood pressure" is a
 * diagnosis. The frame is the difference, not the condition name.
 */
export const COMMON_CONDITION_TERMS = [
  String.raw`high\s+blood\s+pressure`,
  String.raw`low\s+blood\s+pressure`,
  'hypertension',
  'hypotension',
  'diabetes',
  'asthma',
  'depression',
  String.raw`anxiety\s+disorder`,
  'migraine',
  'ulcers?',
  String.raw`kidney\s+(?:disease|failure|problems?)`,
  String.raw`liver\s+(?:disease|failure|problems?)`,
  String.raw`heart\s+failure`,
  'arrhythmias?',
  String.raw`blood\s+clots?`,
  'strokes?',
  'seizures?',
  'anaemia',
  'anemia',
  String.raw`thyroid\s+problems?`,
].join('|');

const DIAGNOSTIC_OBJECT = `(?:${CLINICAL_NOUNS}|${COMMON_CONDITION_TERMS})`;

const PATTERNS: readonly { pattern: RegExp; detail: string }[] = [
  {
    pattern: new RegExp(
      String.raw`\byou\s+(?:probably\s+|likely\s+|may\s+|might\s+|could\s+|possibly\s+)?(?:have|had|have\s+got|are\s+having|are\s+experiencing|are\s+suffering\s+from|are\s+developing|are\s+dealing\s+with)\s+(?:\S+\s+){0,3}${DIAGNOSTIC_OBJECT}\b`,
      'gi',
    ),
    detail: 'Tells the patient what they have.',
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:this|that|it)\s+(?:is|was|could\s+be|may\s+be|might\s+be|is\s+likely|is\s+probably|will\s+be|represents?|indicates?|suggests?|means?|points\s+to|amounts?\s+to)\s+(?:an?\s+|the\s+)?(?:\S+\s+){0,2}${DIAGNOSTIC_OBJECT}\b`,
      'gi',
    ),
    detail: 'Identifies what is happening to the patient.',
  },
  {
    pattern:
      /\b(?:sounds\s+like|looks\s+like|seems\s+like|reads\s+(?:as|like)|comes\s+across\s+as|points\s+to|is\s+consistent\s+with|is\s+typical\s+of|is\s+characteristic\s+of|is\s+indicative\s+of|is\s+a\s+classic)\b/gi,
    detail: 'Reads as a clinical impression.',
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:an?\s+)?(?:sign|signs|symptom|symptoms|case|episode|flare|bout)\s+of\b`,
      'gi',
    ),
    detail: 'Attributes what the patient feels to a cause.',
  },
  {
    pattern: /\bdiagnos(?:e|es|ed|ing|is|es|tic)\b/gi,
    detail: 'Uses the language of diagnosis.',
  },
  {
    pattern:
      /\bwhat\s+you\s+are\s+(?:feeling|experiencing|describing)\s+is\b|\b(?:suggests|means|indicates)\s+(?:that\s+)?you\b|\bbecause\s+you\s+have\s+(?:an?\s+)?(?:\S+\s+){0,2}(?:condition|infection|reaction|allergy)\b/gi,
    detail: 'Explains the patient\u2019s experience by naming a cause.',
  },
  {
    pattern:
      /\b(?:is|are|was|were)\s+(?:probably\s+|likely\s+|most\s+likely\s+)?caused\s+by\b/gi,
    detail: 'Attributes a cause, which is a clinical judgement.',
  },
  {
    /**
     * Limit 2 forbids judging how serious a symptom is — in either direction.
     * Reassurance is the failure mode that actually harms: an answer telling a
     * patient not to worry is an answer that stops them calling someone.
     */
    pattern:
      /\b(?:nothing\s+to\s+(?:worry|be\s+(?:worried|alarmed|concerned))\s+about|no\s+(?:need|reason)\s+to\s+(?:worry|be\s+(?:alarmed|concerned))|no\s+cause\s+for\s+concern|not\s+(?:serious|dangerous|harmful|a\s+problem|a\s+concern|worrying)|nothing\s+(?:serious|untoward|out\s+of\s+the\s+ordinary)|unlikely\s+to\s+be\s+(?:anything|serious|a\s+problem)|harmless|perfectly\s+normal|quite\s+normal|is\s+normal|not\s+unusual|well\s+tolerated|wears\s+off|will\s+pass|(?:should|tends?\s+to|will)\s+settle|settles?\s+(?:down\s+)?on\s+its\s+own|goes?\s+away\s+on\s+its\s+own)\b/gi,
    detail: 'Judges how serious the patient\u2019s symptom is.',
  },
  {
    pattern:
      /\b(?:this\s+is\s+(?:an\s+)?(?:emergency|urgent)|seek\s+(?:immediate|urgent)|go\s+to\s+(?:the\s+)?(?:hospital|a&e|emergency)|call\s+an\s+ambulance|right\s+away|straight\s+away|immediately|urgently|promptly|without\s+delay|do\s+not\s+wait|as\s+a\s+matter\s+of\s+urgency|at\s+once)\b/gi,
    detail:
      'Judges the patient\u2019s situation as urgent. The templates supply one fixed referral line precisely so the model never makes this call.',
  },
];

/**
 * Rule 3d — no diagnosis.
 *
 * Detects diagnostic *framing* rather than condition vocabulary, because
 * vocabulary is unbounded and framing is not. The shapes below cover telling
 * a patient what they have, telling them what a symptom means, and telling
 * them how worried to be — the three things limit 2 rules out.
 */
export class DiagnosisRule implements ValidationRule {
  readonly name = 'diagnosis';

  check(candidate: CandidateResponse): ValidationViolation[] {
    const text = normalizeForMatching(candidate.text);
    const violations: ValidationViolation[] = [];

    for (const { pattern, detail } of PATTERNS) {
      for (const hit of findHits(text, pattern)) {
        violations.push({
          code: 'diagnosis',
          rule: this.name,
          detail: `${detail} Matched "${hit.matched}".`,
          evidence: hit.evidence,
        });
      }
    }

    return violations;
  }
}
