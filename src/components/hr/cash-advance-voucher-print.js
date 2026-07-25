import { openPrintWindow } from "@/lib/open-print-window";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
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

function repaymentLabel(advance, generalSettings) {
  const mode = advance?.repayment_mode === "fixed_per_cycle" ? "fixed_per_cycle" : "full_next_cycle";
  if (mode === "fixed_per_cycle") {
    return `${formatHrKesFull(advance.repayment_amount, generalSettings)} each payroll cycle`;
  }
  return "Full balance on next payroll";
}

function statusLabel(status) {
  switch (status) {
    case "pending":
      return "Pending approval";
    case "open":
      return "Open (approved)";
    case "repaid":
      return "Repaid";
    case "cancelled":
      return "Cancelled";
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

function voucherStyles(generalSettings = null) {
  const px = (base, print = false) =>
    orgPrintPx(base, generalSettings, { variant: "loading_sheet", print });
  const font = orgPrintFontFamilyFromSettings(generalSettings, "loading_sheet");

  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html { height: 100%; }
    body {
      font-family: ${font};
      color: #000;
      margin: 24px;
      font-size: ${px(12)};
      line-height: 1.4;
      min-height: 100%;
      ${orgPrintInkStyles(generalSettings, "loading_sheet")}
    }
    .org-header { text-align: center; margin-bottom: 8px; }
    .org-logo { display: block; margin: 0 auto 10px; max-height: 56px; max-width: 220px; object-fit: contain; }
    .org-name {
      font-size: ${px(20)};
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.25;
    }
    .header { text-align: center; margin: 12px 0 20px; }
    .header .doc-title { margin: 0; font-size: ${px(16)}; font-weight: 700; text-transform: uppercase; }
    .header .doc-sub { margin: 6px 0 0; font-size: ${px(11)}; color: #444; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin: 16px 0; font-size: ${px(12)}; }
    .meta strong { display: inline-block; min-width: 120px; font-weight: 700; }
    .amount-box {
      border: 2px solid #000;
      padding: 14px 16px;
      margin: 18px 0;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
    }
    .amount-box .label { font-size: ${px(12)}; font-weight: 700; text-transform: uppercase; }
    .amount-box .value { font-size: ${px(22)}; font-weight: 700; letter-spacing: 0.02em; }
    .notes {
      border: 1px solid #000;
      min-height: 72px;
      padding: 10px 12px;
      margin-top: 8px;
      font-size: ${px(12)};
    }
    .notes-label { font-weight: 700; margin-top: 16px; font-size: ${px(11)}; text-transform: uppercase; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 48px;
    }
    .sig-block h3 {
      margin: 0 0 8px;
      font-size: ${px(11)};
      font-weight: 700;
      text-transform: uppercase;
    }
    .sig-block .hint { font-size: ${px(10)}; color: #555; margin: 0 0 36px; }
    .sig-block .line {
      border-top: 1px solid #000;
      padding-top: 6px;
      margin-top: 36px;
      font-size: ${px(11)};
    }
    .sig-block .stamp {
      border: 1px dashed #666;
      height: 72px;
      margin-top: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${px(10)};
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "loading_sheet" })}
    @media print {
      body { margin: 0; font-size: ${px(12, true)}; }
      .org-name { font-size: ${px(20, true)}; }
      .header .doc-title { font-size: ${px(16, true)}; }
      .amount-box .value { font-size: ${px(22, true)}; }
    }
  `;
}

/**
 * Printable cash-advance voucher for wet-ink signature / stamp by the approving manager.
 */
export function printCashAdvanceVoucher({
  advance,
  employee,
  organization,
  generalSettings,
  printedByUser,
} = {}) {
  const branding = resolveReportBranding({ organization, generalSettings });
  const name = composeEmployeeDisplayName(employee) || employee?.full_name || "Employee";
  const meta = employeeMeta(employee);
  const printedBy = resolvePrintedByUser(printedByUser);
  const amount = formatHrKesFull(advance?.amount, generalSettings);
  const balance = formatHrKesFull(advance?.balance ?? advance?.amount, generalSettings);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cash advance voucher ${escapeHtml(advance?.id ?? "")}</title>
  <style>${voucherStyles(generalSettings)}</style>
</head>
<body>
  ${buildReportOrgHeaderHtml(branding)}
  <div class="header">
    <h1 class="doc-title">Employee cash advance voucher</h1>
    <p class="doc-sub">For manager approval, signature and official stamp</p>
  </div>
  <div class="meta">
    <div><strong>Voucher no.</strong> CA-${escapeHtml(advance?.id ?? "—")}</div>
    <div><strong>Status</strong> ${escapeHtml(statusLabel(advance?.status))}</div>
    <div><strong>Employee</strong> ${escapeHtml(name)}</div>
    <div><strong>Advance date</strong> ${escapeHtml(formatDate(advance?.advance_date))}</div>
    ${meta ? `<div><strong>Details</strong> ${escapeHtml(meta)}</div>` : `<div></div>`}
    <div><strong>Repayment</strong> ${escapeHtml(repaymentLabel(advance, generalSettings))}</div>
  </div>
  <div class="amount-box">
    <span class="label">Amount advanced</span>
    <span class="value">${escapeHtml(amount)}</span>
  </div>
  <div class="meta">
    <div><strong>Outstanding</strong> ${escapeHtml(balance)}</div>
    <div></div>
  </div>
  <div class="notes-label">Reason / notes</div>
  <div class="notes">${escapeHtml(advance?.notes || "—")}</div>
  <div class="signatures">
    <div class="sig-block">
      <h3>Prepared by (HR / requester)</h3>
      <p class="hint">Name, signature and date</p>
      <div class="line">Signature / date</div>
      <div class="line">Full name</div>
    </div>
    <div class="sig-block">
      <h3>Approved by (manager)</h3>
      <p class="hint">Sign and stamp to authorize disbursement</p>
      <div class="line">Signature / date</div>
      <div class="line">Full name &amp; designation</div>
      <div class="stamp">Official stamp</div>
    </div>
  </div>
  <div class="signatures" style="margin-top: 28px;">
    <div class="sig-block">
      <h3>Received by (employee)</h3>
      <p class="hint">I acknowledge receipt of the amount above</p>
      <div class="line">Signature / date</div>
      <div class="line">Full name</div>
    </div>
    <div class="sig-block">
      <h3>Cash / accounts</h3>
      <p class="hint">Disbursement confirmation</p>
      <div class="line">Signature / date</div>
      <div class="line">Reference / receipt no.</div>
    </div>
  </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy,
  })}
</body>
</html>`;

  openPrintWindow(html, "width=900,height=1100");
}
