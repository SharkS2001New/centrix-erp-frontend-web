import { printHtmlDocument } from "@/lib/print-dispatch";
import { composeEmployeeDisplayName } from "@/components/hr/hr-shared";
import {
  buildReportOrgHeaderHtml,
  resolveReportBranding,
} from "@/lib/reports/report-branding";
import { formatPrintDisplayDate } from "@/lib/print-dates";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
  orgPrintPx,
} from "@/lib/print-typography";
import { resolvePrintedByUser } from "@/lib/printed-by-user";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  return formatPrintDisplayDate(value, { emptyLabel: "—" });
}

function formatPeriod(record) {
  const start = record?.start_date ?? record?.leave_date;
  const end = record?.end_date ?? start;
  if (!start) return "—";
  const a = formatDate(start);
  const b = formatDate(end);
  return a === b ? a : `${a} – ${b}`;
}

function deductFromLabel(value) {
  if (value === "annual") return "Annual leave";
  if (value === "sick") return "Sick leave";
  if (value === "unpaid") return "Unpaid leave";
  return "Off days";
}

function durationLabel(record) {
  if (record?.duration_type === "half_day") {
    const period = record?.half_day_period === "afternoon" ? "Afternoon" : "Morning";
    return `Half day (${period})`;
  }
  const days = Number(record?.total_days ?? record?.days_deducted ?? 0);
  if (days <= 0) return "Full day(s)";
  return days === 1 ? "1 working day" : `${days} working days`;
}

function statusLabel(status) {
  switch (status) {
    case "pending":
      return "Pending approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return status || "—";
  }
}

function employeeMeta(employee) {
  if (!employee) return "";
  const parts = [];
  if (employee.employee_code) parts.push(`#${employee.employee_code}`);
  const dept =
    employee.department?.name ??
    employee.department_name ??
    employee.department?.department_name ??
    null;
  if (dept) parts.push(dept);
  const position =
    employee.position?.title ??
    employee.position?.name ??
    employee.position_name ??
    null;
  if (position) parts.push(position);
  return parts.join(" · ");
}

function docStyles(generalSettings = null) {
  const px = (base, print = false) =>
    orgPrintPx(base, generalSettings, { variant: "loading_sheet", print });
  const font = orgPrintFontFamilyFromSettings(generalSettings, "loading_sheet");

  return `
    @page { size: A4; margin: 12mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ${font};
      color: #000;
      margin: 0;
      font-size: ${px(11)};
      line-height: 1.35;
      ${orgPrintInkStyles(generalSettings, "loading_sheet")}
    }
    .org-header { text-align: center; margin-bottom: 4px; }
    .org-logo { display: block; margin: 0 auto 6px; max-height: 40px; max-width: 180px; object-fit: contain; }
    .org-name {
      font-size: ${px(15)};
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .header { text-align: center; margin: 6px 0 10px; }
    .header .doc-title { margin: 0; font-size: ${px(13)}; font-weight: 700; text-transform: uppercase; }
    .header .doc-sub { margin: 3px 0 0; font-size: ${px(10)}; color: #444; }
    .status-banner {
      text-align: center;
      margin: 8px 0 10px;
      padding: 6px 10px;
      border: 1px solid #000;
      font-size: ${px(10)};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .status-banner.pending { border-style: dashed; }
    .status-banner.rejected { color: #7f1d1d; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin: 8px 0; font-size: ${px(11)}; }
    .meta strong { display: inline-block; min-width: 108px; font-weight: 700; }
    .notes {
      border: 1px solid #000;
      min-height: 48px;
      padding: 6px 10px;
      margin-top: 4px;
      font-size: ${px(11)};
      white-space: pre-wrap;
    }
    .notes-label { font-weight: 700; margin-top: 8px; font-size: ${px(10)}; text-transform: uppercase; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 24px;
      margin-top: 14px;
    }
    .sig-block h3 {
      margin: 0 0 2px;
      font-size: ${px(10)};
      font-weight: 700;
      text-transform: uppercase;
    }
    .sig-block .hint { font-size: ${px(9)}; color: #555; margin: 0 0 8px; }
    .sig-block .line {
      border-top: 1px solid #000;
      padding-top: 3px;
      margin-top: 18px;
      font-size: ${px(10)};
      min-height: 1.2em;
    }
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "loading_sheet" })}
    @media print {
      body { font-size: ${px(11, true)}; }
      .org-name { font-size: ${px(15, true)}; }
      .header .doc-title { font-size: ${px(13, true)}; }
    }
  `;
}

