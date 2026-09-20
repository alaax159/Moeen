import { CandidateResponse } from '../candidate-response';
import { ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';
import {
  ANY_QUANTITY_RANGE,
  COUNTABLE_QUANTITY_RANGE,
  QUANTITY_UNIT_GAP,
} from './number-words';
import { findHits, normalizeForMatching } from './text-utils';

/**
 * Units of measurement. A quantity in front of any of these is a dose, full
 * stop — there is no non-dosing sentence in patient guidance that says
 * "10 mg" innocently.
 */
const MEASURED_UNITS = [
  'mgs?',
  // British spellings throughout. "ten milligrammes" is the same dose as
  // "ten milligrams" and matched nothing until the second `m` was optional.
  'milligrammes?',
  'milligrams?',
  'mcgs?',
  'microgrammes?',
  'micrograms?',
  '\u00B5g',
  'ug',
  'ng',
  'nanogrammes?',
  'nanograms?',
  'grammes?',
  'grams?',
  'g',
  'kg',
  'kilograms?',
  'ml',
  'millilitres?',
  'milliliters?',
  'litres?',
  'liters?',
  'l',
  'cc',
  'iu',
  'meq',
  'mmol',
  'units?',
].join('|');

/**
 * Things you can count out. These need a *stated* quantity to count as a dose
 * — see ANY_QUANTITY's note on why the indefinite article is excluded here.
 */
const COUNTED_UNITS = [
  'tablets?',
  'tabs?',
  'capsules?',
  'caps?',
  'pills?',
  'caplets?',
  'doses?',
  'dosages?',
  'drops?',
  'puffs?',
  'sprays?',
  'inhalations?',
  'teaspoons?',
  'tsp',
  'tablespoons?',
  'tbsp',
  'spoonfuls?',
  'patches?',
  'sachets?',
  'ampoules?',
  'vials?',
  'syringes?',
  'injections?',
  'suppositor(?:y|ies)',
  'lozenges?',
  'pastilles?',
  'scoops?',
].join('|');

/**
 * Units so specific to medicine measurement that their bare presence is a
 * problem, quantity or not: "your doctor decides the number of milligrams"
 * is still dosing talk. Kept narrow on purpose — `g`, `l`, `cc`, `units` and
 * `%` are ordinary English and only mean a dose next to a number.
 */
const UNAMBIGUOUS_UNITS = [
  'mgs?',
  'mcgs?',
  '\u00B5g',
  'milligrammes?',
  'milligrams?',
  'microgrammes?',
  'micrograms?',
  'nanogrammes?',
  'nanograms?',
  'millilitres?',
  'milliliters?',
  'iu',
  'meq',
  'mmol',
].join('|');

/**
 * Uppercase Roman numerals in front of a unit: "II tablets".
 *
 * Matched case-sensitively and only next to a unit, because the lower-case
 * forms are ordinary words \u2014 an `i` flag here would reject the letter "I" and
 * the word "ix" wherever they appeared. This is the one pattern in the file
 * that is not case-insensitive, which is why it is kept out of PATTERNS.
 */
const ROMAN_NUMERAL_DOSE = new RegExp(
  String.raw`\b(?:I{2,3}|IV|V|VI{1,3}|IX|XI{0,2})${QUANTITY_UNIT_GAP}(?:${COUNTED_UNITS})\b`,
  'g',
);

const PATTERNS: readonly { pattern: RegExp; detail: string }[] = [
  {
    pattern: new RegExp(
      String.raw`${ANY_QUANTITY_RANGE}${QUANTITY_UNIT_GAP}(?:${MEASURED_UNITS})\b`,
      'gi',
    ),
    detail: 'States a dose amount as a measured quantity.',
  },
  {
    pattern: new RegExp(
      String.raw`${COUNTABLE_QUANTITY_RANGE}${QUANTITY_UNIT_GAP}(?:${COUNTED_UNITS})\b`,
      'gi',
    ),
    detail: 'States a dose amount as a count of tablets, capsules or doses.',
  },
  {
    pattern: new RegExp(String.raw`${ANY_QUANTITY_RANGE}\s*%`, 'gi'),
    detail: 'States a strength as a percentage.',
  },
  {
    pattern: new RegExp(String.raw`\b(?:${UNAMBIGUOUS_UNITS})\b`, 'gi'),
    detail:
      'Uses a unit of medicine measurement. Even without a number attached, this is dosing territory.',
  },
  {
    pattern: new RegExp(
      String.raw`\b(?:dose|dosage|strength|amount)\s+of\s+${ANY_QUANTITY_RANGE}`,
      'gi',
    ),
    detail: 'Names a dose by its size.',
  },
  {
    /**
     * A dose noun under a qualifier that only makes sense if an amount is
     * being described — "the usual starting strength", "the maximum dose".
     * The bare nouns stay legal, because "your doctor sets the dose" is the
     * referral this whole layer is built around.
     */
    pattern:
      /\b(?:usual|starting|initial|standard|normal|typical|recommended|maximum|maximal|minimum|maintenance|full|reduced|higher|lower|correct|right|total|daily)\s+(?:dose|dosage|dosing|strength|amount)\b|\b(?:dose|dosage|strength)\s+(?:size|range|level|band)\b/gi,
    detail: 'Names a dose by its size.',
  },
  {
    // "500mg/5ml", "10 mg per tablet" — strength expressions, written compactly.
    pattern:
      /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|iu)\s*(?:\/|per)\s*\d*\s*(?:ml|tablet|capsule|dose|kg|l)\b/gi,
    detail: 'States a concentration or per-unit strength.',
  },
];

/**
 * Rule 3a — no dose numbers.
 *
 * The deterministic layer decides what a patient takes. A generated answer
 * that names an amount has crossed from explaining into prescribing, whether
 * it invented the number or faithfully copied it out of a label excerpt. Both
 * are rejected: the patient's actual dose is on their prescription, not in a
 * general label, and a correct-looking number from the wrong context is the
 * more dangerous of the two.
 */
export class DoseAmountRule implements ValidationRule {
  readonly name = 'dose-amount';

  check(candidate: CandidateResponse): ValidationViolation[] {
    const text = normalizeForMatching(candidate.text);
    const violations: ValidationViolation[] = [];

    for (const { pattern, detail } of PATTERNS) {
      for (const hit of findHits(text, pattern)) {
        violations.push({
          code: 'dose_amount',
          rule: this.name,
          detail: `${detail} Matched "${hit.matched}".`,
          evidence: hit.evidence,
        });
      }
    }

    for (const hit of findHits(text, ROMAN_NUMERAL_DOSE)) {
      violations.push({
        code: 'dose_amount',
        rule: this.name,
        detail: `States a dose amount as a Roman numeral. Matched "${hit.matched}".`,
        evidence: hit.evidence,
      });
    }

    return violations;
  }
}
