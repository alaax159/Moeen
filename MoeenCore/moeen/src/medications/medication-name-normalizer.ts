const ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\btab\.?\b/g, 'tablet'],
  [/\bcaps?\.?\b/g, 'capsule'],
  [/\bsusp\.?\b/g, 'suspension'],
  [/\binj\.?\b/g, 'injection'],
  [/\bi\.?v\.?\b/g, 'iv'],
  [/\bi\.?m\.?\b/g, 'im'],
];

/** Conservative normalization: strength and dosage-form tokens are retained. */
export function normalizeMedicationName(value: string): string {
  let normalized = value.normalize('NFKC').toLocaleLowerCase('en');

  for (const [pattern, replacement] of ABBREVIATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/[^\p{L}\p{N}%+/.]+/gu, ' ')
    .replace(/\s*([%+/.])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
