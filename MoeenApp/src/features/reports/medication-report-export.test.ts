/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  MedicationReportExportError,
  buildMedicationReportFileName,
  cleanupGeneratedMedicationReportPdf,
  downloadMedicationReportPdf,
  generateMedicationReportPdf,
  shareMedicationReportPdf,
  type MedicationReportExportAdapter,
} from "./medication-report-export-core";

function adapter(
  overrides: Partial<MedicationReportExportAdapter> = {},
): MedicationReportExportAdapter {
  return {
    async generatePdf() {
      return "file:///cache/report.pdf";
    },
    async savePdf() {
      return "content://saved/report.pdf";
    },
    async isSharingAvailable() {
      return true;
    },
    async preparePdfForSharing() {
      return "file:///cache/share-report.pdf";
    },
    async sharePdf() {},
    async deleteTemporaryPdf() {},
    ...overrides,
  };
}

test("report filename is stable and filesystem safe", () => {
  const name = buildMedicationReportFileName(
    new Date(2026, 8, 2, 12, 7, 34),
  );

  assert.equal(name, "Moeen-Medication-Report-2026-09-02-12-07.pdf");
  assert.doesNotMatch(name, /[:/\\]/);
});

test("PDF generation returns URI and generated filename", async () => {
  let receivedHtml = "";

  const result = await generateMedicationReportPdf(
    "<html>report</html>",
    adapter({
      async generatePdf(html) {
        receivedHtml = html;
        return "file:///cache/generated.pdf";
      },
    }),
    new Date(2026, 8, 2, 12, 7),
  );

  assert.equal(receivedHtml, "<html>report</html>");
  assert.equal(result.uri, "file:///cache/generated.pdf");
  assert.equal(
    result.fileName,
    "Moeen-Medication-Report-2026-09-02-12-07.pdf",
  );
});

test("PDF generation exposes a user-safe generation error", async () => {
  await assert.rejects(
    () =>
      generateMedicationReportPdf(
        "<html></html>",
        adapter({
          async generatePdf() {
            throw new Error("native printer error");
          },
        }),
      ),
    (error: unknown) =>
      error instanceof MedicationReportExportError &&
      error.code === "generation_failed" &&
      error.message === "Unable to generate the medication report.",
  );
});

test("generated temporary report cleanup deletes the generated source", async () => {
  let deletedUri = "";

  await cleanupGeneratedMedicationReportPdf(
    {
      uri: "file:///print/generated-sensitive-report.pdf",
      fileName: "report.pdf",
    },
    adapter({
      async deleteTemporaryPdf(uri) {
        deletedUri = uri;
      },
    }),
  );

  assert.equal(
    deletedUri,
    "file:///print/generated-sensitive-report.pdf",
  );
});

test("download returns the final saved URI", async () => {
  const result = await downloadMedicationReportPdf(
    {
      uri: "file:///cache/report.pdf",
      fileName: "report.pdf",
    },
    adapter(),
  );

  assert.equal(result, "content://saved/report.pdf");
});

test("cancelled directory selection is not reported as a failed download", async () => {
  await assert.rejects(
    () =>
      downloadMedicationReportPdf(
        {
          uri: "file:///cache/report.pdf",
          fileName: "report.pdf",
        },
        adapter({
          async savePdf() {
            return null;
          },
        }),
      ),
    (error: unknown) =>
      error instanceof MedicationReportExportError &&
      error.code === "download_cancelled",
  );
});

test("download native failures are normalized", async () => {
  await assert.rejects(
    () =>
      downloadMedicationReportPdf(
        {
          uri: "file:///cache/report.pdf",
          fileName: "report.pdf",
        },
        adapter({
          async savePdf() {
            throw new Error("filesystem failure");
          },
        }),
      ),
    (error: unknown) =>
      error instanceof MedicationReportExportError &&
      error.code === "download_failed",
  );
});

test("share checks availability before opening native sharing", async () => {
  let shareCalled = false;

  await assert.rejects(
    () =>
      shareMedicationReportPdf(
        {
          uri: "file:///cache/report.pdf",
          fileName: "report.pdf",
        },
        adapter({
          async isSharingAvailable() {
            return false;
          },
          async sharePdf() {
            shareCalled = true;
          },
        }),
      ),
    (error: unknown) =>
      error instanceof MedicationReportExportError &&
      error.code === "sharing_unavailable",
  );

  assert.equal(shareCalled, false);
});

test("share uses a cache copy and cleans it after sharing", async () => {
  let preparedSource = "";
  let sharedUri = "";
  let sharedName = "";
  let deletedUri = "";

  await shareMedicationReportPdf(
    {
      uri: "file:///print/generated.pdf",
      fileName: "Moeen-report.pdf",
    },
    adapter({
      async preparePdfForSharing(sourceUri, fileName) {
        preparedSource = sourceUri;
        assert.equal(fileName, "Moeen-report.pdf");
        return "file:///cache/Moeen-report.pdf";
      },
      async sharePdf(uri, fileName) {
        sharedUri = uri;
        sharedName = fileName;
      },
      async deleteTemporaryPdf(uri) {
        deletedUri = uri;
      },
    }),
  );

  assert.equal(preparedSource, "file:///print/generated.pdf");
  assert.equal(sharedUri, "file:///cache/Moeen-report.pdf");
  assert.equal(sharedName, "Moeen-report.pdf");
  assert.equal(deletedUri, "file:///cache/Moeen-report.pdf");
});

test("share native failures are normalized and the cache copy is cleaned", async () => {
  let deletedUri = "";

  await assert.rejects(
    () =>
      shareMedicationReportPdf(
        {
          uri: "file:///print/generated.pdf",
          fileName: "report.pdf",
        },
        adapter({
          async preparePdfForSharing() {
            return "file:///cache/share-report.pdf";
          },
          async sharePdf() {
            throw new Error("share sheet failure");
          },
          async deleteTemporaryPdf(uri) {
            deletedUri = uri;
          },
        }),
      ),
    (error: unknown) =>
      error instanceof MedicationReportExportError &&
      error.code === "sharing_failed",
  );

  assert.equal(deletedUri, "file:///cache/share-report.pdf");
});