/**
 * Printable leave application for the employee and approving manager.
 */
export async function printLeaveApplication({
  leave,
  employee,
  organization,
  generalSettings,
  printedByUser,
} = {}) {
  const branding = resolveReportBranding({ organization, generalSettings });
  const name = composeEmployeeDisplayName(employee) || employee?.full_name || "Employee";
  const meta = employeeMeta(employee);
  const printedBy = resolvePrintedByUser(printedByUser);
  const status = leave?.approval_status ?? "pending";
  const isOffDay = leave?.assignment_kind === "off_day";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Leave application ${escapeHtml(leave?.id ?? "")}</title>
  <style>${docStyles(generalSettings)}</style>
</head>
<body>
  ${buildReportOrgHeaderHtml(branding)}
  <div class="header">
    <h1 class="doc-title">${isOffDay ? "Off day application" : "Leave application"}</h1>
    <p class="doc-sub">For employee records and manager approval</p>
  </div>
  <div class="status-banner ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</div>
  <div class="meta">
    <div><strong>Reference no.</strong> LV-${escapeHtml(leave?.id ?? "—")}</div>
    <div><strong>Applied on</strong> ${escapeHtml(formatDate(leave?.created_at ?? leave?.start_date ?? new Date()))}</div>
    <div><strong>Employee</strong> ${escapeHtml(name)}</div>
    ${meta ? `<div><strong>Details</strong> ${escapeHtml(meta)}</div>` : `<div></div>`}
    <div><strong>Leave period</strong> ${escapeHtml(formatPeriod(leave))}</div>
    <div><strong>Duration</strong> ${escapeHtml(durationLabel(leave))}</div>
    <div><strong>Leave type</strong> ${escapeHtml(deductFromLabel(leave?.deduct_from))}</div>
    <div><strong>Working hours</strong> ${escapeHtml(String(leave?.total_hours ?? "—"))}</div>
  </div>
  <div class="notes-label">Reason / notes</div>
  <div class="notes">${escapeHtml(leave?.notes || "—")}</div>
  <div class="signatures">
    <div class="sig-block">
      <h3>Employee</h3>
      <p class="hint">I request the leave above</p>
      <div class="line">Signature / date</div>
      <div class="line">${escapeHtml(name)}</div>
    </div>
    <div class="sig-block">
      <h3>HR / supervisor</h3>
      <p class="hint">Review and forward for approval</p>
      <div class="line">Signature / date</div>
      <div class="line">Name & designation</div>
    </div>
  </div>
  <div class="signatures" style="margin-top: 12px;">
    <div class="sig-block">
      <h3>Approved by (admin / manager)</h3>
      <p class="hint">Authorize leave before employee proceeds</p>
      <div class="line">Signature / date</div>
      <div class="line">Name & designation</div>
    </div>
    <div class="sig-block">
      <h3>HR records</h3>
      <p class="hint">File copy after approval</p>
      <div class="line">Received by / date</div>
    </div>
  </div>
  ${buildDocumentPrintEdgeFooterHtml({ printedBy })}
</body>
</html>`;

  return printHtmlDocument(html, {
    jobType: "leave_application",
    documentId: leave?.id ?? null,
    windowFeatures: "width=820,height=900",
  });
}
