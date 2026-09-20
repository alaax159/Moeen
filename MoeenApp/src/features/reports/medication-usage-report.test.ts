/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import type { UserMedicationSummary } from "@/features/medications/list/types";
import type { WeeklyDosesResponse } from "@/features/schedule/types";
import { renderMedicationUsageReportHtml } from "./medication-report-html";
import { buildMedicationUsageReport } from "./medication-usage-report";

function medication(
  overrides: Partial<UserMedicationSummary> = {},
): UserMedicationSummary {
  return {
    id: 1,
    medicationId: 10,
    frequency: 2,
    dosageAmount: "1",
    dosageUnit: "tablet",
    dosageForm: "tablet",
    instructions: "Take with food.",
    status: "active",
    completion: "ongoing",
    startDate: "2026-08-01",
    endDate: null,
    createdAt: "2026-08-01T08:00:00.000Z",
    brandName: "Panadol",
    genericName: "Paracetamol",
    ...overrides,
  };
}

function weekly(
  overrides: Partial<WeeklyDosesResponse> = {},
): WeeklyDosesResponse {
  return {
    startDate: "2026-08-27",
    endDate: "2026-09-02",
    days: [
      {
        date: "2026-09-01",
        scheduled: 3,
        taken: 2,
        missed: 1,
        skipped: 0,
      },
      {
        date: "2026-09-02",
        scheduled: 2,
        taken: 2,
        missed: 0,
        skipped: 0,
      },
    ],
    ...overrides,
  };
}

test("builds a deterministic medication usage report from source data", () => {
  const report = buildMedicationUsageReport(
    [
      medication(),
      medication({
        id: 2,
        medicationId: 11,
        brandName: "Old medicine",
        genericName: "Old generic",
        status: "archived",
        completion: "completed",
        startDate: "2026-05-01",
        endDate: "2026-05-20",
      }),
    ],
    weekly(),
    "2026-09-02T09:00:00.000Z",
  );

  assert.deepEqual(report.medicationSummary, {
    total: 2,
    current: 1,
    past: 1,
  });

  assert.deepEqual(report.doseSummary, {
    scheduled: 5,
    taken: 4,
    missed: 1,
    skipped: 0,
    adherencePercentage: 80,
  });

  assert.equal(report.adherencePeriod.startDate, "2026-08-27");
  assert.equal(report.adherencePeriod.endDate, "2026-09-02");
  assert.equal(report.generatedAt, "2026-09-02T09:00:00.000Z");
  assert.equal(report.medications[0].status, "current");
  assert.equal(report.medications[1].status, "past");
});

test("adherence period is distinct from the full medication history", () => {
  const report = buildMedicationUsageReport(
    [
      medication({
        id: 22,
        medicationId: 220,
        brandName: "Historical medicine",
        genericName: "Historical generic",
        status: "archived",
        completion: "completed",
        startDate: "2026-05-01",
        endDate: "2026-05-20",
      }),
    ],
    weekly({
      startDate: "2026-08-27",
      endDate: "2026-09-02",
    }),
    "2026-09-02T09:00:00.000Z",
  );

  const html = renderMedicationUsageReportHtml(report);

  assert.equal(report.adherencePeriod.startDate, "2026-08-27");
  assert.equal(report.adherencePeriod.endDate, "2026-09-02");

  // Medication history intentionally remains complete even when a medication
  // falls outside the recent adherence window.
  assert.equal(report.medications.length, 1);
  assert.equal(report.medications[0].brandName, "Historical medicine");

  assert.match(
    html,
    /Adherence period: Aug 27, 2026 – Sep 2, 2026/,
  );
  assert.match(html, /Historical medicine/);
  assert.doesNotMatch(html, /Report period:/);
});

test("does not mutate medications or weekly dose source data", () => {
  const medications = [medication()];
  const weeklyDoses = weekly();

  const medicationsBefore = JSON.stringify(medications);
  const weeklyBefore = JSON.stringify(weeklyDoses);

  buildMedicationUsageReport(
    medications,
    weeklyDoses,
    "2026-09-02T09:00:00.000Z",
  );

  assert.equal(JSON.stringify(medications), medicationsBefore);
  assert.equal(JSON.stringify(weeklyDoses), weeklyBefore);
});

