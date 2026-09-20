import { buildPromptVersion, fingerprintTemplate } from './prompt-version';
import { TemplateLoader, normaliseNewlines } from './template-loader.service';

/**
 * Guards the property the whole prompt_version stamp depends on: the
 * fingerprint identifies template *content*, not the checkout that produced
 * it.
 *
 * This repo has core.autocrlf on and no .gitattributes, so the same commit
 * lands as CRLF on a Windows machine and LF in CI. Before this was fixed, that
 * meant one commit produced two different prompt versions, and the snapshot
 * suite could not be green in both places at once — updating it on either
 * platform immediately broke the other.
 */
describe('prompt version fingerprint', () => {
  const LF = ['# Heading', '', 'Body line one.', 'Body line two.', ''].join(
    '\n',
  );
  const CRLF = LF.replace(/\n/g, '\r\n');

  it('is identical for CRLF and LF checkouts of the same template', () => {
    expect(fingerprintTemplate(CRLF)).toBe(fingerprintTemplate(LF));
  });

  it('still changes when the template text actually changes', () => {
    // The normalisation must not be so blunt that it stops noticing edits —
    // an accidental template change has to move the fingerprint, which is the
    // reason the fingerprint exists.
    expect(fingerprintTemplate(`${LF}Extra sentence.`)).not.toBe(
      fingerprintTemplate(LF),
    );
  });

  it('produces the same prompt version end to end regardless of line endings', () => {
    expect(
      buildPromptVersion(
        'missed_dose',
        'with-evidence',
        fingerprintTemplate(CRLF),
      ),
    ).toBe(
      buildPromptVersion(
        'missed_dose',
        'with-evidence',
        fingerprintTemplate(LF),
      ),
    );
  });

  it('normalises CRLF but leaves a lone CR and LF-only text alone', () => {
    expect(normaliseNewlines(CRLF)).toBe(LF);
    expect(normaliseNewlines(LF)).toBe(LF);
  });
});

describe('TemplateLoader', () => {
  it('hands back template text with no carriage returns, whatever the checkout did', () => {
    const loader = new TemplateLoader();

    for (const template of [
      'missed_dose',
      'explain_finding',
      'medication_question',
      '_shared-constraints',
      '_evidence-supplied',
      '_no-evidence',
    ]) {
      expect(loader.loadRaw(template)).not.toContain('\r');
    }
  });
});
