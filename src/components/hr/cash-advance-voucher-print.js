import { printHtmlDocument } from "@/lib/print-dispatch";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import {
  buildReportOrgHeaderHtml,
  resolveReportBranding,
} from "@/lib/reports/report-branding";
import { formatPrintDisplayDate } from "@/lib/print-dates";
import {
  buildDocumentPrintEdgeFooterHtml,
  DOCUMENT_PRINT_EDGE_BODY_SIDES,
  DOCUMENT_PRINT_EDGE_BODY_TOP,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
  orgPrintPx,
} from "@/lib/print-typography";
import { resolvePrintedByUser } from "@/lib/printed-by-user";

const PRINT_VARIANT = "payroll_receipt";

/** Usable A4 height after top/side padding — keep voucher + footer on one sheet. */
const PAGE_INNER_MIN_HEIGHT = "277mm";

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
    orgPrintPx(base, generalSettings, { variant: PRINT_VARIANT, print });
  const font = orgPrintFontFamilyFromSettings(generalSettings, PRINT_VARIANT);

  return `
    @page { size: 210mm 297mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { height: auto; }
    body {
      font-family: ${font};
      color: #000;
      margin: 0;
      /* Footer is in-flow inside .sheet — do not reserve a second page with large bottom padding. */
      padding: ${DOCUMENT_PRINT_EDGE_BODY_TOP} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} ${DOCUMENT_PRINT_EDGE_BODY_TOP};
      font-size: ${px(10)};
      line-height: 1.2;
      ${orgPrintInkStyles(generalSettings, PRINT_VARIANT)}
    }
    .sheet {
      min-height: ${PAGE_INNER_MIN_HEIGHT};
      display: flex;
      flex-direction: column;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
    }
    .sheet-body { flex: 1 1 auto; }
    .org-header {
      text-align: center;
      margin-bottom: 3px !important;
      padding-bottom: 3px !important;
      border-bottom: 1px solid #000;
    }
    .org-logo {
      display: block;
      margin: 0 auto 3px !important;
      max-height: 28px !important;
      max-width: 150px !important;
      object-fit: contain;
    }
    .org-name {
      font-size: ${px(12)};
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      line-height: 1.1;
    }
    .header { text-align: center; margin: 3px 0 5px; }
    .header .doc-title { margin: 0; font-size: ${px(11)}; font-weight: 700; text-transform: uppercase; }
    .header .doc-sub { margin: 2px 0 0; font-size: ${px(8)}; color: #444; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 14px; margin: 3px 0; font-size: ${px(9)}; }
    .meta strong { display: inline-block; min-width: 90px; font-weight: 700; }
    .amount-box {
      border: 2px solid #000;
      padding: 5px 8px;
      margin: 5px 0 3px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }
    .amount-box .label { font-size: ${px(9)}; font-weight: 700; text-transform: uppercase; }
    .amount-box .value { font-size: ${px(13)}; font-weight: 700; letter-spacing: 0.02em; }
    .notes {
      border: 1px solid #000;
      min-height: 22px;
      max-height: 44px;
      overflow: hidden;
      padding: 3px 6px;
      margin-top: 2px;
      font-size: ${px(9)};
    }
    .notes-label { font-weight: 700; margin-top: 4px; font-size: ${px(8)}; text-transform: uppercase; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 14px;
      margin-top: 6px;
    }
    .sig-block h3 {
      margin: 0 0 1px;
      font-size: ${px(8)};
      font-weight: 700;
      text-transform: uppercase;
    }
    .sig-block .hint { font-size: ${px(7)}; color: #555; margin: 0 0 2px; }
    .sig-block .line {
      border-top: 1px solid #000;
      padding-top: 1px;
      margin-top: 10px;
      font-size: ${px(8)};
      min-height: 1em;
    }
    .sig-block .line.prefilled {
      margin-top: 6px;
      font-weight: 600;
    }
    .sig-block .line .filled {
      display: block;
      margin-bottom: 1px;
      font-size: ${px(9)};
      font-weight: 700;
    }
    .sig-block .stamp {
      border: 1px dashed #666;
      height: 28px;
      margin-top: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${px(7)};
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: PRINT_VARIANT })}
    /* Keep footer with the voucher on page 1 (override global position:fixed). */
    body.cash-advance-voucher .doc-print-edge-footer,
    body.cash-advance-voucher.has-doc-print-edge-footer .doc-print-edge-footer {
      position: static !important;
      left: auto !important;
      right: auto !important;
      bottom: auto !important;
      margin-top: 10px !important;
      padding: 6px 0 0 !important;
      flex: 0 0 auto;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-before: avoid;
      break-before: avoid;
    }
    @media print {
      body.cash-advance-voucher.has-doc-print-edge-footer {
        padding: ${DOCUMENT_PRINT_EDGE_BODY_TOP} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} ${DOCUMENT_PRINT_EDGE_BODY_TOP} !important;
      }
      body { font-size: ${px(10, true)}; }
      .org-name { font-size: ${px(12, true)}; }
      .header .doc-title { font-size: ${px(11, true)}; }
      .amount-box .value { font-size: ${px(13, true)}; }
      .sheet {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
      }
      body.cash-advance-voucher .doc-print-edge-footer,
      body.cash-advance-voucher.has-doc-print-edge-footer .doc-print-edge-footer {
        position: static !important;
        left: auto !important;
        right: auto !important;
        bottom: auto !important;
      }
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
<body class="has-doc-print-edge-footer cash-advance-voucher">
  <div class="sheet">
    <div class="sheet-body">
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
  <div class="signatures">
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
    </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy,
  })}
  </div>
</body>
</html>`;

  return printHtmlDocument(html, {
    jobType: "cash_advance",
    documentId: advance?.id ?? advance?.voucher_no ?? null,
    windowFeatures: "width=820,height=900",
  });
}
