/**
 * Quantity vocabulary, shared by the dose and frequency rules.
 *
 * This file exists because of the single hardest line in GN-3's brief: a dose
 * written as words is as dangerous as one written in digits, and much harder
 * to catch. "Take 2 tablets" is trivially caught by `\d`. "Take two tablets",
 * "half a tablet" and "a couple of capsules" are the same instruction and
 * carry the same risk, so the number lexicon has to be explicit.
 *
 * Everything here is a regex *source fragment*, not a RegExp — the rules
 * compose these into larger patterns.
 */

export const DIGITS = String.raw`\d+(?:[.,]\d+)?`;

/** ½ and friends: a model writing a half-tablet dose typographically. */
export const UNICODE_FRACTIONS = '[\u00BC-\u00BE\u2150-\u215E]';

export const CARDINAL_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
].join('|');

/**
 * One or more cardinals read as a single number: "twenty four", "twenty-five",
 * "one hundred and twenty".
 *
 * Written as a phrase rather than a single word because "every twenty four
 * hours" is a dosing interval that matched nothing while the pattern could
 * only see one number word at a time.
 */
export const CARDINAL_PHRASE = String.raw`(?:${CARDINAL_WORDS})(?:[\s-]+(?:and[\s-]+)?(?:${CARDINAL_WORDS}))*`;

/**
 * Counting words that name a quantity without naming a number.
 *
 * "a dozen tablets" and "a pair of capsules" are amounts, and a lexicon built
 * only from number words walks straight past both.
 */
export const COUNTING_WORDS = [
  String.raw`a\s+dozen`,
  'dozens?',
  String.raw`a\s+pair\s+of`,
  String.raw`a\s+handful\s+of`,
].join('|');

/**
 * Ordinals, which pick a dose out of a sequence: "the second tablet", "the
 * first dose".
 *
 * Included with a deliberately known cost — "the first thing" and "your third
 * question" are ordinary English. They are only ever matched here against a
 * unit you can count out, which is what keeps that cost to sentences that are
 * about a dose anyway. Recorded in the false-positives spec.
 */
export const ORDINAL_WORDS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'next',
  'last',
  'final',
  'following',
  'remaining',
].join('|');

export const FRACTION_WORDS = [
  'half',
  'halves',
  'quarter',
  'quarters',
  'third',
  'thirds',
  String.raw`two[\s-]thirds`,
  String.raw`three[\s-]quarters`,
].join('|');

/** "a couple of capsules" is a quantity even though no number appears. */
export const VAGUE_QUANTITY_WORDS = [
  String.raw`a\s+couple\s+of`,
  String.raw`a\s+couple`,
  String.raw`a\s+few`,
  'several',
  'multiple',
].join('|');

/**
 * A quantity the writer stated: digits, a number word, or a fraction.
 * Deliberately excludes "a"/"an" — see ANY_QUANTITY.
 */
export const EXPLICIT_QUANTITY = String.raw`(?:${DIGITS}|${UNICODE_FRACTIONS}|\b(?:${CARDINAL_PHRASE}|${FRACTION_WORDS}|${VAGUE_QUANTITY_WORDS}|${COUNTING_WORDS})\b)`;

/**
 * An explicit quantity or an ordinal. Used only where the unit is something
 * you can count out — see ORDINAL_WORDS for why it is not the default.
 */
export const COUNTABLE_QUANTITY = String.raw`(?:${EXPLICIT_QUANTITY}|\b(?:${ORDINAL_WORDS})\b)`;

/**
 * An explicit quantity, or a bare indefinite article.
 *
 * Only safe against units that never appear without a dosing meaning — "a mg"
 * is nonsense outside dosing, so the article costs nothing there. Against
 * countable units it is unusable: "you missed a dose" and "your medicine comes
 * as a tablet" are both ordinary, correct sentences a missed-dose answer will
 * produce constantly. Applying it there would reject essentially every
 * missed-dose answer we ever generate.
 *
 * The gap that leaves — "take a tablet" — is not actually open: the
 * schedule-change rule catches it on the verb.
 */
export const ANY_QUANTITY = String.raw`(?:${EXPLICIT_QUANTITY}|\b(?:an?|another)\b)`;

/** "10 to 20", "one and a half", "2-3". */
function withRange(quantity: string): string {
  return String.raw`${quantity}(?:\s*(?:-|to|or|and)\s*(?:an?\s+)?${EXPLICIT_QUANTITY})?`;
}

export const EXPLICIT_QUANTITY_RANGE = withRange(EXPLICIT_QUANTITY);
export const ANY_QUANTITY_RANGE = withRange(ANY_QUANTITY);
export const COUNTABLE_QUANTITY_RANGE = withRange(COUNTABLE_QUANTITY);

/**
 * What may sit between a quantity and its unit: "half **a** tablet",
 * "two **of your** capsules", "one **whole** tablet".
 */
export const QUANTITY_UNIT_GAP = String.raw`(?:\s+(?:of|an?|the|your|these|those|more|extra|whole|full|small|large|separate))*\s*`;
