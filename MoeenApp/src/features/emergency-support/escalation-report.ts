import { Platform } from "react-native";

import { authenticatedFetch } from "@/api/authenticated-fetch";
import { nativeMedicationReportExportAdapter } from "@/features/reports/medication-report-export-native";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

/**
 * Mirrors the backend EscalationExportMedicationDto
 * (MoeenCore: src/guidance/endpoints/escalation-export/dto).
 */
export interface EscalationReportMedication {
  userMedicationId: number;
  brandName: string | null;
  genericName: string | null;
  dosageAmount: string;
  dosageUnit: string;
  dosageForm: string;
  frequency: number;
  instructions: string | null;
  scheduleTimes: string[];
}

export type EscalationDoseStatus =
  | "taken"
  | "skipped"
  | "pending"
  | "snoozed"
  | "missed";

/**
 * Mirrors the backend EscalationExportDoseDto
 * (MoeenCore: src/guidance/endpoints/escalation-export/dto). `markedAt` is the
 * row's last status-change timestamp and is always sent (non-null).
 */
export interface EscalationDoseHistoryEntry {
  userMedicationId: number;
  brandName: string | null;
  genericName: string | null;
  date: string; // 'YYYY-MM-DD'
  scheduledFor: string; // ISO timestamp
  status: EscalationDoseStatus;
  markedAt: string; // ISO timestamp
}

/** Response body of GET /escalation/export (EscalationExportResponseDto). */
export interface EscalationExportResponse {
  medications: EscalationReportMedication[];
  recentDoses: EscalationDoseHistoryEntry[];
}

export type EscalationReportErrorCode =
  | "request_failed"
  | "invalid_response"
  | "generation_failed"
  | "sharing_unavailable"
  | "sharing_failed";