test("represents empty report data without inventing adherence", () => {
  const report = buildMedicationUsageReport(
    [],
    weekly({
      days: [],
    }),
    "2026-09-02T09:00:00.000Z",
  );

  assert.equal(report.medicationSummary.total, 0);
  assert.equal(report.doseSummary.scheduled, 0);
  assert.equal(report.doseSummary.adherencePercentage, null);
  assert.deepEqual(report.medications, []);
  assert.deepEqual(report.days, []);
});

test("HTML report contains the generated medication and dose summary", () => {
  const report = buildMedicationUsageReport(
    [medication()],
    weekly(),
    "2026-09-02T09:00:00.000Z",
  );

  const html = renderMedicationUsageReportHtml(report);

  assert.match(html, /Medication Usage Report/);
  assert.match(html, /Panadol/);
  assert.match(html, /Paracetamol/);
  assert.match(html, /80%/);
  assert.match(html, />1<\/div>/);
  assert.match(html, /Take with food\./);
});

test("HTML report preserves date-only calendar days across timezones", () => {
  const report = buildMedicationUsageReport(
    [
      medication({
        startDate: "2026-08-27",
        endDate: "2026-09-02",
      }),
    ],
    weekly({
      startDate: "2026-08-27",
      endDate: "2026-09-02",
      days: [
        {
          date: "2026-08-27",
          scheduled: 1,
          taken: 1,
          missed: 0,
          skipped: 0,
        },
      ],
    }),
    "2026-09-02T09:00:00.000Z",
  );

  const html = renderMedicationUsageReportHtml(report);

  assert.match(html, /Aug 27, 2026/);
  assert.match(html, /Sep 2, 2026/);
  assert.doesNotMatch(html, /Aug 26, 2026/);
  assert.doesNotMatch(html, /Sep 1, 2026/);
});

test("HTML report escapes medication content before rendering", () => {
  const report = buildMedicationUsageReport(
    [
      medication({
        brandName: '<script>alert("x")</script>',
        genericName: "Safe & Generic",
        instructions: "<b>Do not render HTML</b>",
      }),
    ],
    weekly(),
    "2026-09-02T09:00:00.000Z",
  );

  const html = renderMedicationUsageReportHtml(report);

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Safe &amp; Generic/);
  assert.match(html, /&lt;b&gt;Do not render HTML&lt;\/b&gt;/);
});

test("handles nullable medication names returned by the API", () => {
  const runtimeMedication = {
    ...medication(),
    brandName: "PANADOL",
    genericName: null,
  } as unknown as UserMedicationSummary;

  const report = buildMedicationUsageReport(
    [runtimeMedication],
    weekly(),
    "2026-09-02T09:00:00.000Z",
  );

  assert.equal(report.medications[0].brandName, "PANADOL");
  assert.equal(report.medications[0].genericName, "");

  const html = renderMedicationUsageReportHtml(report);

  assert.match(html, /PANADOL/);
});

test("falls back safely when both medication names are null", () => {
  const runtimeMedication = {
    ...medication(),
    brandName: null,
    genericName: null,
  } as unknown as UserMedicationSummary;

  const report = buildMedicationUsageReport(
    [runtimeMedication],
    weekly(),
    "2026-09-02T09:00:00.000Z",
  );

  const html = renderMedicationUsageReportHtml(report);

  assert.match(html, />Medication</);
});

test("current medications are listed before past medications", () => {
  const report = buildMedicationUsageReport(
    [
      medication({
        id: 1,
        brandName: "Past",
        status: "archived",
        completion: "completed",
        startDate: "2026-09-01",
      }),
      medication({
        id: 2,
        brandName: "Current",
        startDate: "2026-08-01",
      }),
    ],
    weekly(),
    "2026-09-02T09:00:00.000Z",
  );

  assert.equal(report.medications[0].brandName, "Current");
  assert.equal(report.medications[1].brandName, "Past");
});
