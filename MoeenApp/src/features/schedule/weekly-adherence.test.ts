/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import type { WeeklyDoseDay } from "./types";
import {
  getDoseDayPercentage,
  getWeekdayLabel,
  getWeeklyAdherencePercentage,
  orderWeeklyDoseDays,
} from "./weekly-adherence";

function day(overrides: Partial<WeeklyDoseDay> = {}): WeeklyDoseDay {
  return {
    date: "2026-09-01",
    scheduled: 4,
    taken: 3,
    missed: 1,
    skipped: 0,
    ...overrides,
  };
}

test("daily adherence returns null when no doses were scheduled", () => {
  assert.equal(
    getDoseDayPercentage(
      day({
        scheduled: 0,
        taken: 0,
        missed: 0,
      }),
    ),
    null,
  );
});

test("daily adherence represents a real zero percent when doses were scheduled", () => {
  assert.equal(
    getDoseDayPercentage(
      day({
        scheduled: 4,
        taken: 0,
        missed: 4,
      }),
    ),
    0,
  );
});

test("daily adherence is rounded to the nearest whole percent", () => {
  assert.equal(
    getDoseDayPercentage(
      day({
        scheduled: 3,
        taken: 2,
      }),
    ),
    67,
  );
});

test("weekly adherence uses total taken over total scheduled", () => {
  assert.equal(
    getWeeklyAdherencePercentage([
      day({
        date: "2026-08-31",
        scheduled: 2,
        taken: 2,
        missed: 0,
      }),
      day({
        date: "2026-09-01",
        scheduled: 3,
        taken: 1,
        missed: 2,
      }),
    ]),
    60,
  );
});

test("weekly adherence returns null when the entire week has no scheduled doses", () => {
  assert.equal(
    getWeeklyAdherencePercentage([
      day({
        scheduled: 0,
        taken: 0,
        missed: 0,
      }),
    ]),
    null,
  );
});

test("weekly days are ordered without mutating the API response", () => {
  const days = [
    day({
      date: "2026-09-01",
    }),
    day({
      date: "2026-08-30",
    }),
    day({
      date: "2026-08-31",
    }),
  ];

  const before = JSON.stringify(days);

  assert.deepEqual(
    orderWeeklyDoseDays(days).map((entry) => entry.date),
    ["2026-08-30", "2026-08-31", "2026-09-01"],
  );

  assert.equal(JSON.stringify(days), before);
});

test("weekday labels are based on the calendar date and not local timezone", () => {
  assert.equal(getWeekdayLabel("2026-09-01"), "Tue");
  assert.equal(getWeekdayLabel("2026-08-30"), "Sun");
});

test("daily adherence is capped at 100 percent when API counts are inconsistent", () => {
  assert.equal(
    getDoseDayPercentage(
      day({
        scheduled: 2,
        taken: 3,
        missed: 0,
      }),
    ),
    100,
  );
});

test("daily adherence never renders a negative percentage", () => {
  assert.equal(
    getDoseDayPercentage(
      day({
        scheduled: 2,
        taken: -1,
        missed: 0,
      }),
    ),
    0,
  );
});

test("weekly adherence is capped to a valid display range", () => {
  assert.equal(
    getWeeklyAdherencePercentage([
      day({
        scheduled: 2,
        taken: 5,
        missed: 0,
      }),
    ]),
    100,
  );
});
