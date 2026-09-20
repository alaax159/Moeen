import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildConfirmPayload,
  findPrescriptionDraftIssues,
  isPrescriptionDraftConfirmable,
} from "./confirm-payload";
import {
  blockedIndexes,
  buildConfirmMedications,
  buildConfirmSubmission,
  canConfirmDraft,
  describeBlockedItems,
  indexesWithStatus,
  mapResultsToDraftIndexes,
  mergeItemResults,
  pendingDraftIndexes,
  shiftResultsAfterRemoval,
  summarizeConfirmResult,
} from "./confirm-flow";
import { applyPrescriptionDraftEdits } from "./draft-mapping";
import type {
  PrescriptionConfirmItemResult,
  PrescriptionConfirmResult,
  PrescriptionMedicationDraft,
} from "./types";

function draft(
  overrides: Partial<PrescriptionMedicationDraft> = {},
): PrescriptionMedicationDraft {
  return {
    name: "Amoxicillin",
    dose: 500,
    unit: "mg",
    dosageForm: "Tablet",
    frequency: "twice daily",
    duration: "1 week",
    times: ["08:00", "20:00"],
    instructions: "After food",
    rxcui: null,
    normalizedName: null,
    needsReview: false,
    ...overrides,
  };
}

test("builds an add-medication payload from the reviewed values", () => {
  const payload = buildConfirmPayload(draft());

  assert.ok(payload);
  assert.equal(payload.source, "manual");
  assert.equal(payload.medication.genericName, "Amoxicillin");
  assert.equal(payload.userMedication.dosageAmount, 500);
  assert.equal(payload.userMedication.dosageUnit, "mg");
  assert.equal(payload.userMedication.dosageForm, "Tablet");
  assert.equal(payload.userMedication.durationOption, "1_week");
  assert.equal(payload.userMedication.instructions, "After food");
  // frequency mirrors the number of scheduled times, as the add screen does.
  assert.equal(payload.userMedication.frequency, 2);
  assert.deepEqual(payload.scheduleTimes, ["08:00:00", "20:00:00"]);
});

test("preserves the edited name and rxcui identity", () => {
  const payload = buildConfirmPayload(
    draft({ normalizedName: "Amoxicillin trihydrate", rxcui: "723" }),
  );

  assert.ok(payload);
  // The normalized name the user reviewed wins over the raw OCR name.
  assert.equal(payload.medication.genericName, "Amoxicillin trihydrate");
  assert.equal(payload.medication.rxcui, "723");
  assert.equal(payload.source, "rxnorm");
});

test("maps a custom duration to custom days", () => {
  const payload = buildConfirmPayload(draft({ duration: "10 days" }));

  assert.ok(payload);
  assert.equal(payload.userMedication.durationOption, "custom");
  assert.equal(payload.userMedication.customDays, 10);
});

test("reports the details a scanned medication is still missing", () => {
  assert.deepEqual(
    findPrescriptionDraftIssues(
      draft({ dose: null, unit: null, dosageForm: null, times: [] }),
    ),
    ["dose", "unit", "dosageForm", "times"],
  );
  assert.deepEqual(findPrescriptionDraftIssues(draft()), []);
});

test("refuses to build a payload for an incomplete medication", () => {
  assert.equal(buildConfirmPayload(draft({ dose: null })), null);
  assert.equal(isPrescriptionDraftConfirmable(draft({ times: [] })), false);
});

test("confirmation is blocked until every medication is complete", () => {
  assert.equal(canConfirmDraft([]), false);
  assert.equal(canConfirmDraft([draft()]), true);
  assert.equal(canConfirmDraft([draft(), draft({ dose: null })]), false);
});

test("builds one request entry per reviewed medication, in order", () => {
  const medications = buildConfirmMedications([
    draft({ name: "Amoxicillin" }),
    draft({ name: "Ibuprofen" }),
  ]);

  assert.ok(medications);
  assert.equal(medications.length, 2);
  assert.equal(medications[0].medication.genericName, "Amoxicillin");
  assert.equal(medications[1].medication.genericName, "Ibuprofen");
  // Nothing is acknowledged on the first attempt, so safety still gates.
  assert.equal(medications[0].acknowledgeWarnings, undefined);
});

