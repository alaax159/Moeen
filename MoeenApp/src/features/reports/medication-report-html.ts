import type {
  MedicationUsageReport,
  MedicationUsageReportMedication,
} from "./medication-usage-report";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayDate(value: string | null): string {
  if (!value) {
    return "Ongoing";
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function medicationName(
  medication: MedicationUsageReportMedication,
): string {
  const brand = medication.brandName?.trim() ?? "";
  const generic = medication.genericName?.trim() ?? "";

  if (brand && generic && brand.toLowerCase() !== generic.toLowerCase()) {
    return `${escapeHtml(brand)} <span class="generic">(${escapeHtml(generic)})</span>`;
  }

  return escapeHtml(brand || generic || "Medication");
}

function medicationRows(report: MedicationUsageReport): string {
  if (report.medications.length === 0) {
    return `
      <div class="empty">
        No medication history is available for this report.
      </div>
    `;
  }

  return report.medications
    .map(
      (medication) => `
        <div class="medication-card">
          <div class="medication-heading">
            <div>
              <div class="medication-name">${medicationName(medication)}</div>
              <div class="medication-dose">
                ${escapeHtml(medication.dosageAmount)} ${escapeHtml(
                  medication.dosageUnit,
                )} · ${escapeHtml(medication.dosageForm)}
              </div>
            </div>
            <span class="status ${medication.status}">
              ${medication.status === "current" ? "Current" : "Past"}
            </span>
          </div>

          <div class="medication-grid">
            <div>
              <span class="meta-label">Frequency</span>
              <span class="meta-value">${medication.frequency}</span>
            </div>
            <div>
              <span class="meta-label">Started</span>
              <span class="meta-value">${displayDate(medication.startDate)}</span>
            </div>
            <div>
              <span class="meta-label">Ended</span>
              <span class="meta-value">${displayDate(medication.endDate)}</span>
            </div>
          </div>

          ${
            medication.instructions
              ? `
                <div class="instructions">
                  <strong>Instructions:</strong>
                  ${escapeHtml(medication.instructions)}
                </div>
              `
              : ""
          }
        </div>
      `,
    )
    .join("");
}

function adherenceRows(report: MedicationUsageReport): string {
  if (report.days.length === 0) {
    return `
      <tr>
        <td colspan="5" class="table-empty">
          No dose activity is available for this period.
        </td>
      </tr>
    `;
  }

  return report.days
    .map(
      (day) => `
        <tr>
          <td>${displayDate(day.date)}</td>
          <td>${day.scheduled}</td>
          <td>${day.taken}</td>
          <td>${day.missed}</td>
          <td>${day.skipped}</td>
        </tr>
      `,
    )
    .join("");
}

export function renderMedicationUsageReportHtml(
  report: MedicationUsageReport,
): string {
  const adherence =
    report.doseSummary.adherencePercentage === null
      ? "—"
      : `${report.doseSummary.adherencePercentage}%`;

  const generatedAt = new Date(report.generatedAt);
  const generatedAtLabel = Number.isNaN(generatedAt.getTime())
    ? escapeHtml(report.generatedAt)
    : new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(generatedAt);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page {
      margin: 28px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #1f2933;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
    }

    .report {
      max-width: 760px;
      margin: 0 auto;
    }

    .header {
      margin-bottom: 24px;
      padding: 22px;
      border-radius: 18px;
      background: #f0faf3;
      border: 1px solid #d9efe0;
    }

    .brand {
      margin-bottom: 4px;
      color: #2f9e58;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1.4px;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.2;
    }

    .subtitle {
      margin-top: 6px;
      color: #64727e;
    }

    .period {
      margin-top: 14px;
      color: #43515c;
      font-weight: 600;
    }

    .section-title {
      margin: 24px 0 10px;
      font-size: 17px;
      font-weight: 800;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }

    .summary-card {
      padding: 14px;
      border: 1px solid #e2e8ec;
      border-radius: 14px;
      background: #ffffff;
    }

    .summary-label {
      color: #6b7883;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .summary-value {
      margin-top: 5px;
      font-size: 22px;
      font-weight: 800;
    }

    .medication-card {
      margin-bottom: 10px;
      padding: 14px;
      border: 1px solid #e2e8ec;
      border-radius: 14px;
      page-break-inside: avoid;
    }

    .medication-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .medication-name {
      font-size: 15px;
      font-weight: 800;
    }

    .generic {
      color: #667580;
      font-weight: 600;
    }

    .medication-dose {
      margin-top: 3px;
      color: #667580;
    }

    .status {
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
    }

    .status.current {
      color: #207443;
      background: #dff5e7;
    }

    .status.past {
      color: #7254a3;
      background: #ede3fb;
    }

    .medication-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #edf0f2;
    }

    .meta-label,
    .meta-value {
      display: block;
    }

    .meta-label {
      color: #7b8790;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .meta-value {
      margin-top: 2px;
      font-weight: 650;
    }

    .instructions {
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

    th,
    td {
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

    tr:last-child td {
      border-bottom: 0;
    }

    .table-empty,
    .empty {
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

    .disclaimer {
      margin-top: 6px;
      color: #65727c;
    }
  </style>
</head>

<body>
  <main class="report">
    <section class="header">
      <div class="brand">Moeen</div>
      <h1>Medication Usage Report</h1>
      <div class="subtitle">
        Medication history and dose adherence summary
      </div>
      <div class="period">
        Adherence period: ${displayDate(report.adherencePeriod.startDate)} – ${displayDate(
          report.adherencePeriod.endDate,
        )}
      </div>
    </section>

    <div class="section-title">Overview</div>
    <section class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Current</div>
        <div class="summary-value">${report.medicationSummary.current}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Past</div>
        <div class="summary-value">${report.medicationSummary.past}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Adherence</div>
        <div class="summary-value">${adherence}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Missed</div>
        <div class="summary-value">${report.doseSummary.missed}</div>
      </div>
    </section>

    <div class="section-title">Medication History</div>
    <section>
      ${medicationRows(report)}
    </section>

    <div class="section-title">Dose Activity</div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Scheduled</th>
          <th>Taken</th>
          <th>Missed</th>
          <th>Skipped</th>
        </tr>
      </thead>
      <tbody>
        ${adherenceRows(report)}
      </tbody>
    </table>

    <footer class="footer">
      Generated ${generatedAtLabel}
      <div class="disclaimer">
        This report summarizes information recorded in Moeen and is not a
        substitute for medical advice.
      </div>
    </footer>
  </main>
</body>
</html>`;
}
