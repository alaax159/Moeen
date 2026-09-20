import type {
  DuplicateMedication,
  MedicationSafetyWarning,
} from "@/features/medications/add/api";
import type { AddMedicationPayload } from "@/features/medications/add/types";

export type PrescriptionMedicationDraft = {
  name: string;
  dose: number | null;
  unit: string | null;
  dosageForm: string | null;
  frequency: string | null;
  duration: string | null;
  times: string[];
  instructions: string | null;
  rxcui: string | null;
  normalizedName: string | null;
  needsReview: boolean;
};

export type PrescriptionScanDraft = {
  status: "draft";
  ocr: {
    text: string;
    confidence?: number;
  };
  items: PrescriptionMedicationDraft[];
};

export type PrescriptionImageFile = {
  uri: string;
  name: string;
  type: "image/jpeg" | "image/png";
};

export type PrescriptionConfirmItemStatus = "added" | "blocked" | "failed";

export type PrescriptionConfirmItemResult = {
  index: number;
  name: string;
  status: PrescriptionConfirmItemStatus;
  userMedicationId?: number | null;
  warnings: MedicationSafetyWarning[];
  duplicateMedication?: DuplicateMedication | null;
  message?: string | null;
};

export type PrescriptionConfirmResult = {
  addedCount: number;
  blockedCount: number;
  failedCount: number;
  results: PrescriptionConfirmItemResult[];
};

export type PrescriptionConfirmMedication = AddMedicationPayload & {
  acknowledgeWarnings?: boolean;
};