test("marks only the acknowledged medications on a retry", () => {
  const medications = buildConfirmMedications(
    [draft({ name: "Amoxicillin" }), draft({ name: "Ibuprofen" })],
    [1],
  );

  assert.ok(medications);
  assert.equal(medications[0].acknowledgeWarnings, undefined);
  assert.equal(medications[1].acknowledgeWarnings, true);
});

test("does not build a request when any medication is incomplete", () => {
  assert.equal(buildConfirmMedications([draft(), draft({ unit: null })]), null);
});

function result(
  overrides: Partial<PrescriptionConfirmResult> = {},
): PrescriptionConfirmResult {
  return {
    addedCount: 0,
    blockedCount: 0,
    failedCount: 0,
    results: [],
    ...overrides,
  };
}

test("summarises a fully successful confirmation", () => {
  const summary = summarizeConfirmResult(result({ addedCount: 2 }));

  assert.equal(summary.allAdded, true);
  assert.match(summary.message, /2 medications/);
});

test("summarises a partial confirmation without claiming success", () => {
  const summary = summarizeConfirmResult(
    result({ addedCount: 1, blockedCount: 1, failedCount: 1 }),
  );

  assert.equal(summary.allAdded, false);
  assert.match(summary.message, /1 added/);
  assert.match(summary.message, /1 need your review/);
  assert.match(summary.message, /1 could not be added/);
});

test("finds the blocked medications so they can be acknowledged", () => {
  const confirmResult = result({
    addedCount: 1,
    blockedCount: 1,
    results: [
      {
        index: 0,
        name: "Amoxicillin",
        status: "added",
        warnings: [],
      },
      {
        index: 1,
        name: "Ibuprofen",
        status: "blocked",
        warnings: [
          {
            warningType: "drug_allergy",
            severity: "high",
            message: "Allergy risk",
          },
        ],
      },
    ],
  });

  assert.deepEqual(blockedIndexes(confirmResult), [1]);
  assert.match(describeBlockedItems(confirmResult), /Ibuprofen/);
  assert.match(describeBlockedItems(confirmResult), /Allergy risk/);
});

test("draft edits are written back onto the scanned item", () => {
  const edited = applyPrescriptionDraftEdits(draft({ needsReview: true }), {
    name: "Amoxil",
    dose: "250",
    unit: "mg",
    dosageForm: "Capsule",
    frequency: "three_times_daily",
    duration: "2_weeks",
    customDays: "",
    times: ["08:00", "14:00", "20:00"],
    instructions: "  Before food  ",
  });

  assert.equal(edited.normalizedName, "Amoxil");
  assert.equal(edited.dose, 250);
  assert.equal(edited.unit, "mg");
  assert.equal(edited.dosageForm, "Capsule");
  assert.equal(edited.instructions, "Before food");
  assert.deepEqual(edited.times, ["08:00", "14:00", "20:00"]);
  // Editing counts as reviewing it.
  assert.equal(edited.needsReview, false);
  // The raw OCR name is kept for provenance.
  assert.equal(edited.name, "Amoxicillin");
});

test("edited values round-trip back into a confirm payload", () => {
  const edited = applyPrescriptionDraftEdits(draft(), {
    name: "Amoxil",
    dose: "250",
    unit: "mg",
    dosageForm: "Capsule",
    frequency: "three_times_daily",
    duration: "2_weeks",
    customDays: "",
    times: ["08:00", "14:00", "20:00"],
    instructions: "Before food",
  });

  const payload = buildConfirmPayload(edited);

  assert.ok(payload);
  assert.equal(payload.medication.genericName, "Amoxil");
  assert.equal(payload.userMedication.dosageAmount, 250);
  assert.equal(payload.userMedication.dosageForm, "Capsule");
  assert.equal(payload.userMedication.durationOption, "2_weeks");
  assert.equal(payload.userMedication.frequency, 3);
  assert.equal(payload.userMedication.instructions, "Before food");
});

