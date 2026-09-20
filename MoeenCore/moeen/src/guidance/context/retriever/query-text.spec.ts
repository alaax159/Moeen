import { patientScopeFixtures } from '../../__fixtures__/patient-scopes.fixture';
import { resolveQueryText } from './query-text';

describe('resolveQueryText', () => {
  it('uses the real patient question as-is when one is given, regardless of intent', () => {
    const text = resolveQueryText(
      'missed_dose',
      patientScopeFixtures.singleMedicationClear,
      'can I take my dose now or should I wait',
    );

    expect(text).toBe('can I take my dose now or should I wait');
  });

  it("explain_finding without a question falls back to the findings' own rationale text", () => {
    const text = resolveQueryText(
      'explain_finding',
      patientScopeFixtures.interactionCase,
      undefined,
    );

    expect(text).toBe(
      patientScopeFixtures.interactionCase.findings
        .map((f) => f.rationale)
        .join('. '),
    );
  });

  it('explain_finding with no findings falls back to a generic warnings/interactions default', () => {
    const text = resolveQueryText(
      'explain_finding',
      {
        ...patientScopeFixtures.singleMedicationClear,
        findings: [],
      },
      undefined,
    );

    expect(text).toBe('warnings and drug interactions for lisinopril');
  });

  it('missed_dose without a question falls back to a dosage/administration default naming the ingredients', () => {
    const text = resolveQueryText(
      'missed_dose',
      patientScopeFixtures.interactionCase,
      undefined,
    );

    expect(text).toBe(
      'dosage and administration guidance after a missed dose of warfarin, aspirin',
    );
  });

  it('medication_question without a question falls back to a general guidance default naming the ingredients', () => {
    const text = resolveQueryText(
      'medication_question',
      patientScopeFixtures.singleMedicationClear,
      undefined,
    );

    expect(text).toBe('general guidance about lisinopril');
  });

  it('treats an empty-string question the same as no question — falls back to the intent default', () => {
    const text = resolveQueryText(
      'medication_question',
      patientScopeFixtures.singleMedicationClear,
      '',
    );

    expect(text).toBe('general guidance about lisinopril');
  });
});
