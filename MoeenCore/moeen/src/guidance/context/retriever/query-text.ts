import { GuidanceIntent, PatientScope } from '../../contracts';

/**
 * The text embedded for the similarity half of the hybrid query. A real
 * patient-typed question (only ever present for medication_question) is
 * used as-is — it's the most semantically specific signal available, and
 * nothing here should second-guess it. Every other case has no natural
 * free text to fall back on, so this synthesizes a reasonable default per
 * intent. This is a judgment call about retrieval strategy, not a settled,
 * measured choice — revisit once real usage shows what actually retrieves
 * well.
 */
export function resolveQueryText(
  intent: GuidanceIntent,
  scope: PatientScope,
  question?: string,
): string {
  if (question) return question;

  const ingredientNames = scope.medications
    .map((m) => m.ingredientName)
    .join(', ');

  switch (intent) {
    case 'explain_finding': {
      // The safety engine's own rationale is the most specific text
      // available for explaining a finding — closer to the actual
      // question than a generic "warnings for X" would be.
      const rationales = scope.findings.map((f) => f.rationale);
      return rationales.length > 0
        ? rationales.join('. ')
        : `warnings and drug interactions for ${ingredientNames}`;
    }
    case 'missed_dose':
      return `dosage and administration guidance after a missed dose of ${ingredientNames}`;
    case 'medication_question':
      return `general guidance about ${ingredientNames}`;
  }
}