test("a custom duration edit round-trips through the draft", () => {
  const edited = applyPrescriptionDraftEdits(draft(), {
    name: "Amoxicillin",
    dose: "500",
    unit: "mg",
    dosageForm: "Tablet",
    frequency: "once_daily",
    duration: "custom",
    customDays: "10",
    times: ["08:00"],
    instructions: "",
  });

  assert.equal(edited.duration, "10 days");
  assert.equal(edited.instructions, null);

  const payload = buildConfirmPayload(edited);

  assert.ok(payload);
  assert.equal(payload.userMedication.durationOption, "custom");
  assert.equal(payload.userMedication.customDays, 10);
});

test("an edit that clears the dose keeps the item unconfirmable", () => {
  const edited = applyPrescriptionDraftEdits(draft(), {
    name: "Amoxicillin",
    dose: "",
    unit: "mg",
    dosageForm: "Tablet",
    frequency: "once_daily",
    duration: "1_week",
    customDays: "",
    times: ["08:00"],
    instructions: "",
  });

  assert.equal(edited.dose, null);
  assert.equal(buildConfirmPayload(edited), null);
  assert.equal(canConfirmDraft([edited]), false);
});

// --- partial success must never resend an added medication ----------------

// Mirrors the screen: map the response onto draft rows, merge it with what is
// already known, and derive what may still be submitted.
function applyResponse(
  items: PrescriptionMedicationDraft[],
  known: PrescriptionConfirmItemResult[],
  submittedIndexes: number[],
  confirmResult: PrescriptionConfirmResult,
) {
  const mapped = mapResultsToDraftIndexes(confirmResult, submittedIndexes);
  const merged = mergeItemResults(known, mapped);

  return {
    merged,
    blocked: indexesWithStatus(mapped, "blocked"),
    pending: pendingDraftIndexes(items, merged),
  };
}

test("A added + B blocked: Add anyway submits only B", () => {
  const items = [draft({ name: "Amoxicillin" }), draft({ name: "Ibuprofen" })];

  const first = buildConfirmSubmission(items, [0, 1]);
  assert.ok(first);
  assert.deepEqual(first.submittedIndexes, [0, 1]);

  const { blocked, merged } = applyResponse(
    items,
    [],
    first.submittedIndexes,
    result({
      addedCount: 1,
      blockedCount: 1,
      results: [
        { index: 0, name: "Amoxicillin", status: "added", warnings: [] },
        { index: 1, name: "Ibuprofen", status: "blocked", warnings: [] },
      ],
    }),
  );

  assert.deepEqual(blocked, [1]);

  // "Add anyway" resends only the acknowledged blocked row.
  const retry = buildConfirmSubmission(items, blocked, blocked);
  assert.ok(retry);
  assert.deepEqual(retry.submittedIndexes, [1]);
  assert.equal(retry.medications.length, 1);
  assert.equal(retry.medications[0].medication.genericName, "Ibuprofen");
  assert.equal(retry.medications[0].acknowledgeWarnings, true);

  // A is resolved and is not pending for any later request.
  assert.deepEqual(pendingDraftIndexes(items, merged), [1]);
});

test("A added + B failed: the next Confirm submits only B", () => {
  const items = [draft({ name: "Amoxicillin" }), draft({ name: "Ibuprofen" })];

  const { pending, merged } = applyResponse(
    items,
    [],
    [0, 1],
    result({
      addedCount: 1,
      failedCount: 1,
      results: [
        { index: 0, name: "Amoxicillin", status: "added", warnings: [] },
        {
          index: 1,
          name: "Ibuprofen",
          status: "failed",
          warnings: [],
          message: "Server error",
        },
      ],
    }),
  );

  // The failed row stays available for retry; it is not silently dropped.
  assert.deepEqual(pending, [1]);
  assert.equal(merged.length, 2);

  const retry = buildConfirmSubmission(items, pending);
  assert.ok(retry);
  assert.deepEqual(retry.submittedIndexes, [1]);
  assert.equal(retry.medications[0].medication.genericName, "Ibuprofen");
  // Nothing was acknowledged, so safety still gates the retry.
  assert.equal(retry.medications[0].acknowledgeWarnings, undefined);
});

