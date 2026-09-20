/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import type { UserMedicationSummary } from "@/features/medications/list/types";
import type { WeeklyDosesResponse } from "@/features/schedule/types";

import {
  isCurrentMedication,
  summarizeMedicationHistory,
  summarizeWeeklyDoses,
} from "./medication-history-summary";

function medication(
  overrides: Partial<UserMedicationSummary> = {},
): UserMedicationSummary {
  return {
    id: 1,
    medicationId: 10,
    frequency: 1,
    dosageAmount: "1",
    dosageUnit: "tablet",
    dosageForm: "tablet",
    instructions: null,
    status: "active",
    completion: "ongoing",
    startDate: "2026-08-01",
    endDate: null,
    createdAt: "2026-08-01T08:00:00.000Z",
    brandName: "Example",
    genericName: "Example",
    ...overrides,
  };
}

function weekly(days: WeeklyDosesResponse["days"]): WeeklyDosesResponse {
  return {
    startDate: "2026-08-26",
    endDate: "2026-09-01",
    days,
  };
}

test("only active ongoing medications are considered current", () => {
  assert.equal(isCurrentMedication(medication()), true);

  assert.equal(
    isCurrentMedication(
      medication({
        status: "archived",
      }),
    ),
    false,
  );

  assert.equal(
    isCurrentMedication(
      medication({
        completion: "completed",
      }),
    ),
    false,
  );

  assert.equal(
    isCurrentMedication(
      medication({
        completion: "cancelled",
      }),
    ),
    false,
  );
});

test("medication counts partition every record into current or past", () => {
  const medications = [
    medication({
      id: 1,
    }),
    medication({
      id: 2,
      status: "archived",
    }),
    medication({
      id: 3,
      completion: "completed",
    }),
    medication({
      id: 4,
      completion: "cancelled",
    }),
  ];

  assert.deepEqual(summarizeMedicationHistory(medications), {
    total: 4,
    current: 1,
    past: 3,
  });
});

test("an empty medication history returns zero counts", () => {
  assert.deepEqual(summarizeMedicationHistory([]), {
    total: 0,
    current: 0,
    past: 0,
  });
});

test("weekly dose summary aggregates all returned days", () => {
  const result = summarizeWeeklyDoses(
    weekly([
      {
        date: "2026-08-31",
        scheduled: 3,
        taken: 2,
        missed: 1,
        skipped: 0,
      },
      {
        date: "2026-09-01",
        scheduled: 2,
        taken: 1,
        missed: 0,
        skipped: 1,
      },
    ]),
  );

  assert.deepEqual(result, {
    scheduled: 5,
    taken: 3,
    missed: 1,
    skipped: 1,
    adherencePercentage: 60,
  });
});

test("zero scheduled doses are represented as no adherence value", () => {
  const result = summarizeWeeklyDoses(
    weekly([
      {
        date: "2026-09-01",
        scheduled: 0,
        taken: 0,
        missed: 0,
        skipped: 0,
      },
    ]),
  );

  assert.equal(result.adherencePercentage, null);
  assert.equal(result.scheduled, 0);
});

test("zero taken doses with scheduled doses represents real zero percent adherence", () => {
  const result = summarizeWeeklyDoses(
    weekly([
      {
        date: "2026-09-01",
        scheduled: 4,
        taken: 0,
        missed: 3,
        skipped: 1,
      },
    ]),
  );

  assert.equal(result.adherencePercentage, 0);
});

test("adherence percentage is rounded to the nearest whole percent", () => {
  const result = summarizeWeeklyDoses(
    weekly([
      {
        date: "2026-09-01",
        scheduled: 3,
        taken: 2,
        missed: 1,
        skipped: 0,
      },
    ]),
  );

  assert.equal(result.adherencePercentage, 67);
});

test("summary calculations do not mutate API input", () => {
  const medications = [
    medication({
      id: 1,
    }),
  ];

  const weeklyDoses = weekly([
    {
      date: "2026-09-01",
      scheduled: 1,
      taken: 1,
      missed: 0,
      skipped: 0,
    },
  ]);

  const medicationsBefore = JSON.stringify(medications);
  const weeklyBefore = JSON.stringify(weeklyDoses);

  summarizeMedicationHistory(medications);
  summarizeWeeklyDoses(weeklyDoses);

  assert.equal(JSON.stringify(medications), medicationsBefore);
  assert.equal(JSON.stringify(weeklyDoses), weeklyBefore);
});

test("report summary caps adherence when API counts are inconsistent", () => {
  const result = summarizeWeeklyDoses(
    weekly([
      {
        date: "2026-09-01",
        scheduled: 2,
        taken: 3,
        missed: 0,
        skipped: 0,
      },
    ]),
  );

  assert.equal(result.adherencePercentage, 100);
});
