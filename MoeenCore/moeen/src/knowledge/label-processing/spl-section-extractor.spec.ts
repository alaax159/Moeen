import * as fs from 'fs';
import * as path from 'path';

import { extractSections, SECTION_ORDER } from './spl-section-extractor';

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');
}

describe('extractSections', () => {
  it('finds all six sections in a full prescription label, warnings led by the boxed warning', () => {
    const xml = loadFixture('lisinopril-tablet.spl.xml');

    const sections = extractSections(xml);

    expect(sections.map((s) => s.section)).toEqual(SECTION_ORDER);
    for (const s of sections) {
      expect(s.text.length).toBeGreaterThan(0);
    }

    const warnings = sections.find((s) => s.section === 'warnings')!;
    expect(warnings.text.startsWith('WARNING: FETAL TOXICITY')).toBe(true);
  });

  it('does not throw and produces no phantom entries for sections a label is missing', () => {
    const xml = loadFixture('acetaminophen-tablet.spl.xml');

    const sections = extractSections(xml);

    const found = sections.map((s) => s.section);
    expect(found).toEqual([
      'indications',
      'dosage_and_administration',
      'warnings',
    ]);
    expect(found).not.toContain('contraindications');
    expect(found).not.toContain('adverse_reactions');
    expect(found).not.toContain('drug_interactions');

    for (const s of sections) {
      expect(s.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('strips cross-reference link text (e.g. "1.1", "14.2") rather than leaving it embedded in prose', () => {
    const xml = loadFixture('lisinopril-tablet.spl.xml');

    const sections = extractSections(xml);
    const allText = sections.map((s) => s.text).join(' ');

    // linkHtml's own text content (bare numbers like "14.1") should not
    // survive as a standalone token in the extracted prose.
    expect(allText).not.toMatch(/\(\s*14\.1\s*\)/);
  });

  it('returns an empty list for a document with none of the six target sections', () => {
    const xml =
      '<?xml version="1.0"?><document xmlns="urn:hl7-org:v3"><component><structuredBody></structuredBody></component></document>';

    expect(extractSections(xml)).toEqual([]);
  });
});
