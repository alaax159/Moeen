export interface ParsedPrescriptionMedication {
  name: string;
  dose: number | null;
  unit: string | null;
  dosageForm: string | null;
  frequency: string | null;
  duration: string | null;
  times: string[];
  instructions: string | null;
  requiresReview?: boolean;
}

export interface PrescriptionMedicationParser {
  parse(ocrText: string): unknown;
}

export const PRESCRIPTION_MEDICATION_PARSER = Symbol(
  'PRESCRIPTION_MEDICATION_PARSER',
);
