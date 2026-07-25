import { openPrintWindow } from "@/lib/open-print-window";
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
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
  orgPrintPx,
} from "@/lib/print-typography";

const PAYROLL_PRINT_VARIANT = "payroll_receipt";

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
    compact = true,
    documentFooterText = "",
  } = options;

  const sections = payrollBreakdownSections(line, employee);
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
    { hideZero: compact },
  );

  const paidNote =
    paidAt || paymentReference
      ? `<p class="note paid">${
          paidAt ? `Paid ${escapeHtml(formatPaidDate(paidAt))}` : "Paid"
        }${paymentReference ? ` · Ref ${escapeHtml(paymentReference)}` : ""}</p>`
      : "";

  const head = orgHeaderHtml
    ? `<header class="receipt-head branded">${orgHeaderHtml}<h2>Payroll receipt</h2><p class="period">${escapeHtml(periodText)}</p></header>`
    : `<header class="receipt-head">
        <div class="org">${escapeHtml(orgName)}</div>
        <h2>Payroll receipt</h2>
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

/** Batch print: 2 readable slips per A4 page (side by side). */
const BATCH_RECEIPTS_PER_PAGE = 2;

function buildReceiptPages(receiptsHtml, { single = false } = {}) {
  if (single) {
    return receiptsHtml
      .map(
        (html) => `<div class="page page-single">
      <div class="single-wrap">${html}</div>
    </div>`,
      )
      .join("");
  }

  return chunkReceipts(receiptsHtml, BATCH_RECEIPTS_PER_PAGE)
    .map((pageReceipts) => {
      const cells = [];
      for (let i = 0; i < BATCH_RECEIPTS_PER_PAGE; i += 1) {
        cells.push(pageReceipts[i] ?? `<div class="receipt receipt-empty" aria-hidden="true"></div>`);
      }
      return `<div class="page page-grid">
        ${cells.join("")}
      </div>`;
    })
    .join("");
}

function payrollReceiptPrintStyles(generalSettings, { single = false } = {}) {
  const variant = PAYROLL_PRINT_VARIANT;
  const font = orgPrintFontFamilyFromSettings(generalSettings, variant);
  const px = (base, print = false) => orgPrintPx(base, generalSettings, { variant, print });
  const ink = orgPrintInkStyles(generalSettings, variant);

  // Readable floors — single slip is larger; batch (2-up) still stays ≥ ~10–11px.
  const body = single ? px(12) : px(11);
  const org = single ? px(16) : px(13);
  const title = single ? px(14) : px(12);
  const period = single ? px(11) : px(10);
  const employee = single ? px(13) : px(12);
  const meta = single ? px(11) : px(10);
  const section = single ? px(10) : px(9);
  const note = single ? px(10) : px(9);
  const net = single ? px(14) : px(12);
  const cut = single ? px(8) : px(8);
  const footer = single ? px(10) : px(9);

  return `
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ${font};
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      ${ink}
    }
    .page {
      width: 100%;
      min-height: 281mm;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    .page-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr;
      gap: 0;
      width: 100%;
      height: 281mm;
    }
    .page-single {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 10mm;
    }
    .single-wrap {
      width: 110mm;
      max-width: 100%;
    }
    .receipt {
      border: 1px dashed #64748b;
      padding: ${single ? "14px 16px 12px" : "12px 14px 10px"};
      min-height: 0;
      overflow: hidden;
      font-size: ${body};
      line-height: 1.4;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .receipt-empty {
      border-color: transparent;
      visibility: hidden;
    }
    .receipt-head { text-align: center; }
    .org {
      font-size: ${org};
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #0f172a;
      font-weight: 700;
      line-height: 1.25;
    }
    h2 {
      margin: 4px 0 0;
      font-size: ${title};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #0f172a;
    }
    .period {
      margin: 3px 0 0;
      font-size: ${period};
      color: #1e293b;
    }
    .employee { margin-top: 4px; }
    .employee-name {
      font-size: ${employee};
      font-weight: 700;
      color: #0f172a;
    }
    .employee-meta {
      font-size: ${meta};
      color: #475569;
      margin-top: 2px;
    }
    section h3 {
      margin: 6px 0 3px;
      font-size: ${section};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #334155;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 2px;
    }
    .amt-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${body};
    }
    .amt-table td {
      padding: 2px 0;
      vertical-align: top;
    }
    .amt-table .label {
      color: #1e293b;
      padding-right: 8px;
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
      border-top: 1.5px solid #64748b;
      padding-top: 6px;
    }
    .net .label,
    .net .amt {
      font-size: ${net};
      font-weight: 700;
    }
    .note {
      margin: 0 0 2px;
      font-size: ${note};
      color: #475569;
      line-height: 1.35;
    }
    .note.paid { color: #0f766e; font-weight: 600; }
    .doc-footer {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid #cbd5e1;
      font-size: ${footer};
      color: #475569;
      line-height: 1.35;
      text-align: center;
    }
    .doc-footer p { margin: 0 0 2px; }
    .receipt-head.branded .org-header {
      margin-bottom: 4px;
      padding-bottom: 4px;
      border-bottom: 1px solid #cbd5e1;
      text-align: center;
    }
    .receipt-head.branded .org-logo {
      display: block;
      margin: 0 auto 4px;
      max-height: ${single ? "36px" : "28px"};
      max-width: 180px;
      width: auto;
      object-fit: contain;
    }
    .receipt-head.branded .org-name {
      font-size: ${org};
      font-weight: var(--print-w-header, 700);
      margin: 0;
      line-height: 1.2;
      color: #0f172a;
    }
    .cut-hint {
      margin-top: 4px;
      text-align: center;
      font-size: ${cut};
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .page-single .cut-hint { display: none; }
    @media print {
      .receipt { font-size: ${single ? px(12, true) : px(11, true)}; }
      .org { font-size: ${single ? px(16, true) : px(13, true)}; }
      h2 { font-size: ${single ? px(14, true) : px(12, true)}; }
      .employee-name { font-size: ${single ? px(13, true) : px(12, true)}; }
      .net .label,
      .net .amt { font-size: ${single ? px(14, true) : px(12, true)}; }
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
  `;
}

export function buildPayrollReceiptDocument({
  receipts,
  organization,
  generalSettings,
  single = false,
  documentFooterText = null,
}) {
  const branding = resolveReportBranding({ organization, generalSettings });
  const orgName = branding.organizationName ?? organization?.org_name ?? "Organization";
  const footerText =
    documentFooterText != null
      ? documentFooterText
      : resolvePrintFooter(generalSettings ?? {}, "payroll_receipt");
  const orgHeaderHtml = branding.showHeader
    ? buildReportOrgHeaderHtml(branding)
    : "";
  const receiptsHtml = receipts.map((r) =>
    buildReceiptHtml(r.line, r.employee, {
      orgName,
      orgHeaderHtml,
      periodText: r.periodText,
      generalSettings,
      paidAt: r.paidAt,
      paymentReference: r.paymentReference,
      compact: !single,
      documentFooterText: footerText,
    }),
  );
  const pages = buildReceiptPages(receiptsHtml, { single });
  const title = single ? "Payroll receipt" : "Payroll receipts";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${payrollReceiptPrintStyles(generalSettings, { single })}</style>
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

/** Print all employee receipts for a payroll run (2 per A4 page). */
export function printPayrollReceipts({
  lines,
  run,
  period,
  organization,
  generalSettings,
}) {
  const items = (lines ?? []).map((line) =>
    normalizeReceiptInput({ line, employee: line.employee, run, period }),
  );
  if (items.length === 0) return;

  const html = buildPayrollReceiptDocument({
    receipts: items,
    organization,
    generalSettings,
    single: false,
  });
  openPrintWindow(html, "width=900,height=1000");
}

/** Print a single employee payroll receipt (full page). */
export function printPayrollReceipt({
  line,
  employee,
  run,
  period,
  organization,
  generalSettings,
}) {
  if (!line) return;

  const html = buildPayrollReceiptDocument({
    receipts: [normalizeReceiptInput({ line, employee, run, period })],
    organization,
    generalSettings,
    single: true,
  });
  openPrintWindow(html, "width=560,height=780");
}
