import { printHtmlDocument } from "@/lib/print-dispatch";
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

function displayPersonName(person) {
  if (!person) return "";
  if (typeof person === "string") return person.trim();
  return String(person.full_name || person.username || person.name || "").trim();
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
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin: 8px 0; font-size: ${px(11)}; }
    .meta strong { display: inline-block; min-width: 108px; font-weight: 700; }
    .amount-box {
      border: 2px solid #000;
      padding: 8px 12px;
      margin: 8px 0 6px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }
    .amount-box .label { font-size: ${px(11)}; font-weight: 700; text-transform: uppercase; }
    .amount-box .value { font-size: ${px(16)}; font-weight: 700; letter-spacing: 0.02em; }
    .notes {
      border: 1px solid #000;
      min-height: 36px;
      padding: 6px 10px;
      margin-top: 4px;
      font-size: ${px(11)};
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
    .sig-block .line.prefilled {
      margin-top: 10px;
      font-weight: 600;
    }
    .sig-block .line .filled {
      display: block;
      margin-bottom: 2px;
      font-size: ${px(11)};
      font-weight: 700;
    }
    .sig-block .stamp {
      border: 1px dashed #666;
      height: 48px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${px(9)};
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "loading_sheet" })}
    @media print {
      body { font-size: ${px(11, true)}; }
      .org-name { font-size: ${px(15, true)}; }
      .header .doc-title { font-size: ${px(13, true)}; }
      .amount-box .value { font-size: ${px(16, true)}; }
    }
  `;
}

function nameLine(label, value) {
  const name = String(value ?? "").trim();
  if (name) {
    return `<div class="line prefilled"><span class="filled">${escapeHtml(name)}</span>${escapeHtml(label)}</div>`;
  }
  return `<div class="line">${escapeHtml(label)}</div>`;
}

/**
 * Printable cash-advance voucher for wet-ink signature / stamp by the approving manager.
 */
export async function printCashAdvanceVoucher({
  advance,
  employee,
  organization,
  generalSettings,
  printedByUser,
  preparedByName = null,
  approvedByName = null,
} = {}) {
  const branding = resolveReportBranding({ organization, generalSettings });
  const name = composeEmployeeDisplayName(employee) || employee?.full_name || "Employee";
  const meta = employeeMeta(employee);
  const printedBy = resolvePrintedByUser(printedByUser);
  const amount = formatHrKesFull(advance?.amount, generalSettings);
  const balance = formatHrKesFull(advance?.balance ?? advance?.amount, generalSettings);

  const preparedName =
    displayPersonName(preparedByName) ||
    displayPersonName(advance?.prepared_by_name) ||
    displayPersonName(printedByUser) ||
    "";
  const approvedName =
    displayPersonName(approvedByName) ||
    displayPersonName(advance?.approved_by_name) ||
    "";

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
  <div class="meta" style="margin-top:0;">
    <div><strong>Outstanding</strong> ${escapeHtml(balance)}</div>
    <div></div>
  </div>
  <div class="notes-label">Reason / notes</div>
  <div class="notes">${escapeHtml(advance?.notes || "—")}</div>
  <div class="signatures">
    <div class="sig-block">
      <h3>Prepared by (HR / requester)</h3>
      <p class="hint">Sign and date below</p>
      <div class="line">Signature / date</div>
      ${nameLine("Full name", preparedName)}
    </div>
    <div class="sig-block">
      <h3>Approved by (manager)</h3>
      <p class="hint">Sign and stamp to authorize disbursement</p>
      <div class="line">Signature / date</div>
      ${nameLine("Full name & designation", approvedName)}
      <div class="stamp">Official stamp</div>
    </div>
  </div>
  <div class="signatures" style="margin-top: 12px;">
    <div class="sig-block">
      <h3>Received by (employee)</h3>
      <p class="hint">I acknowledge receipt of the amount above</p>
      <div class="line">Signature / date</div>
      ${nameLine("Full name", name)}
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

  return printHtmlDocument(html, {
    jobType: "cash_advance",
    documentId: advance?.id ?? advance?.voucher_no ?? null,
    windowFeatures: "width=820,height=900",
  });
}
