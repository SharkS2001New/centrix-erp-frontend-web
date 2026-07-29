import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import {
  tillDisplayName,
  normalizeFloatEntries,
  formatFloatEntryDate,
  resolveTillReportBundle,
  resolveNetSalesMinusFloat,
  resolveTillReportNo,
  resolveTillPaymentSummary,
} from "@/lib/pos-till";
import { dispatchPrintJob } from "@/lib/print-dispatch";
import {
  fetchPrintModuleSettings,
  resolvePrintGeneralSettings,
} from "@/lib/print-module-settings";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";
import { formatThermalPrintAmount } from "@/lib/sale-document-print-shared";
import {
  THERMAL_PAPER_WIDTH_MM,
  THERMAL_SIDE_MARGIN_MM,
} from "@/lib/thermal-receipt-layout";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function amt(value) {
  return formatThermalPrintAmount(value);
}

function row(label, value, { grand = false } = {}) {
  return `<tr class="${grand ? "amount-line-grand" : ""}"><td class="amount-label">${escapeHtml(label)}</td><td class="amount-value">${escapeHtml(value)}</td></tr>`;
}

function sectionRow(title, { first = false } = {}) {
  return `<tr class="section-row${first ? " section-row-first" : ""}"><td class="section-label" colspan="2">${escapeHtml(title)}</td></tr>`;
}

