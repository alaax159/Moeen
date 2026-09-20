import {
  buildConfirmPayload,
  isPrescriptionDraftConfirmable,
} from "./confirm-payload";
import type {
  PrescriptionConfirmItemResult,
  PrescriptionConfirmItemStatus,
  PrescriptionConfirmMedication,
  PrescriptionConfirmResult,
  PrescriptionMedicationDraft,
} from "./types";

// Builds the confirmation request for the reviewed medications. Indexes in the
// request line up with the draft items, so a per-medication result maps back to
// the row the user reviewed.
export function buildConfirmMedications(
  items: PrescriptionMedicationDraft[],
  acknowledgedIndexes: number[] = [],
): PrescriptionConfirmMedication[] | null {
  const submission = buildConfirmSubmission(
    items,
    items.map((_, index) => index),
    acknowledgedIndexes,
  );

  return submission?.medications ?? null;
}

export function canConfirmDraft(items: PrescriptionMedicationDraft[]): boolean {
  return items.length > 0 && items.every(isPrescriptionDraftConfirmable);
}

export function blockedIndexes(result: PrescriptionConfirmResult): number[] {
  return result.results
    .filter((item) => item.status === "blocked")
    .map((item) => item.index);
}

export function summarizeConfirmResult(result: PrescriptionConfirmResult) {
  const { addedCount, blockedCount, failedCount } = result;
  const total = addedCount + blockedCount + failedCount;

  if (addedCount === total && total > 0) {
    return {
      title: "Medications added",
      message:
        addedCount === 1
          ? "1 medication was added to your list."
          : `${addedCount} medications were added to your list.`,
      allAdded: true,
    };
  }

  const parts: string[] = [];

  if (addedCount > 0) parts.push(`${addedCount} added`);
  if (blockedCount > 0) parts.push(`${blockedCount} need your review`);
  if (failedCount > 0) parts.push(`${failedCount} could not be added`);

  return {
    title:
      addedCount > 0 ? "Some medications were added" : "No medications added",
    message: `${parts.join(", ")}.`,
    allAdded: false,
  };
}

// The warnings and duplicates the user has to accept before those medications
// can be saved, formatted for a single confirmation prompt.
export function describeBlockedItems(
  result: PrescriptionConfirmResult,
): string {
  return result.results
    .filter((item) => item.status === "blocked")
    .map((item) => describeBlockedItem(item))
    .join("\n\n");
}

function describeBlockedItem(item: PrescriptionConfirmItemResult): string {
  // A blocked item can carry a duplicate AND safety warnings. Showing only the
  // duplicate would let "Add anyway" acknowledge warnings the user never read,
  // so every reason is listed before acknowledgement is offered.
  const details: string[] = [];

  if (item.duplicateMedication) {
    details.push("You are already taking this medication.");
  }

  for (const warning of item.warnings) {
    details.push(warning.message);
  }

  return [`${item.name}:`, ...details].join("\n");
}

// A confirmation request plus the draft rows it was built from. Results come
// back indexed against this exact request, so `submittedIndexes` is what maps
// each result back to the row the user reviewed.
export type ConfirmSubmission = {
  medications: PrescriptionConfirmMedication[];
  submittedIndexes: number[];
};

// Builds a request from only the given draft rows, so medications already
// added by an earlier partial response are never resubmitted.
export function buildConfirmSubmission(
  items: PrescriptionMedicationDraft[],
  pendingIndexes: number[],
  acknowledgedIndexes: number[] = [],
): ConfirmSubmission | null {
  const medications: PrescriptionConfirmMedication[] = [];
  const submittedIndexes: number[] = [];

  for (const index of pendingIndexes) {
    const item = items[index];

    if (!item) return null;

    const payload = buildConfirmPayload(item);

    if (!payload) return null;

    medications.push({
      ...payload,
      ...(acknowledgedIndexes.includes(index)
        ? { acknowledgeWarnings: true }
        : {}),
    });
    submittedIndexes.push(index);
  }

  return medications.length > 0 ? { medications, submittedIndexes } : null;
}

// Rewrites request-relative result indexes back to draft indexes.
export function mapResultsToDraftIndexes(
  result: PrescriptionConfirmResult,
  submittedIndexes: number[],
): PrescriptionConfirmItemResult[] {
  return result.results.map((item) => ({
    ...item,
    index: submittedIndexes[item.index] ?? item.index,
  }));
}

export function indexesWithStatus(
  results: PrescriptionConfirmItemResult[],
  status: PrescriptionConfirmItemStatus,
): number[] {
  return results
    .filter((item) => item.status === status)
    .map((item) => item.index);
}

// Keeps the newest result per draft row, so rows resolved by an earlier
// response stay resolved when a later response only covers the remaining ones.
export function mergeItemResults(
  previous: PrescriptionConfirmItemResult[],
  next: PrescriptionConfirmItemResult[],
): PrescriptionConfirmItemResult[] {
  const byIndex = new Map(previous.map((item) => [item.index, item]));

  for (const item of next) {
    byIndex.set(item.index, item);
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

// The draft rows still awaiting a successful add. Blocked and failed rows stay
// pending so they remain available for acknowledgement or a later retry.
export function pendingDraftIndexes(
  items: PrescriptionMedicationDraft[],
  results: PrescriptionConfirmItemResult[],
): number[] {
  const added = new Set(indexesWithStatus(results, "added"));

  return items.map((_, index) => index).filter((index) => !added.has(index));
}

// Drops the removed row's result and shifts later rows down, so removing a row
// never makes an already-added medication look unresolved again.
export function shiftResultsAfterRemoval(
  results: PrescriptionConfirmItemResult[],
  removedIndex: number,
): PrescriptionConfirmItemResult[] {
  return results
    .filter((item) => item.index !== removedIndex)
    .map((item) =>
      item.index > removedIndex ? { ...item, index: item.index - 1 } : item,
    );
}
