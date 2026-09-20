/**
 * Characters that occupy no width but sit inside a word and break a pattern.
 *
 * The soft hyphen is the one that matters, and the one the red-team suite
 * covers: "m­g" renders to a patient as "mg" and matched nothing at all
 * before it was folded away here.
 */
const INVISIBLES = /[\u00AD\u180E\u200B-\u200D\u2060\uFEFF]/g;

/**
 * Collapses runs of whitespace to single spaces.
 *
 * Every pattern in these rules is written with `\s+` between words, but a
 * model that puts a line break mid-phrase would still defeat patterns written
 * against the raw string in subtler ways (a stray zero-width space, a
 * non-breaking space). Normalising once, up front, means each rule can be read
 * as prose rather than as defensive regex.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(INVISIBLES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Code point of the digit zero in each non-ASCII decimal block worth folding.
 *
 * Arabic-Indic is not a theoretical case for this product: Moeen is an
 * Arabic-facing app, "١٠ mg" is an entirely natural thing for a model to
 * produce here, and `\d` does not match a single character of it.
 *
 * Fullwidth is already handled by the NFKC pass below, and is listed anyway so
 * this table reads as "the digits we understand" rather than as a leftovers
 * list.
 */
const DIGIT_ZERO_BASES = [
  0x0660, // Arabic-Indic
  0x06f0, // Extended Arabic-Indic (Persian, Urdu)
  0x0966, // Devanagari
  0x09e6, // Bengali
  0xff10, // Fullwidth
];

const ANY_DECIMAL_DIGIT = /\p{Nd}/gu;

function foldDigits(text: string): string {
  return text.replace(ANY_DECIMAL_DIGIT, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    const base = DIGIT_ZERO_BASES.find(
      (zero) => code >= zero && code <= zero + 9,
    );
    return base === undefined ? digit : String(code - base);
  });
}

/**
 * Contractions, expanded before any rule sees the text.
 *
 * "It's likely an allergic reaction" and "It is likely an allergic reaction"
 * are the same sentence to a patient, and were not the same sentence to the
 * diagnosis rule, whose frames are all written as "it is" and "you are". Four
 * separate diagnosis bypasses in the red-team suite were this one gap.
 *
 * Expanding here rather than writing the contracted form into every frame
 * keeps the frames readable as prose, and means a frame added later inherits
 * the fix for free.
 */
const CONTRACTIONS: readonly [RegExp, string][] = [
  [/\bit's\b/gi, 'it is'],
  [/\bthat's\b/gi, 'that is'],
  [/\bthere's\b/gi, 'there is'],
  [/\bwhat's\b/gi, 'what is'],
  [/\byou're\b/gi, 'you are'],
  [/\bthey're\b/gi, 'they are'],
  [/\bwe're\b/gi, 'we are'],
  [/\byou've\b/gi, 'you have'],
  [/\bwe've\b/gi, 'we have'],
  [/\bthey've\b/gi, 'they have'],
  [/\byou'll\b/gi, 'you will'],
  [/\byou'd\b/gi, 'you would'],
  [/\bcan't\b/gi, 'cannot'],
  [/\bwon't\b/gi, 'will not'],
  [/\bshan't\b/gi, 'shall not'],
  // Every remaining -n't: doesn't, isn't, wasn't, shouldn't, mustn't.
  [/\b(\w+)n't\b/gi, '$1 not'],
];

/**
 * Emphasis characters, dropped before matching.
 *
 * The templates forbid markdown outright, so none of these is a legitimate
 * part of a patient-facing sentence — and "**two** tablets" is a dose that
 * matched nothing, because the asterisks sat between the quantity and its
 * unit. Dropped rather than replaced with a space, so the words either side
 * rejoin into the phrase the patient would actually read.
 */
const EMPHASIS = /[*`~•]/g;

/**
 * Folds the typographic characters a model reaches for into their ASCII
 * equivalents, so "don’t" and "don't" are the same word to a pattern and a
 * curly apostrophe is not a way past the instruction rules.
 *
 * Everything here is a fold, never a deletion of meaning: the output is the
 * same sentence with fewer ways to spell it. That distinction matters, because
 * this is the only place in the validator where text is rewritten at all, and
 * a fold that changed what a sentence said would let a rule pass on text the
 * patient never actually receives.
 */
export function normalizeForMatching(text: string): string {
  let folded = text.normalize('NFKC').replace(INVISIBLES, '');

  folded = foldDigits(folded)
    .replace(/[‘’‛ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-');

  for (const [pattern, expansion] of CONTRACTIONS) {
    folded = folded.replace(pattern, expansion);
  }

  return normalizeWhitespace(folded.replace(EMPHASIS, ''));
}

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

/** Splits sentences without rewriting their patient-visible text. */
export function splitSentencesPreservingText(text: string): string[] {
  return text
    .trim()
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');
}

/**
 * Good enough for our purposes, and its failure mode is safe: a mis-split
 * sentence gives a rule *more* text to match against, never less, so an
 * abbreviation like "e.g." can only ever cause an extra rejection, not a
 * missed one.
 */
export function splitSentences(text: string): string[] {
  return splitSentencesPreservingText(normalizeForMatching(text));
}

const SNIPPET_PADDING = 28;

/** The matched fragment plus a little context, for the rejection log. */
export function snippetAround(
  text: string,
  index: number,
  length: number,
): string {
  const start = Math.max(0, index - SNIPPET_PADDING);
  const end = Math.min(text.length, index + length + SNIPPET_PADDING);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export interface PatternHit {
  matched: string;
  evidence: string;
}

/** Every distinct hit for `pattern` in `text`, each with its surrounding context. */
export function findHits(text: string, pattern: RegExp): PatternHit[] {
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  const hits: PatternHit[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(global)) {
    const matched = match[0];
    const key = matched.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      matched,
      evidence: snippetAround(text, match.index ?? 0, matched.length),
    });
  }

  return hits;
}

/**
 * Blanks out spans matching `masks` before the caller runs its own pattern,
 * preserving offsets so evidence snippets still line up with the original.
 *
 * Used for the handful of places where a phrase is clinical in one
 * collocation and ordinary English in another.
 */
export function maskSpans(text: string, masks: readonly RegExp[]): string {
  let masked = text;
  for (const mask of masks) {
    const global = new RegExp(
      mask.source,
      mask.flags.includes('g') ? mask.flags : `${mask.flags}g`,
    );
    masked = masked.replace(global, (match) => ' '.repeat(match.length));
  }
  return masked;
}
