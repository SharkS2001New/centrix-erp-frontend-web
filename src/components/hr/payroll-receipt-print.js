import { openPrintWindow } from "@/lib/open-print-window";
import {
  composeEmployeeDisplayName,
  formatHrKesFull,
  payrollBreakdownSections,
  periodLabel,
} from "@/components/hr/hr-shared";
import { resolveReportBranding } from "@/lib/reports/report-branding";
import { orgPrintFontFamilyFromSettings } from "@/lib/print-typography";

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
    periodText,
    generalSettings,
    paidAt,
    paymentReference,
    compact = true,
  } = options;

  const sections = payrollBreakdownSections(line, employee);
  const name = composeEmployeeDisplayName(employee) || employee?.full_name || "Employee";
  const subtitle = employeeSubtitle(employee);

  const payRows = buildAmountRows(sections.earnings, generalSettings);
  const deductionRows = buildAmountRows(
    [
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

  return `
    <article class="receipt">
      <header class="receipt-head">
        <div class="org">${escapeHtml(orgName)}</div>
        <h2>Payroll receipt</h2>
        <p class="period">${escapeHtml(periodText)}</p>
      </header>
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

  return chunkReceipts(receiptsHtml, 4)
    .map((pageReceipts) => {
      const cells = [];
      for (let i = 0; i < 4; i += 1) {
        cells.push(pageReceipts[i] ?? `<div class="receipt receipt-empty" aria-hidden="true"></div>`);
      }
      return `<div class="page page-grid">
        ${cells.join("")}
      </div>`;
    })
    .join("");
}

function payrollReceiptPrintStyles(generalSettings, { single = false } = {}) {
  const font = orgPrintFontFamilyFromSettings(generalSettings);
  const bodySize = single ? "11px" : "8.5px";
  const headSize = single ? "13px" : "10px";

  return `
    @page { size: A4; margin: 6mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ${font};
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 100%;
      min-height: 285mm;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    .page-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 0;
      width: 100%;
      height: 285mm;
    }
    .page-single {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 12mm;
    }
    .single-wrap {
      width: 88mm;
      max-width: 100%;
    }
    .single-wrap .receipt {
      min-height: auto;
      font-size: ${bodySize};
      padding: 10px 12px;
    }
    .single-wrap h2 { font-size: ${headSize}; }
    .receipt {
      border: 1px dashed #94a3b8;
      padding: 7px 8px 6px;
      min-height: 0;
      overflow: hidden;
      font-size: ${bodySize};
      line-height: 1.25;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .receipt-empty {
      border-color: transparent;
      visibility: hidden;
    }
    .receipt-head { text-align: center; }
    .org {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #0f172a;
      font-weight: 700;
    }
    .single-wrap .org { font-size: 14px; }
    h2 {
      margin: 2px 0 0;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #0f172a;
    }
    .single-wrap h2 { font-size: ${headSize}; }
    .period {
      margin: 1px 0 0;
      font-size: 8px;
      color: #1e293b;
    }
    .single-wrap .period { font-size: 10px; }
    .employee { margin-top: 2px; }
    .employee-name {
      font-size: 9px;
      font-weight: 700;
      color: #0f172a;
    }
    .single-wrap .employee-name { font-size: 12px; }
    .employee-meta {
      font-size: 7px;
      color: #64748b;
      margin-top: 1px;
    }
    .single-wrap .employee-meta { font-size: 9px; }
    section h3 {
      margin: 3px 0 1px;
      font-size: 6.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 1px;
    }
    .single-wrap section h3 { font-size: 8.5px; }
    .amt-table {
      width: 100%;
      border-collapse: collapse;
    }
    .amt-table td {
      padding: 1px 0;
      vertical-align: top;
    }
    .amt-table .label {
      color: #334155;
      padding-right: 6px;
    }
    .amt-table .amt {
      text-align: right;
      white-space: nowrap;
      font-weight: 600;
      color: #0f172a;
    }
    .amt-table tr.emphasis .label,
    .amt-table tr.emphasis .amt {
      font-weight: 700;
    }
    .amt-table tr.muted .label,
    .amt-table tr.muted .amt {
      color: #94a3b8;
    }
    .net-section {
      margin-top: auto;
      border-top: 1px solid #cbd5e1;
      padding-top: 3px;
    }
    .net .amt { font-size: 9px; }
    .single-wrap .net .amt { font-size: 12px; }
    .note {
      margin: 0;
      font-size: 6.5px;
      color: #64748b;
      line-height: 1.3;
    }
    .single-wrap .note { font-size: 8.5px; }
    .note.paid { color: #0f766e; }
    .cut-hint {
      margin-top: 2px;
      text-align: center;
      font-size: 6px;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .page-single .cut-hint { display: none; }
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

function buildPayrollReceiptDocument({
  receipts,
  organization,
  generalSettings,
  single = false,
}) {
  const branding = resolveReportBranding({ organization, generalSettings });
  const orgName = branding.organizationName ?? organization?.org_name ?? "Organization";
  const receiptsHtml = receipts.map((r) =>
    buildReceiptHtml(r.line, r.employee, {
      orgName,
      periodText: r.periodText,
      generalSettings,
      paidAt: r.paidAt,
      paymentReference: r.paymentReference,
      compact: !single,
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

/** Print all employee receipts for a payroll run (4 per A4 page). */
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
  openPrintWindow(html, "width=860,height=960");
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
  openPrintWindow(html, "width=520,height=720");
}