function wrapSummaryTable(rowsHtml) {
  return `<table class="summary-table">
    <colgroup><col class="col-label" /><col class="col-value" /></colgroup>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

function paymentPrintRows(report) {
  return resolveTillPaymentSummary(report).map((entry) =>
    row(entry.method_name ?? entry.method_code ?? "Payment", amt(entry.total)),
  );
}

/**
 * Build X/Z till report HTML for 80mm thermal (same layout/fonts as sale receipts).
 */
export function buildPosTillReportHtml({
  type = "X",
  organizationName = DEFAULT_PRINT_ORG_NAME,
  tillName,
  cashierName,
  report: reportPayload,
  session: sessionOverride,
  variance = null,
  showFloatBreakdown = false,
  generalSettings = null,
} = {}) {
  const bundle = resolveTillReportBundle({
    ...(reportPayload && typeof reportPayload === "object" ? reportPayload : {}),
    session: sessionOverride ?? reportPayload?.session,
    variance,
  });
  const session = sessionOverride ?? bundle.session;
  const report = bundle.report ?? {};
  const printVariance = variance ?? bundle.variance;
  const sales = report.sales ?? {};
  const till = report.till ?? {};
  const opened = session?.opened_at;
  const closed = session?.closed_at;
  const netSales = Number(sales.net_sales ?? sales.net ?? 0);
  const netSalesMinusFloat = showFloatBreakdown
    ? resolveNetSalesMinusFloat({
        netSales,
        openingFloat: till.opening_float ?? session?.working_amount,
        netSalesMinusFloat: sales.net_sales_minus_float,
      })
    : null;
  const dateStr = opened
    ? new Date(opened).toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-KE");

  const isZ = type === "Z";
  const tillNo = resolveTillReportNo({ tillName, session, report });
  const printPx = createOrgPrintPx(generalSettings, "thermal");
  const px = printPx.body;
  const hpx = printPx.header;
  const fpx = printPx.footer;
  const font = orgPrintFontFamilyFromSettings(generalSettings, "thermal");

  const floatEntries =
    showFloatBreakdown && (report?.float_entries?.length || session?.float_breakdown)
      ? report?.float_entries?.length
        ? report.float_entries
        : normalizeFloatEntries(session?.float_breakdown)
      : [];

  const floatRows =
    floatEntries.length > 0
      ? [
          sectionRow("Operating float", { first: true }),
          ...floatEntries.map((entry) =>
            row(
              `${entry.payment_type}${entry.date_added ? ` (${formatFloatEntryDate(entry.date_added)})` : ""}`,
              amt(entry.new_float),
            ),
          ),
          row("Total float", amt(session?.working_amount), { grand: true }),
        ]
      : showFloatBreakdown && session?.working_amount != null
        ? [sectionRow("Operating float", { first: true }), row("Total", amt(session.working_amount), { grand: true })]
        : [];

  const cashRows = isZ
    ? [
        sectionRow("Cash"),
        row("Expected Cash", amt(report?.expected_cash)),
        row("Actual Cash", amt(session?.closing_amount)),
        row(
          "Variance",
          printVariance != null
            ? Number(printVariance).toLocaleString("en-KE", { maximumFractionDigits: 0 })
            : "—",
          { grand: true },
        ),
      ]
    : [
        sectionRow("Cash"),
        ...(showFloatBreakdown
          ? [
              row("Operating float", amt(till.opening_float ?? session?.working_amount)),
              row("Cash collected", amt(till.cash_collected ?? sales.cash)),
              row("Gross till total", amt(till.gross_total)),
            ]
          : []),
        ...(Number(report?.session_expenses) > 0
          ? [row("Session expenses", amt(report.session_expenses))]
          : []),
        row("Expected Cash", amt(report?.expected_cash), { grand: true }),
      ];

  const salesRowItems = [
    row("Transactions", String(sales.transactions ?? 0)),
    row("Net Sales", amt(netSales)),
    ...(showFloatBreakdown
      ? [row("Net sales minus float", amt(netSalesMinusFloat))]
      : []),
    ...(Number(sales.total_vat) > 0 ? [row("VAT total", amt(sales.total_vat))] : []),
    row("Refunds", amt(sales.refunds)),
    ...(Number(sales.debtor_collections) > 0
      ? [row("Debtor collections", amt(sales.debtor_collections))]
      : []),
  ];

  const paymentRowItems = paymentPrintRows(report);

  const continuousRows = [
    ...floatRows,
    sectionRow("Sales", { first: floatRows.length === 0 }),
    ...salesRowItems,
    sectionRow("Payment summary"),
    ...paymentRowItems,
    ...cashRows,
  ];

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(type)} Report</title>
  <style>
    @page { size: ${THERMAL_PAPER_WIDTH_MM}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm; max-width: ${THERMAL_PAPER_WIDTH_MM}mm; height: auto; min-height: 0; margin: 0; padding: 0; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body { font-family: ${font}; color: #000; background: #fff; font-size: ${px(11)}; ${orgPrintInkStyles(generalSettings, "thermal")} }
    body.centrix-print-thermal { padding: 0 ${THERMAL_SIDE_MARGIN_MM}mm; box-sizing: border-box; }
    .receipt { width: 100%; max-width: 100%; margin: 0; padding: 0; box-sizing: border-box; }
    .org-name { text-align: center; font-size: ${hpx(13)}; font-weight: var(--print-w-header, 700); letter-spacing: .02em; line-height: 1.15; margin: 0 0 2px; word-break: break-word; }
    .doc-title { text-align: center; font-size: ${px(12)}; font-weight: 700; letter-spacing: .08em; margin: 6px 0 4px; }
    .divider { border-top: 1px dashed #000; margin: 4px 0; page-break-inside: avoid; break-inside: avoid; }
    .meta { font-size: ${px(10)}; line-height: 1.3; margin: 1px 0; word-break: break-word; overflow-wrap: anywhere; page-break-inside: avoid; break-inside: avoid; }
    .meta-label { font-weight: 700; }
    .summary-table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; font-size: ${px(10)}; page-break-inside: avoid; break-inside: avoid; }
    .summary-table col.col-label { width: 70%; }
    .summary-table col.col-value { width: 30%; }
    .summary-table td { padding: 1px 0; vertical-align: top; overflow: hidden; }
    .summary-table tr { page-break-inside: avoid; break-inside: avoid; }
    .summary-table tr.section-row td.section-label { padding-top: 6px; font-weight: 700; text-transform: uppercase; font-size: ${px(10)}; letter-spacing: .04em; border-top: 1px dashed #000; overflow-wrap: anywhere; word-break: break-word; }
    .summary-table tr.section-row-first td.section-label { padding-top: 2px; border-top: 0; }
    .summary-table .amount-label { font-weight: 700; text-align: left; overflow-wrap: anywhere; word-break: break-word; padding-right: 4px; max-width: 0; }
    .summary-table .amount-value { font-weight: var(--print-w-body, 600); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; max-width: 0; }
    .summary-table tr.amount-line-grand td { font-size: ${px(11)}; font-weight: 700; }
    .summary-table tr.amount-line-grand .amount-value { font-weight: 700; }
    .footer { margin-top: 8px; text-align: center; font-size: ${fpx(10)}; font-weight: var(--print-w-footer, 700); letter-spacing: .04em; page-break-inside: avoid; break-inside: avoid; }
    @media print {
      @page { size: ${THERMAL_PAPER_WIDTH_MM}mm auto; margin: 0 !important; }
      html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm !important; max-width: ${THERMAL_PAPER_WIDTH_MM}mm !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; page: centrix-thermal; }
      body.centrix-print-thermal { padding: 0 ${THERMAL_SIDE_MARGIN_MM}mm !important; box-sizing: border-box !important; page: centrix-thermal; }
      .receipt { page-break-before: avoid !important; page-break-after: avoid !important; page-break-inside: avoid !important; break-before: avoid-page !important; break-after: avoid-page !important; break-inside: avoid-page !important; }
      body { font-size: ${px(11, true)}; }
      .org-name { font-size: ${hpx(13, true)}; }
      .doc-title { font-size: ${px(12, true)}; }
      .meta { font-size: ${px(10, true)}; }
      .summary-table { font-size: ${px(10, true)}; }
      .summary-table tr.section-row td.section-label { font-size: ${px(10, true)}; }
      .summary-table tr.amount-line-grand td { font-size: ${px(11, true)}; }
      .footer { font-size: ${fpx(10, true)}; }
    }
  </style>
</head>
<body class="centrix-print-thermal">
  <div class="receipt">
    <div class="org-name">${escapeHtml(organizationName)}</div>
    <div class="doc-title">${escapeHtml(type)} REPORT</div>
    <div class="divider"></div>
    <div class="meta"><span class="meta-label">Till No:</span> ${escapeHtml(tillNo)}</div>
    <div class="meta"><span class="meta-label">Cashier:</span> ${escapeHtml(cashierName ?? "—")}</div>
    <div class="meta"><span class="meta-label">Date:</span> ${escapeHtml(dateStr)}</div>
    ${isZ && closed ? `<div class="meta"><span class="meta-label">Closed:</span> ${escapeHtml(new Date(closed).toLocaleTimeString("en-KE"))}</div>` : ""}
    <div class="divider"></div>
    ${wrapSummaryTable(continuousRows.join(""))}
    <div class="divider"></div>
    <div class="footer">${isZ ? "SESSION CLOSED" : "SESSION STILL OPEN"}</div>
  </div>
</body>
</html>`;
}

