import { sectionPriority } from './section-priority';

describe('sectionPriority', () => {
  it('ranks drug_interactions and warnings above indications for an interaction question', () => {
    const interactions = sectionPriority(
      'explain_finding',
      'drug_interactions',
    );
    const warnings = sectionPriority('explain_finding', 'warnings');

    expect(interactions).toBeLessThan(
      sectionPriority('explain_finding', 'indications'),
    );
    expect(warnings).toBeLessThan(
      sectionPriority('explain_finding', 'indications'),
    );
  });

  it('ranks warnings above indications for a medication question', () => {
    expect(sectionPriority('medication_question', 'warnings')).toBeLessThan(
      sectionPriority('medication_question', 'indications'),
    );
  });

  it('ranks dosage_and_administration first for a missed dose', () => {
    expect(
      sectionPriority('missed_dose', 'dosage_and_administration'),
    ).toBeLessThan(sectionPriority('missed_dose', 'warnings'));
  });

  it('falls back to the same default priority for any unlisted section', () => {
    expect(sectionPriority('missed_dose', 'contraindications')).toBe(
      sectionPriority('missed_dose', 'adverse_reactions'),
    );
  });
});