test("repeated partial responses can never resubmit an added medication", () => {
  const items = [
    draft({ name: "Amoxicillin" }),
    draft({ name: "Ibuprofen" }),
    draft({ name: "Metformin" }),
  ];

  // Round 1: A added, B blocked, C failed.
  const round1 = applyResponse(
    items,
    [],
    [0, 1, 2],
    result({
      addedCount: 1,
      blockedCount: 1,
      failedCount: 1,
      results: [
        { index: 0, name: "Amoxicillin", status: "added", warnings: [] },
        { index: 1, name: "Ibuprofen", status: "blocked", warnings: [] },
        { index: 2, name: "Metformin", status: "failed", warnings: [] },
      ],
    }),
  );

  assert.deepEqual(round1.pending, [1, 2]);

  // Round 2 resends only the pending rows; the response is indexed against
  // that request, so index 0 here is draft row 1.
  const round2Submission = buildConfirmSubmission(items, round1.pending);
  assert.ok(round2Submission);
  assert.deepEqual(round2Submission.submittedIndexes, [1, 2]);

  const round2 = applyResponse(
    items,
    round1.merged,
    round2Submission.submittedIndexes,
    result({
      addedCount: 1,
      failedCount: 1,
      results: [
        { index: 0, name: "Ibuprofen", status: "added", warnings: [] },
        { index: 1, name: "Metformin", status: "failed", warnings: [] },
      ],
    }),
  );

  // A stays added and B is now added; only C remains pending.
  assert.deepEqual(round2.pending, [2]);
  assert.equal(
    round2.merged.find((entry) => entry.index === 0)?.status,
    "added",
  );
  assert.equal(
    round2.merged.find((entry) => entry.index === 1)?.status,
    "added",
  );

  const round3 = buildConfirmSubmission(items, round2.pending);
  assert.ok(round3);
  assert.deepEqual(round3.submittedIndexes, [2]);
  assert.equal(round3.medications[0].medication.genericName, "Metformin");

  // Round 3 succeeds and nothing is left pending, so the flow completes.
  const final = applyResponse(
    items,
    round2.merged,
    round3.submittedIndexes,
    result({
      addedCount: 1,
      results: [{ index: 0, name: "Metformin", status: "added", warnings: [] }],
    }),
  );

  assert.deepEqual(final.pending, []);
});

test("removing a row keeps the remaining added rows resolved", () => {
  const items = [draft({ name: "Amoxicillin" }), draft({ name: "Ibuprofen" })];
  const known: PrescriptionConfirmItemResult[] = [
    { index: 0, name: "Amoxicillin", status: "added", warnings: [] },
    { index: 1, name: "Ibuprofen", status: "failed", warnings: [] },
  ];

  // The user removes the failed row; the added row stays resolved at its new
  // position instead of becoming pending again.
  const afterRemoval = shiftResultsAfterRemoval(known, 1);

  assert.deepEqual(pendingDraftIndexes([items[0]], afterRemoval), []);
  assert.equal(afterRemoval[0].status, "added");
});

// --- duplicate and safety warnings are both surfaced ----------------------

test("a blocked item shows the duplicate warning and every safety warning", () => {
  const confirmResult = result({
    blockedCount: 1,
    results: [
      {
        index: 0,
        name: "Ibuprofen",
        status: "blocked",
        duplicateMedication: {
          userMedicationId: 7,
          medicationId: 42,
          name: "Ibuprofen",
        },
        warnings: [
          {
            warningType: "drug_allergy",
            severity: "high",
            message: "Allergy risk: NSAIDs",
          },
          {
            warningType: "drug_drug",
            severity: "moderate",
            message: "Interacts with warfarin",
          },
        ],
      },
    ],
  });

  const described = describeBlockedItems(confirmResult);

  assert.match(described, /Ibuprofen/);
  // The duplicate message is preserved...
  assert.match(described, /You are already taking this medication\./);
  // ...and no safety warning is hidden behind it.
  assert.match(described, /Allergy risk: NSAIDs/);
  assert.match(described, /Interacts with warfarin/);
});

test("a blocked item without a duplicate still lists its warnings", () => {
  const confirmResult = result({
    blockedCount: 1,
    results: [
      {
        index: 0,
        name: "Ibuprofen",
        status: "blocked",
        warnings: [
          {
            warningType: "drug_allergy",
            severity: "high",
            message: "Allergy risk",
          },
        ],
      },
    ],
  });

  assert.match(describeBlockedItems(confirmResult), /Allergy risk/);
  assert.deepEqual(blockedIndexes(confirmResult), [0]);
});