/**
 * Print X or Z till report on 80mm thermal — same fonts + direct-to-printer path as sale receipts.
 */
export async function printPosTillReport(options = {}) {
  let generalSettings = options.generalSettings ?? null;
  if (!generalSettings) {
    try {
      const moduleSettings = await fetchPrintModuleSettings(options.moduleSettings ?? null);
      generalSettings = resolvePrintGeneralSettings(moduleSettings);
    } catch {
      generalSettings = null;
    }
  }

  const html = buildPosTillReportHtml({
    ...options,
    generalSettings,
  });
  if (!html?.trim()) {
    return { mode: "browser", ok: false };
  }

  return dispatchPrintJob({
    html,
    copies: 1,
    jobType: "receipt",
    documentId: options.session?.id ?? options.report?.session?.id ?? null,
    windowFeatures: "width=420,height=720",
  });
}

export function PosStatusBadge({ label, tone = "closed" }) {
  const classes = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    closed: "bg-red-50 text-red-700 ring-red-600/20",
    inactive: "bg-amber-50 text-amber-800 ring-amber-600/20",
    open: "bg-blue-50 text-blue-700 ring-blue-600/20",
    suspended: "bg-amber-50 text-amber-800 ring-amber-600/20",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        classes[tone] ?? classes.closed
      }`}
    >
      {label}
    </span>
  );
}

export function ReportStatGrid({ items }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <dt className="text-xs text-slate-500">{item.label}</dt>
          <dd className="mt-1 text-base font-semibold text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function tillOptionLabel(till) {
  return `${tillDisplayName(till)} (${till.till_number ?? till.id})`;
}
