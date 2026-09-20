import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { GuidanceIntent } from '../../contracts';

const TEMPLATES_DIR = join(__dirname, 'templates');
const SHARED_CONSTRAINTS_FILE = '_shared-constraints.md';
const INCLUDE_MARKER = '{{> _shared-constraints }}';
const EVIDENCE_DIRECTIVE_SLOT = '{{evidenceDirective}}';

/** Partials the assembler swaps into EVIDENCE_DIRECTIVE_SLOT, one per retrieval outcome. */
const EVIDENCE_PARTIALS = ['_no-evidence.md', '_evidence-supplied.md'];

const SYSTEM_DELIMITER = '--- SYSTEM ---';
const USER_DELIMITER = '--- USER ---';

/**
 * Typed as Record<GuidanceIntent, string> on purpose: adding an intent to the
 * frozen contract without adding a template here fails typecheck rather than
 * failing at runtime on a patient's request.
 */
const INTENT_TEMPLATES: Record<GuidanceIntent, string> = {
  missed_dose: 'missed_dose.md',
  explain_finding: 'explain_finding.md',
  medication_question: 'medication_question.md',
};

/** Everything the assembler is allowed to substitute. A typo'd placeholder fails here instead of rendering `{{medicatons}}` into a live prompt. */
const ALLOWED_PLACEHOLDERS = [
  'medications',
  'conditions',
  'allergies',
  'findings',
  'severity',
  'subjectMedication',
  'excerpts',
  'question',
  'evidenceDirective',
];

/**
 * Semantic anchors for the five properties the story requires of every system
 * prompt. They are deliberately short phrases rather than whole sentences, so
 * the wording can keep being iterated without the suite going red — but if an
 * edit removes the underlying rule, the anchor goes with it and this fails.
 * Reword freely; if you need to change an anchor, change it deliberately.
 */
const REQUIRED_CONSTRAINTS: { requirement: string; anchor: RegExp }[] = [
  {
    requirement: 'fixes the role as explaining, never prescribing',
    anchor: /never prescribe/i,
  },
  { requirement: 'forbids stating a dose amount', anchor: /dose amount/i },
  {
    requirement: 'forbids stating a dosing frequency',
    anchor: /dosing frequency/i,
  },
  {
    requirement: 'forbids stating a time of day or schedule change',
    anchor: /time of day to take/i,
  },
  { requirement: 'forbids diagnosing', anchor: /never diagnose/i },
  {
    requirement: 'requires claims to cite a supplied citation id',
    anchor: /citation id/i,
  },
  {
    requirement: 'forbids citing anything not supplied',
    anchor: /never invent/i,
  },
  {
    requirement: 'requires a referral to the doctor or pharmacist',
    anchor: /doctor or pharmacist/i,
  },
  {
    requirement:
      'presents findings as settled facts, not conclusions to re-derive',
    anchor: /settled facts/i,
  },
  { requirement: 'forbids arguing a severity up or down', anchor: /re-rank/i },
  {
    requirement: 'tells the model how to handle redaction placeholders',
    anchor: /\[PERSON_1\]/,
  },
  { requirement: 'defines the JSON output contract', anchor: /citationIds/ },
];

/**
 * Phrasings that would ask the model to classify how serious a symptom is.
 * Any escalation it triggers is a triage decision, and triage belongs to the
 * deterministic layer — which does not do symptom triage at all, so there is
 * nothing here for the model to be relaying. Raised in review on the original
 * limit 7, which made the urgent-care line conditional on symptoms "that sound
 * urgent" and so contradicted limit 2 outright.
 */
const FORBIDDEN_TRIAGE_PHRASINGS: { phrasing: string; anchor: RegExp }[] = [
  { phrasing: 'symptoms that sound urgent', anchor: /sound urgent/i },
  { phrasing: 'symptoms that seem serious', anchor: /seem serious/i },
  { phrasing: 'if the symptoms are severe', anchor: /symptoms are severe/i },
  { phrasing: 'if it seems/sounds like an emergency', anchor: /an emergency/i },
];

function readTemplate(fileName: string): string {
  return readFileSync(join(TEMPLATES_DIR, fileName), 'utf8');
}

/** Collapses line wrapping so an anchor phrase still matches after a paragraph is re-wrapped. */
function normalizeWhitespace(content: string): string {
  return content.replace(/\s+/g, ' ');
}

function systemSectionOf(content: string): string {
  const start = content.indexOf(SYSTEM_DELIMITER);
  const end = content.indexOf(USER_DELIMITER);
  return content.slice(start + SYSTEM_DELIMITER.length, end);
}

/** Every `{{name}}` in the file, ignoring `{{> partial }}` include markers. */
function placeholdersIn(content: string): string[] {
  const matches = content.matchAll(/\{\{\s*(?!>)([^}]+?)\s*\}\}/g);
  return [...matches].map((match) => match[1]);
}

const intentEntries = Object.entries(INTENT_TEMPLATES) as [
  GuidanceIntent,
  string,
][];

describe('guidance prompt templates', () => {
  describe('the shared constraint block', () => {
    const shared = normalizeWhitespace(readTemplate(SHARED_CONSTRAINTS_FILE));

    it.each(REQUIRED_CONSTRAINTS)(
      'still $requirement',
      ({ anchor }: { anchor: RegExp }) => {
        expect(shared).toMatch(anchor);
      },
    );

    it.each(FORBIDDEN_TRIAGE_PHRASINGS)(
      'never asks the model to decide "$phrasing"',
      ({ anchor }: { anchor: RegExp }) => {
        expect(shared).not.toMatch(anchor);
      },
    );
  });

  describe.each(intentEntries)('%s template', (_intent, fileName) => {
    const content = readTemplate(fileName);

    it('splits into a system and a user section, in that order', () => {
      expect(content).toContain(SYSTEM_DELIMITER);
      expect(content).toContain(USER_DELIMITER);
      expect(content.indexOf(SYSTEM_DELIMITER)).toBeLessThan(
        content.indexOf(USER_DELIMITER),
      );
    });

    it('carries the shared constraint block inside its system prompt', () => {
      expect(systemSectionOf(content)).toContain(INCLUDE_MARKER);
    });

    it('carries the evidence-directive slot inside its system prompt', () => {
      expect(systemSectionOf(content)).toContain(EVIDENCE_DIRECTIVE_SLOT);
    });

    it('supplies the findings and the citable excerpts', () => {
      expect(content).toContain('{{findings}}');
      expect(content).toContain('{{excerpts}}');
    });

    it('uses only known placeholders', () => {
      const unknown = placeholdersIn(content).filter(
        (name) => !ALLOWED_PLACEHOLDERS.includes(name),
      );
      expect(unknown).toEqual([]);
    });

    it('hardcodes no citation id or document id', () => {
      expect(content).not.toMatch(/chunk-|setid-/i);
    });
  });

  it('has no template file that is not reviewed here', () => {
    const expected = [
      ...Object.values(INTENT_TEMPLATES),
      ...EVIDENCE_PARTIALS,
      SHARED_CONSTRAINTS_FILE,
      'README.md',
    ].sort();

    expect(readdirSync(TEMPLATES_DIR).sort()).toEqual(expected);
  });
});
