import type { AddMedicationPayload } from "@/features/medications/add/types";
import { formatScheduleTime } from "@/features/medications/add/utils";

import {
  mapPrescriptionDosageForm,
  mapPrescriptionDuration,
  mapPrescriptionUnit,
} from "./draft-mapping";
import type { PrescriptionMedicationDraft } from "./types";

// Fields the user must have supplied before a scanned medication can be
// confirmed. The review screen surfaces these so nothing incomplete is sent.
export type PrescriptionDraftIssue =
  "name" | "dose" | "unit" | "dosageForm" | "times";

export function findPrescriptionDraftIssues(
  item: PrescriptionMedicationDraft,
): PrescriptionDraftIssue[] {
  const issues: PrescriptionDraftIssue[] = [];

  if (!resolveMedicationName(item)) issues.push("name");
  if (item.dose === null || !(item.dose > 0)) issues.push("dose");
  if (!mapPrescriptionUnit(item.unit ?? "")) issues.push("unit");
  if (!mapPrescriptionDosageForm(item.dosageForm ?? ""))
    issues.push("dosageForm");
  if (item.times.length === 0) issues.push("times");

  return issues;
}

export function isPrescriptionDraftConfirmable(
  item: PrescriptionMedicationDraft,
): boolean {
  return findPrescriptionDraftIssues(item).length === 0;
}

export function resolveMedicationName(
  item: PrescriptionMedicationDraft,
): string {
  return item.normalizedName?.trim() || item.name.trim();
}

// Builds the payload for the existing add-medication contract from a reviewed
// prescription item, preserving exactly the values shown on the review screen.
// Returns null when the item is still missing required details.
export function buildConfirmPayload(
  item: PrescriptionMedicationDraft,
): AddMedicationPayload | null {
  if (!isPrescriptionDraftConfirmable(item)) return null;

  const name = resolveMedicationName(item);
  const dosageUnit = mapPrescriptionUnit(item.unit ?? "");
  const dosageForm = mapPrescriptionDosageForm(item.dosageForm ?? "");
  const rxcui = item.rxcui?.trim();

  if (!dosageUnit || !dosageForm || item.dose === null) return null;

  const mappedDuration = mapPrescriptionDuration(item.duration ?? "");
  const scheduleTimes = item.times;
  const instructions = item.instructions?.trim();
  const customDays = mappedDuration
    ? Number.parseInt(mappedDuration.customDays, 10)
    : Number.NaN;

  return {
    // A scanned prescription has no catalog row of its own. rxcui-backed
    // items keep their RxNorm identity so safety checks can resolve them;
    // everything else is a manual entry, matching the add screen.
    source: rxcui ? "rxnorm" : "manual",
    medication: {
      genericName: name,
      ...(rxcui ? { rxcui } : {}),
    },
    userMedication: {
      frequency: scheduleTimes.length,
      dosageAmount: item.dose,
      dosageUnit,
      dosageForm,
      ...(instructions ? { instructions } : {}),
      completion: "ongoing",
      durationOption: mappedDuration?.duration ?? "1_week",
      ...(mappedDuration?.duration === "custom" && Number.isFinite(customDays)
        ? { customDays }
        : {}),
    },
    scheduleTimes: scheduleTimes.map(formatScheduleTime),
  };
}
