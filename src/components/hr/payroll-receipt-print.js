import { printHtmlDocument } from "@/lib/print-dispatch";
import {
  composeEmployeeDisplayName,
  formatHrKesFull,
  payrollBreakdownSections,
  periodLabel,
} from "@/components/hr/hr-shared";
import {
  buildReportOrgHeaderHtml,
  resolveReportBranding,
} from "@/lib/reports/report-branding";
import { brandingWithDocumentLogo } from "@/lib/document-logo-settings";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
  orgPrintPx,
} from "@/lib/print-typography";
import { orgDocumentTemplateCss } from "@/lib/document-print-templates";

const PAYROLL_PRINT_VARIANT = "payroll_receipt";
const PAYROLL_DOCUMENT_TITLE = "Salary Payment Receipt";

/** Fixed 2×2 layout: every slip is one quarter of an A4 page. */
const RECEIPTS_PER_PAGE = 4;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAmount(value, generalSettings) {
  return formatHrKesFull(value, generalSettings);
}

function footerHtml(documentFooterText) {
  const lines = String(documentFooterText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  return `<footer class="doc-footer">${lines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("")}</footer>`;
}

function employeeSubtitle(employee) {
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

function buildAmountRows(rows, generalSettings, { hideZero = false } = {}) {
  return rows
    .filter((row) => !hideZero || row.emphasis || Number(row.value) !== 0)
    .map((row) => {
      const classes = [row.emphasis ? "emphasis" : "", row.muted ? "muted" : ""]
        .filter(Boolean)
        .join(" ");
      return `<tr class="${classes}">
        <td class="label">${escapeHtml(row.label)}</td>
        <td class="amt">${escapeHtml(formatAmount(row.value, generalSettings))}</td>
      </tr>`;
    })
    .join("");
}

function buildReceiptHtml(line, employee, options) {
  const {
    orgName,
    orgHeaderHtml = "",
    periodText,
    generalSettings,
    paidAt,
    paymentReference,
    documentFooterText = "",
  } = options;

  const sections = payrollBreakdownSections(line, employee, { forReceipt: true });
  const name = composeEmployeeDisplayName(employee) || employee?.full_name || "Employee";
  const subtitle = employeeSubtitle(employee);

  const payRows = buildAmountRows(sections.earnings, generalSettings);
  const deductionRows = buildAmountRows(
    [
      ...(sections.latenessDeduction ? [sections.latenessDeduction] : []),
      ...sections.statutory,
      ...sections.otherDeductions,
      sections.totalDeductions,
    ],
    generalSettings,
    { hideZero: true },
  );

  const paidNote =
    paidAt || paymentReference
      ? `<p class="note paid">${
          paidAt ? `Paid ${escapeHtml(formatPaidDate(paidAt))}` : "Paid"
        }${paymentReference ? ` · Ref ${escapeHtml(paymentReference)}` : ""}</p>`
      : "";

  const head = orgHeaderHtml
    ? `<header class="receipt-head branded">${orgHeaderHtml}<h2>${PAYROLL_DOCUMENT_TITLE}</h2><p class="period">${escapeHtml(periodText)}</p></header>`
    : `<header class="receipt-head">
        <div class="org">${escapeHtml(orgName)}</div>
        <h2>${PAYROLL_DOCUMENT_TITLE}</h2>
        <p class="period">${escapeHtml(periodText)}</p>
      </header>`;

  return `
    <article class="receipt">
      ${head}
      <div class="employee">
        <div class="employee-name">${escapeHtml(name)}</div>
        ${subtitle ? `<div class="employee-meta">${escapeHtml(subtitle)}</div>` : ""}
      </div>
      <section>
        <h3>Pay</h3>
        <table class="amt-table">${payRows}</table>
        ${sections.attendanceNote ? `<p class="note attendance">${escapeHtml(sections.attendanceNote)}</p>` : ""}
      </section>
      <section>
        <h3>Deductions</h3>
        <p class="note">${escapeHtml(sections.deductionsNote)}</p>
        <table class="amt-table">${deductionRows || `<tr><td class="label muted" colspan="2">None</td></tr>`}</table>
      </section>
      <section class="net-section">
        <table class="amt-table">
          <tr class="emphasis net">
            <td class="label">${escapeHtml(sections.net.label)}</td>
            <td class="amt">${escapeHtml(formatAmount(sections.net.value, generalSettings))}</td>
          </tr>
        </table>
      </section>
      ${paidNote}
      ${footerHtml(documentFooterText)}
      <footer class="cut-hint">Cut along dashed border</footer>
    </article>`;
}

function formatPaidDate(value) {
  const d = new Date(value.includes?.("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(value ?? "");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function chunkReceipts(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Always lay out receipts in a 2×2 grid. Empty cells keep the same quarter-page
 * footprint so 1–3 slips still print as if four were expected.
 */
function buildReceiptPages(receiptsHtml) {
  return chunkReceipts(receiptsHtml, RECEIPTS_PER_PAGE)
    .map((pageReceipts) => {
      const cells = [];
      for (let i = 0; i < RECEIPTS_PER_PAGE; i += 1) {
        cells.push(
          pageReceipts[i] ?? `<div class="receipt receipt-empty" aria-hidden="true"></div>`,
        );
      }
      return `<div class="page page-grid">${cells.join("")}</div>`;
    })
    .join("");
}

function payrollReceiptPrintStyles(generalSettings) {
  const variant = PAYROLL_PRINT_VARIANT;
  const font = orgPrintFontFamilyFromSettings(generalSettings, variant);
  const px = (base, print = false) => orgPrintPx(base, generalSettings, { variant, print });
  const ink = orgPrintInkStyles(generalSettings, variant);

  // Sized for a quarter-page slip (readable floors ~9–12px).
  const body = px(10);
  const org = px(12);
  const title = px(11);
  const period = px(9);
  const employee = px(11);
  const meta = px(9);
  const section = px(8);
  const note = px(8);
  const net = px(11);
  const cut = px(7);
  const footer = px(8);

  return `
    @page { size: A4; margin: 6mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
    }
    body {
      font-family: ${font};
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      ${ink}
    }
    .page {
      width: 100%;
      height: 285mm;
      page-break-after: always;
      break-after: page;
    }
    .page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .page-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 0;
      width: 100%;
      height: 100%;
      min-height: 285mm;
    }
    .receipt {
      border: 1px dashed #64748b;
      padding: 8px 10px 6px;
      width: 100%;
      height: 100%;
      min-height: 0;
      max-height: 100%;
      overflow: hidden;
      font-size: ${body};
      line-height: 1.3;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .receipt-empty {
      border-color: transparent;
      visibility: hidden;
    }
    .receipt-head { text-align: center; flex-shrink: 0; }
    .org {
      font-size: ${org};
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #0f172a;
      font-weight: 700;
      line-height: 1.2;
    }
    h2 {
      margin: 2px 0 0;
      font-size: ${title};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #0f172a;
    }
    .period {
      margin: 2px 0 0;
      font-size: ${period};
      color: #1e293b;
    }
    .employee { margin-top: 2px; flex-shrink: 0; }
    .employee-name {
      font-size: ${employee};
      font-weight: 700;
      color: #0f172a;
    }
    .employee-meta {
      font-size: ${meta};
      color: #475569;
      margin-top: 1px;
    }
    section { flex-shrink: 1; min-height: 0; }
    section h3 {
      margin: 4px 0 2px;
      font-size: ${section};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #334155;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 1px;
    }
    .amt-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${body};
    }
    .amt-table td {
      padding: 1px 0;
      vertical-align: top;
    }
    .amt-table .label {
      color: #1e293b;
      padding-right: 6px;
    }
    .amt-table .amt {
      text-align: right;
      white-space: nowrap;
      font-weight: 600;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }
    .amt-table tr.emphasis .label,
    .amt-table tr.emphasis .amt {
      font-weight: 700;
    }
    .amt-table tr.muted .label,
    .amt-table tr.muted .amt {
      color: #64748b;
    }
    .net-section {
      margin-top: auto;
      flex-shrink: 0;
      border-top: 1.5px solid #64748b;
      padding-top: 4px;
    }
    .net .label,
    .net .amt {
      font-size: ${net};
      font-weight: 700;
    }
    .note {
      margin: 0 0 1px;
      font-size: ${note};
      color: #475569;
      line-height: 1.3;
    }
    .note.paid { color: #0f766e; font-weight: 600; }
    .doc-footer {
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid #cbd5e1;
      font-size: ${footer};
      color: #475569;
      line-height: 1.3;
      text-align: center;
      flex-shrink: 0;
    }
    .doc-footer p { margin: 0 0 1px; }
    .receipt-head.branded .org-header {
      margin-bottom: 2px;
      padding-bottom: 2px;
      border-bottom: 1px solid #cbd5e1;
      text-align: center;
    }
    .receipt-head.branded .org-logo {
      display: block;
      margin: 0 auto 2px;
      max-height: 22px;
      max-width: 140px;
      width: auto;
      object-fit: contain;
    }
    .receipt-head.branded .org-name {
      font-size: ${org};
      font-weight: var(--print-w-header, 700);
      margin: 0;
      line-height: 1.15;
      color: #0f172a;
    }
    .cut-hint {
      margin-top: 2px;
      text-align: center;
      font-size: ${cut};
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      flex-shrink: 0;
    }
    @media print {
      html, body { height: auto; }
      .page {
        height: 285mm;
        overflow: hidden;
      }
      .receipt { font-size: ${px(10, true)}; }
      .org { font-size: ${px(12, true)}; }
      h2 { font-size: ${px(11, true)}; }
      .employee-name { font-size: ${px(11, true)}; }
      .net .label,
      .net .amt { font-size: ${px(11, true)}; }
    }
    @media screen {
      body { background: #f1f5f9; padding: 12px; }
      .page {
        background: #fff;
        box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
        margin: 0 auto 16px;
        max-width: 210mm;
      }
    }
    ${orgDocumentTemplateCss(generalSettings?.payroll_receipt_document_template, { layout: "classic" })}
  `;
}

export function buildPayrollReceiptDocument({
  receipts,
  organization,
  generalSettings,
  /** @deprecated Always uses 2×2 quarter-page layout; kept for callers. */
  single: _single = false,
  documentFooterText = null,
}) {
  const branding = brandingWithDocumentLogo(
    resolveReportBranding({ organization, generalSettings }),
    generalSettings,
    "payroll_receipt",
  );
  const orgName = branding.organizationName ?? organization?.org_name ?? "Organization";
  const footerText =
    documentFooterText != null
      ? documentFooterText
      : resolvePrintFooter(generalSettings ?? {}, "payroll_receipt");
  const orgHeaderHtml = branding.showHeader
    ? buildReportOrgHeaderHtml(branding, {
        layout: "a4",
        logoLayout: branding.logoLayout ?? null,
      })
    : "";
  const receiptsHtml = receipts.map((r) =>
    buildReceiptHtml(r.line, r.employee, {
      orgName,
      orgHeaderHtml,
      periodText: r.periodText,
      generalSettings,
      paidAt: r.paidAt,
      paymentReference: r.paymentReference,
      documentFooterText: footerText,
    }),
  );
  const pages = buildReceiptPages(receiptsHtml);
  const title =
    receipts.length === 1 ? PAYROLL_DOCUMENT_TITLE : `${PAYROLL_DOCUMENT_TITLE}s`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${payrollReceiptPrintStyles(generalSettings)}</style>
</head>
<body>
  ${pages}
</body>
</html>`;
}

/** Sample payslip for Admin → Printouts live preview. */
export function samplePayrollReceiptPreviewData() {
  return {
    line: {
      gross_pay: 85000,
      net_pay: 68240.5,
      nssf: 2160,
      shif: 2340,
      housing_levy: 1275,
      paye: 9854.5,
      other_deductions: 1130,
      deductions: 16759.5,
      statutory_meta: {
        statutory_gross: 85000,
        period_gross: 85000,
        payroll: {
          contract_gross_for_statutory: 85000,
          deductions_detail: [{ name: "Cash advance", amount: 1130 }],
        },
      },
    },
    employee: {
      full_name: "Jane Wanjiku",
      employee_code: "EMP-014",
      department_name: "Finance",
      position_name: "Accountant",
    },
    periodText: "Mar 2026",
    paidAt: null,
    paymentReference: null,
  };
}

function normalizeReceiptInput({ line, employee, run, period }) {
  const periodText = periodLabel(period ?? run?.pay_period ?? run?.payPeriod);
  return {
    line,
    employee: employee ?? line?.employee ?? null,
    periodText,
    paidAt: run?.paid_at ?? null,
    paymentReference: run?.payment_reference ?? null,
  };
}

/** Print employee receipts for a payroll run (4 per A4 page, 2×2). */
export async function printPayrollReceipts({
  lines,
  run,
  period,
  organization,
  generalSettings,
}) {
  const items = (lines ?? []).map((line) =>
    normalizeReceiptInput({ line, employee: line.employee, run, period }),
  );
  if (items.length === 0) return { mode: "browser", ok: false, error: "Nothing to print." };

  const html = buildPayrollReceiptDocument({
    receipts: items,
    organization,
    generalSettings,
  });
  return printHtmlDocument(html, {
    jobType: "payroll_receipt",
    documentId: run?.id ?? null,
    windowFeatures: "width=900,height=1000",
  });
}

/** Print a single employee payroll receipt (still one quadrant of A4). */
export async function printPayrollReceipt({
  line,
  employee,
  run,
  period,
  organization,
  generalSettings,
}) {
  if (!line) return { mode: "browser", ok: false, error: "Nothing to print." };

  const html = buildPayrollReceiptDocument({
    receipts: [normalizeReceiptInput({ line, employee, run, period })],
    organization,
    generalSettings,
  });
  return printHtmlDocument(html, {
    jobType: "payroll_receipt",
    documentId: line?.id ?? employee?.id ?? run?.id ?? null,
    windowFeatures: "width=900,height=1000",
  });
}
