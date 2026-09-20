import { XMLParser } from 'fast-xml-parser';

import { labelSectionEnum } from '../../database/schema';

export type LabelSection = (typeof labelSectionEnum.enumValues)[number];

/**
 * Real DailyMed setid -> LOINC code mapping, verified against live SPL
 * documents (not from the spec — DailyMed's own section-code list). Some
 * targets have more than one real-world code:
 *  - warnings: 43685-7 is the modern combined "Warnings and Precautions"
 *    section; 34071-1 is the older standalone "Warnings" section used by
 *    labels that predate the merge. 34066-1 (BOXED WARNING) is folded in
 *    here too — an explicit product call (Islam, 2026-08-23): boxed
 *    warnings are strictly higher-severity safety content, so dropping
 *    them because they're not literally named "warnings" would be worse
 *    than merging them.
 */
const SECTION_CODES: Record<LabelSection, string[]> = {
  indications: ['34067-9'],
  dosage_and_administration: ['34068-7'],
  // Boxed warning listed first: when a label has both, its content leads
  // the combined "warnings" text (see collectText below).
  warnings: ['34066-1', '43685-7', '34071-1'],
  contraindications: ['34070-3'],
  adverse_reactions: ['34084-4'],
  drug_interactions: ['34073-7'],
};

// Fixed order so ordinal assignment (see label-processing.service.ts) is
// stable across re-processing the same label version — required for the
// (set_id, label_version, ordinal) unique index to upsert instead of
// duplicating.
export const SECTION_ORDER: LabelSection[] = [
  'indications',
  'dosage_and_administration',
  'warnings',
  'contraindications',
  'adverse_reactions',
  'drug_interactions',
];

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: true,
});

/** Recursively find every <section> node in the document, nested ones included — SPL nests real content one level down (e.g. "1.1 Hypertension" under "INDICATIONS & USAGE"). */
function findAllSections(nodes: XmlNode[], out: XmlNode[][]): XmlNode[][] {
  for (const node of nodes) {
    const section = node.section as XmlNode[] | undefined;
    if (section) {
      out.push(section);
      findAllSections(section, out);
      continue;
    }
    for (const key of Object.keys(node)) {
      if (key === ':@') continue;
      const value = node[key];
      if (Array.isArray(value)) findAllSections(value as XmlNode[], out);
    }
  }
  return out;
}

function sectionCode(section: XmlNode[]): string | undefined {
  for (const node of section) {
    if (node.code) {
      const attrs = node[':@'] as Record<string, string> | undefined;
      return attrs?.['@_code'];
    }
  }
  return undefined;
}

/**
 * Collects body text from a section's node list. Deliberately skips two
 * things: the <excerpt>/<highlight> subtree (DailyMed's condensed
 * "Highlights" restatement of the same section — including it alongside
 * the full text would mean near-duplicate chunks), and <linkHtml> (a
 * cross-reference number like "1.1" or "14.2" pointing at another
 * subsection — meaningless outside its own hyperlink, not prose).
 */
function collectText(nodes: XmlNode[], out: string[]): void {
  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key === ':@' || key === 'excerpt' || key === 'linkHtml') continue;

      if (key === '#text') {
        const text = String(node[key]).trim();
        if (text) out.push(text);
        continue;
      }

      const value = node[key];
      if (Array.isArray(value)) collectText(value as XmlNode[], out);
    }
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export interface ExtractedSection {
  section: LabelSection;
  text: string;
}

/**
 * Extracts the six sections we care about from a raw SPL XML document. A
 * label missing a section simply produces no entry for it — never throws,
 * never a phantom empty entry. When more than one real code maps to the
 * same target (warnings), every matching section's text is concatenated,
 * boxed warning first (highest severity content leads).
 */
export function extractSections(rawXml: string): ExtractedSection[] {
  const doc = parser.parse(rawXml) as XmlNode[];
  const allSections = findAllSections(doc, []);

  const results: ExtractedSection[] = [];

  for (const target of SECTION_ORDER) {
    const matchingTexts: string[] = [];
    for (const code of SECTION_CODES[target]) {
      const match = allSections.find((s) => sectionCode(s) === code);
      if (!match) continue;

      const pieces: string[] = [];
      collectText(match, pieces);
      const text = normalizeWhitespace(pieces.join(' '));
      if (text) matchingTexts.push(text);
    }

    if (matchingTexts.length > 0) {
      results.push({ section: target, text: matchingTexts.join(' ') });
    }
  }

  return results;
}
