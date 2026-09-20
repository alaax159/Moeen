import { Injectable } from '@nestjs/common';
import type {
  PatientScope,
  PatientScopeCondition,
  SafetyFinding,
} from '../../contracts';

const NONE_RECORDED = 'None recorded.';
const NO_FINDINGS =
  'No safety findings were raised for this patient. Do not invent one, and do not tell the patient this means anything in particular.';
const SUBJECT_UNIDENTIFIED =
  'The app could not identify which specific medicine this is about. Answer in general terms about what you are given, and do not guess which medicine is meant.';
const NO_QUESTION = 'No question text was supplied.';

/**
 * Turns a PatientScope into the plain-text blocks the templates expect.
 *
 * Dosing detail is deliberately left out. PatientScopeMedication carries
 * `frequency` and `scheduleSlots`, and neither is rendered here: the model is
 * forbidden from stating a dose frequency or a schedule, so the safest way to
 * hold that line is for the numbers never to be in front of it. The constraint
 * block still forbids it in words, as a second layer, but this is the layer
 * that cannot be talked around.
 */
@Injectable()
export class ScopeFormatter {
  formatMedications(scope: PatientScope): string {
    if (scope.medications.length === 0) return NONE_RECORDED;
    return scope.medications
      .map((medication) => `- ${medication.ingredientName}`)
      .join('\n');
  }

  formatConditions(scope: PatientScope): string {
    return this.formatCodedList(scope.conditions);
  }

  formatAllergies(scope: PatientScope): string {
    return this.formatCodedList(scope.allergies);
  }

  /**
   * Findings are rendered with the severity the engine already assigned, so
   * the model explains at the weight it was given rather than inferring one
   * from the wording of the rationale.
   */
  formatFindings(findings: SafetyFinding[]): string {
    if (findings.length === 0) return NO_FINDINGS;
    return findings
      .map(
        (finding: SafetyFinding) =>
          `- [type: ${finding.type}] [seriousness: ${finding.severity}] ${finding.rationale}`,
      )
      .join('\n');
  }

  /**
   * The name is resolved by the caller and passed in — PatientScopeMedication
   * has no id, so subjectMedicationId cannot be matched against the scope's own
   * entries from in here. See AssemblePromptInput.subjectMedicationName.
   *
   * When the caller could not resolve one, say so plainly. Guessing at the
   * medicine would put the wrong drug name in front of the model, and echoing
   * the raw internal id would leak an identifier the model has no use for.
   */
  formatSubjectMedication(subjectMedicationName?: string): string {
    const trimmed = subjectMedicationName?.trim();
    return trimmed ? trimmed : SUBJECT_UNIDENTIFIED;
  }

  formatQuestion(question?: string): string {
    const trimmed = question?.trim();
    return trimmed ? trimmed : NO_QUESTION;
  }

  private formatCodedList(entries: readonly PatientScopeCondition[]): string {
    if (entries.length === 0) return NONE_RECORDED;
    return entries
      .map((entry) =>
        entry.code ? `- ${entry.name} (code ${entry.code})` : `- ${entry.name}`,
      )
      .join('\n');
  }
}
