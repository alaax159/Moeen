export const MEDICATION_REPORT_MIME_TYPE = "application/pdf";

export type MedicationReportExportErrorCode =
  | "generation_failed"
  | "download_cancelled"
  | "download_failed"
  | "sharing_unavailable"
  | "sharing_failed";

export class MedicationReportExportError extends Error {
  constructor(
    public readonly code: MedicationReportExportErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MedicationReportExportError";
  }
}

export interface GeneratedMedicationReport {
  uri: string;
  fileName: string;
}

export interface MedicationReportExportAdapter {
  generatePdf(html: string): Promise<string>;
  savePdf(sourceUri: string, fileName: string): Promise<string | null>;
  isSharingAvailable(): Promise<boolean>;
  preparePdfForSharing(sourceUri: string, fileName: string): Promise<string>;
  sharePdf(uri: string, fileName: string): Promise<void>;
  deleteTemporaryPdf(uri: string): Promise<void>;
}

async function deleteTemporaryPdfBestEffort(
  uri: string,
  adapter: MedicationReportExportAdapter,
): Promise<void> {
  try {
    await adapter.deleteTemporaryPdf(uri);
  } catch {
    // Temporary-file cleanup must not turn a completed user action into
    // a failure. The native adapter uses idempotent deletion.
  }
}

export async function cleanupGeneratedMedicationReportPdf(
  report: GeneratedMedicationReport,
  adapter: MedicationReportExportAdapter,
): Promise<void> {
  await deleteTemporaryPdfBestEffort(report.uri, adapter);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function buildMedicationReportFileName(date: Date): string {
  const datePart = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");

  const timePart = [pad(date.getHours()), pad(date.getMinutes())].join("-");

  return `Moeen-Medication-Report-${datePart}-${timePart}.pdf`;
}

export async function generateMedicationReportPdf(
  html: string,
  adapter: MedicationReportExportAdapter,
  now = new Date(),
): Promise<GeneratedMedicationReport> {
  try {
    const uri = await adapter.generatePdf(html);

    return {
      uri,
      fileName: buildMedicationReportFileName(now),
    };
  } catch (error) {
    throw new MedicationReportExportError(
      "generation_failed",
      "Unable to generate the medication report.",
      { cause: error },
    );
  }
}

export async function downloadMedicationReportPdf(
  report: GeneratedMedicationReport,
  adapter: MedicationReportExportAdapter,
): Promise<string> {
  try {
    const savedUri = await adapter.savePdf(report.uri, report.fileName);

    if (!savedUri) {
      throw new MedicationReportExportError(
        "download_cancelled",
        "Report download was cancelled.",
      );
    }

    return savedUri;
  } catch (error) {
    if (error instanceof MedicationReportExportError) {
      throw error;
    }

    throw new MedicationReportExportError(
      "download_failed",
      "Unable to save the medication report.",
      { cause: error },
    );
  }
}

export async function shareMedicationReportPdf(
  report: GeneratedMedicationReport,
  adapter: MedicationReportExportAdapter,
): Promise<void> {
  let available: boolean;

  try {
    available = await adapter.isSharingAvailable();
  } catch (error) {
    throw new MedicationReportExportError(
      "sharing_failed",
      "Unable to check sharing availability.",
      { cause: error },
    );
  }

  if (!available) {
    throw new MedicationReportExportError(
      "sharing_unavailable",
      "Sharing is not available on this device.",
    );
  }

  let shareUri: string | null = null;

  try {
    shareUri = await adapter.preparePdfForSharing(
      report.uri,
      report.fileName,
    );

    await adapter.sharePdf(shareUri, report.fileName);
  } catch (error) {
    throw new MedicationReportExportError(
      "sharing_failed",
      "Unable to share the medication report.",
      { cause: error },
    );
  } finally {
    if (shareUri) {
      await deleteTemporaryPdfBestEffort(shareUri, adapter);
    }
  }
}
