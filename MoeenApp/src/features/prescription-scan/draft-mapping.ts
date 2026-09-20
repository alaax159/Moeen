import type {
  DosageForm,
  DosageUnit,
  DurationValue,
  FrequencyValue,
} from "@/features/medications/add/types";
import { isValidTime } from "@/features/medications/add/utils";

import type { PrescriptionMedicationDraft } from "./types";

// Maps the free-text values extracted from a prescription onto the option
// values the add-medication form and API already use. Shared by the add
// screen and the prescription confirmation flow so both interpret a scanned
// medication identically.

export function mapPrescriptionUnit(value: string): DosageUnit {
  const unit = value.trim().toLowerCase();

  if (unit === "mg") return "mg";
  if (unit === "g") return "g";
  if (unit === "ml") return "ml";

  if (unit === "mcg" || unit === "ug" || unit === "µg") {
    return "mcg";
  }

  if (unit === "iu") return "IU";
  if (unit === "puff" || unit === "puffs") return "puff";
  if (unit === "drop" || unit === "drops") return "drop";

  return "";
}

export function mapPrescriptionDosageForm(value: string): DosageForm | null {
  const form = value.trim().toLowerCase();

  if (!form) return null;

  if (form.includes("tablet")) return "Tablet";
  if (form.includes("capsule")) return "Capsule";

  if (form.includes("liquid") || form.includes("syrup")) {
    return "Liquid (Syrup)";
  }

  if (form.includes("injection")) return "Injection";
  if (form.includes("patch")) return "Patch";

  if (form.includes("cream") || form.includes("ointment")) {
    return "Cream / Ointment";
  }

  if (form.includes("drop")) return "Drops";
  if (form.includes("inhaler")) return "Inhaler";
  if (form.includes("lozenge")) return "Lozenge";

  return null;
}

export function mapPrescriptionFrequency(value: string): FrequencyValue | null {
  const frequency = value.trim().toLowerCase();

  if (!frequency) return null;

  if (
    frequency.includes("once daily") ||
    frequency.includes("once a day") ||
    frequency === "daily"
  ) {
    return "once_daily";
  }

  if (
    frequency.includes("twice daily") ||
    frequency.includes("twice a day") ||
    frequency.includes("2 times")
  ) {
    return "twice_daily";
  }

  if (frequency.includes("three times") || frequency.includes("3 times")) {
    return "three_times_daily";
  }

  if (frequency.includes("four times") || frequency.includes("4 times")) {
    return "four_times_daily";
  }

  if (frequency.includes("every 8")) {
    return "every_8_hours";
  }

  if (frequency.includes("every 6")) {
    return "every_6_hours";
  }

  if (frequency.includes("as needed") || frequency.includes("prn")) {
    return "as_needed";
  }

  return null;
}

export function mapPrescriptionDuration(value: string): {
  duration: DurationValue;
  customDays: string;
} | null {
  const duration = value.trim().toLowerCase();

  if (!duration) return null;

  if (duration === "3 days") {
    return { duration: "3_days", customDays: "" };
  }

  if (duration === "1 week" || duration === "7 days") {
    return { duration: "1_week", customDays: "" };
  }

  if (duration === "2 weeks" || duration === "14 days") {
    return { duration: "2_weeks", customDays: "" };
  }

  if (duration === "1 month" || duration === "30 days") {
    return { duration: "1_month", customDays: "" };
  }

  const match = duration.match(/^(\d+)\s*days?$/);

  if (match) {
    return {
      duration: "custom",
      customDays: match[1],
    };
  }

  return null;
}

export function parsePrescriptionTimes(value: string): string[] {
  if (!value) return [];

  return value
    .split("|")
    .map((time) => time.trim())
    .filter((time) => isValidTime(time));
}

const FREQUENCY_LABELS: Record<FrequencyValue, string> = {
  once_daily: "Once daily",
  twice_daily: "Twice daily",
  three_times_daily: "Three times daily",
  four_times_daily: "Four times daily",
  every_8_hours: "Every 8 hours",
  every_6_hours: "Every 6 hours",
  as_needed: "As needed",
};

const DURATION_LABELS: Record<Exclude<DurationValue, "custom">, string> = {
  "3_days": "3 days",
  "1_week": "1 week",
  "2_weeks": "2 weeks",
  "1_month": "1 month",
};

export type PrescriptionDraftEdits = {
  name: string;
  dose: string;
  unit: DosageUnit;
  dosageForm: DosageForm;
  frequency: FrequencyValue;
  duration: DurationValue;
  customDays: string;
  times: string[];
  instructions: string;
};

// Writes the values edited on the add screen back onto the scanned draft item.
// Labels are the human-readable forms the map* helpers above parse, so an
// edited item round-trips through the same mapping as a freshly scanned one.
export function applyPrescriptionDraftEdits(
  item: PrescriptionMedicationDraft,
  edits: PrescriptionDraftEdits,
): PrescriptionMedicationDraft {
  const dose = Number(edits.dose);
  const name = edits.name.trim();

  return {
    ...item,
    // The original OCR name is kept for provenance; the edited name is what
    // the review screen shows and what gets confirmed.
    normalizedName: name || item.normalizedName,
    dose: Number.isFinite(dose) && dose > 0 ? dose : null,
    unit: edits.unit || null,
    dosageForm: edits.dosageForm,
    frequency: FREQUENCY_LABELS[edits.frequency],
    duration:
      edits.duration === "custom"
        ? `${edits.customDays.trim()} days`
        : DURATION_LABELS[edits.duration],
    times: edits.times,
    instructions: edits.instructions.trim() || null,
    // The user has now explicitly reviewed this medication.
    needsReview: false,
  };
}