export class EscalationReportError extends Error {
  constructor(
    readonly code: EscalationReportErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EscalationReportError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFrom(body: unknown, fallback: string): string {
  if (!isObject(body) || !("message" in body)) {
    return fallback;
  }

  const message = body.message;

  return Array.isArray(message) ? message.join("\n") : String(message);
}

const DOSE_STATUSES: readonly EscalationDoseStatus[] = [
  "taken",
  "skipped",
  "pending",
  "snoozed",
  "missed",
];

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isEscalationReportMedication(
  value: unknown,
): value is EscalationReportMedication {
  return (
    isObject(value) &&
    typeof value.userMedicationId === "number" &&
    isNullableString(value.brandName) &&
    isNullableString(value.genericName) &&
    typeof value.dosageAmount === "string" &&
    typeof value.dosageUnit === "string" &&
    typeof value.dosageForm === "string" &&
    typeof value.frequency === "number" &&
    isNullableString(value.instructions) &&
    Array.isArray(value.scheduleTimes) &&
    value.scheduleTimes.every((time) => typeof time === "string")
  );
}

function isEscalationDoseHistoryEntry(
  value: unknown,
): value is EscalationDoseHistoryEntry {
  return (
    isObject(value) &&
    typeof value.userMedicationId === "number" &&
    isNullableString(value.brandName) &&
    isNullableString(value.genericName) &&
    typeof value.date === "string" &&
    typeof value.scheduledFor === "string" &&
    DOSE_STATUSES.includes(value.status as EscalationDoseStatus) &&
    typeof value.markedAt === "string"
  );
}

function isEscalationExportResponse(
  value: unknown,
): value is EscalationExportResponse {
  return (
    isObject(value) &&
    Array.isArray(value.medications) &&
    value.medications.every(isEscalationReportMedication) &&
    Array.isArray(value.recentDoses) &&
    value.recentDoses.every(isEscalationDoseHistoryEntry)
  );
}

/**
 * GET /escalation/export — the authenticated patient's current medications and
 * recent dose history, for the serious-reaction provider summary. Read-only.
 */
export async function getEscalationExport(): Promise<EscalationExportResponse> {
  let response: Response;

  try {
    response = await authenticatedFetch(`${API_BASE_URL}/escalation/export`);
  } catch (error) {
    throw new EscalationReportError(
      "request_failed",
      "Unable to prepare the provider summary. Check your connection and try again.",
      { cause: error },
    );
  }

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new EscalationReportError(
      "request_failed",
      errorMessageFrom(
        body,
        `Unable to prepare the provider summary (${response.status}).`,
      ),
    );
  }

  if (!isEscalationExportResponse(body)) {
    throw new EscalationReportError(
      "invalid_response",
      "The provider summary could not be read. Please try again.",
    );
  }

  return body;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function buildProviderSummaryFileName(date: Date): string {
  const datePart = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
  const timePart = [pad(date.getHours()), pad(date.getMinutes())].join("-");

  return `Moeen-Provider-Summary-${datePart}-${timePart}.pdf`;
}

function medicationLabel(
  entry: Pick<EscalationReportMedication, "brandName" | "genericName">,
): string {
  const brand = entry.brandName?.trim() ?? "";
  const generic = entry.genericName?.trim() ?? "";

  if (brand && generic && brand.toLowerCase() !== generic.toLowerCase()) {
    return `${escapeHtml(brand)} <span class="generic">(${escapeHtml(generic)})</span>`;
  }

  return escapeHtml(brand || generic || "Medication");
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function medicationRows(medications: EscalationReportMedication[]): string {
  if (medications.length === 0) {
    return `<div class="empty">No current medications are on file.</div>`;
  }

  return medications
    .map(
      (medication) => `
        <div class="card">
          <div class="card-name">${medicationLabel(medication)}</div>
          <div class="card-meta">
            ${escapeHtml(medication.dosageAmount)} ${escapeHtml(medication.dosageUnit)}
            · ${escapeHtml(medication.dosageForm)}
            · ${medication.frequency}x daily
          </div>
          ${
            medication.scheduleTimes.length > 0
              ? `<div class="card-meta">Times: ${escapeHtml(medication.scheduleTimes.join(", "))}</div>`
              : ""
          }
          ${
            medication.instructions
              ? `<div class="card-note"><strong>Instructions:</strong> ${escapeHtml(medication.instructions)}</div>`
              : ""
          }
        </div>`,
    )
    .join("");
}

function doseRows(recentDoses: EscalationDoseHistoryEntry[]): string {
  if (recentDoses.length === 0) {
    return `<tr><td colspan="4" class="table-empty">No recent dose activity is on file.</td></tr>`;
  }

  return recentDoses
    .map(
      (dose) => `
        <tr>
          <td>${escapeHtml(dose.date)}</td>
          <td>${medicationLabel(dose)}</td>
          <td>${formatTimestamp(dose.scheduledFor)}</td>
          <td class="status status-${dose.status}">${dose.status}</td>
        </tr>`,
    )
    .join("");
}

export function buildEscalationReportHtml(
  data: EscalationExportResponse,
): string {
  const generatedAtLabel = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { margin: 28px; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1f2933;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
    }
    .report { max-width: 760px; margin: 0 auto; }
    .header {
      margin-bottom: 24px;
      padding: 22px;
      border-radius: 18px;
      background: #fdecec;
      border: 1px solid #f5c4c4;
    }
    .brand {
      margin-bottom: 4px;
      color: #c0392b;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1.4px;
      text-transform: uppercase;
    }
    h1 { margin: 0; font-size: 26px; line-height: 1.2; }
    .subtitle { margin-top: 6px; color: #64727e; }
    .section-title { margin: 24px 0 10px; font-size: 17px; font-weight: 800; }
    .card {
      margin-bottom: 10px;
      padding: 14px;
      border: 1px solid #e2e8ec;
      border-radius: 14px;
      page-break-inside: avoid;
    }
    .card-name { font-size: 15px; font-weight: 800; }
    .generic { color: #667580; font-weight: 600; }
    .card-meta { margin-top: 3px; color: #667580; }
    .card-note {
      margin-top: 10px;
      padding: 9px 10px;
      border-radius: 9px;
      color: #4c5963;
      background: #f7f9fa;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border: 1px solid #e2e8ec;
      border-radius: 12px;
    }
    th, td {
      padding: 9px 10px;
      border-bottom: 1px solid #edf0f2;
      text-align: left;
    }
    th {
      color: #5f6c76;
      background: #f7f9fa;
      font-size: 10px;
      text-transform: uppercase;
    }
    tr:last-child td { border-bottom: 0; }
    .status { font-weight: 700; text-transform: capitalize; }
    .status-missed { color: #c0392b; }
    .status-skipped { color: #8a6d3b; }
    .status-taken { color: #207443; }
    .table-empty, .empty {
      padding: 18px;
      color: #71808b;
      text-align: center;
    }
    .footer {
      margin-top: 24px;
      padding-top: 14px;
      border-top: 1px solid #e5e9ec;
      color: #77838c;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <main class="report">
    <section class="header">
      <div class="brand">Moeen</div>
      <h1>Provider Summary</h1>
      <div class="subtitle">
        Current medications and recent dose history, prepared to share with a
        healthcare provider.
      </div>
    </section>

    <div class="section-title">Current Medications</div>
    <section>${medicationRows(data.medications)}</section>

    <div class="section-title">Recent Doses</div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Medication</th>
          <th>Scheduled for</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${doseRows(data.recentDoses)}</tbody>
    </table>

    <footer class="footer">
      Generated ${escapeHtml(generatedAtLabel)}. This summary reflects
      information recorded in Moeen and is not a substitute for medical advice.
    </footer>
  </main>
</body>
</html>`;
}

async function deleteTemporaryFileBestEffort(uri: string): Promise<void> {
  try {
    await nativeMedicationReportExportAdapter.deleteTemporaryPdf(uri);
  } catch {
    // Cleanup of a temporary file must not turn a completed share into a
    // failure. The native adapter deletes idempotently.
  }
}

/**
 * Fetches GET /escalation/export, renders the provider summary to a PDF
 * client-side (expo-print, via the shared medication-report export adapter),
 * and hands it to the OS share sheet. This is the implementation a host passes
 * as `EscalateDirectiveBanner`'s `onShareWithProvider`.
 */
export async function shareEscalationReportWithProvider(): Promise<void> {
  const data = await getEscalationExport();
  const html = buildEscalationReportHtml(data);

  let sourceUri: string;

  try {
    sourceUri = await nativeMedicationReportExportAdapter.generatePdf(html);
  } catch (error) {
    throw new EscalationReportError(
      "generation_failed",
      "Unable to generate the provider summary. Please try again.",
      { cause: error },
    );
  }

  let sharingAvailable: boolean;

  try {
    sharingAvailable =
      await nativeMedicationReportExportAdapter.isSharingAvailable();
  } catch (error) {
    await deleteTemporaryFileBestEffort(sourceUri);
    throw new EscalationReportError(
      "sharing_failed",
      "Unable to open the share sheet. Please try again.",
      { cause: error },
    );
  }

  if (!sharingAvailable) {
    await deleteTemporaryFileBestEffort(sourceUri);
    throw new EscalationReportError(
      "sharing_unavailable",
      "Sharing is not available on this device.",
    );
  }

  const fileName = buildProviderSummaryFileName(new Date());
  let shareUri: string | null = null;

  try {
    shareUri = await nativeMedicationReportExportAdapter.preparePdfForSharing(
      sourceUri,
      fileName,
    );

    await nativeMedicationReportExportAdapter.sharePdf(shareUri, fileName);
  } catch (error) {
    throw new EscalationReportError(
      "sharing_failed",
      "Unable to share the provider summary. Please try again.",
      { cause: error },
    );
  } finally {
    if (shareUri) {
      await deleteTemporaryFileBestEffort(shareUri);
    }
    await deleteTemporaryFileBestEffort(sourceUri);
  }
}
