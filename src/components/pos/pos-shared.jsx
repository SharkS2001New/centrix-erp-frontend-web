import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import {
  tillDisplayName,
  normalizeFloatEntries,
  resolveTillReportBundle,
  resolveTillReportPaymentLines,
  resolveTillSalesSummaryRows,
  resolveTillReportNo,
} from "@/lib/pos-till";
import { formatInTimezone } from "@/lib/datetime";
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
  THERMAL_CONTENT_WIDTH_MM,
  THERMAL_PAPER_WIDTH_MM,
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

function formatTillReportDate(value) {
  return (
    formatInTimezone(value, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) ?? "—"
  );
}

function formatTillReportFloatLabel(entry) {
  const type = entry?.payment_type ?? "Float";
  if (!entry?.date_added) return type;
  const when = formatInTimezone(entry.date_added, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return when ? `${type} (${when})` : type;
}

function paymentPrintRows(report) {
  return resolveTillReportPaymentLines(report).map((entry) =>
    row(entry.label, amt(entry.total)),
  );
}

function salesSummaryPrintRows(report, session, showFloatBreakdown) {
  return resolveTillSalesSummaryRows(report, session, { showFloatBreakdown }).map((entry) =>
    row(entry.label, amt(entry.amount), entry.label === "Expected Amount" ? { grand: true } : {}),
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
  const sessionExpenses = Number(report?.session_expenses ?? till?.session_expenses ?? 0);
  const opened = session?.opened_at;
  const closed = session?.closed_at;
  const dateStr = opened ? formatTillReportDate(opened) : formatTillReportDate(new Date());

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
            row(formatTillReportFloatLabel(entry), amt(entry.new_float)),
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
          ? [row("Cash collected", amt(till.cash_collected ?? sales.cash))]
          : []),
        row("Expected Cash", amt(report?.expected_cash), { grand: true }),
      ];

  const paymentRowItems = [
    sectionRow("Payment summary", { first: floatRows.length === 0 }),
    ...paymentPrintRows(report),
  ];

  const salesExpenseRows = [
    ...(Number(report?.sales?.debtor_collections ?? report?.sales?.invoice_sales ?? 0) > 0
      ? [row("Invoice sales (paid debtors)", amt(report.sales.debtor_collections ?? report.sales.invoice_sales))]
      : []),
    ...(sessionExpenses > 0 ? [row("Total expenses", amt(sessionExpenses))] : []),
  ];

  const salesSummaryRowItems = [
    sectionRow("Sales summary"),
    ...salesSummaryPrintRows(report, session, showFloatBreakdown),
  ];

  const continuousRows = [
    ...floatRows,
    ...paymentRowItems,
    ...salesExpenseRows,
    ...salesSummaryRowItems,
    ...cashRows,
  ];

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(type)} Report</title>
  <style>
    @page { size: ${THERMAL_PAPER_WIDTH_MM}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm; max-width: ${THERMAL_PAPER_WIDTH_MM}mm; height: auto; min-height: 0; margin: 0 auto; padding: 0; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body { font-family: ${font}; color: #000; background: #fff; font-size: ${px(10)}; ${orgPrintInkStyles(generalSettings, "thermal")} }
    .receipt { width: ${THERMAL_CONTENT_WIDTH_MM}mm; max-width: ${THERMAL_CONTENT_WIDTH_MM}mm; margin: 0 auto; padding: 0; box-sizing: border-box; page-break-inside: avoid; break-inside: avoid; overflow: visible; }
    .org-name { text-align: center; font-size: ${hpx(13)}; font-weight: var(--print-w-header, 700); letter-spacing: .02em; line-height: 1.12; margin: 0 0 2px; word-break: break-word; overflow-wrap: anywhere; }
    .doc-title { text-align: center; font-size: ${px(11)}; font-weight: 700; letter-spacing: .08em; margin: 6px 0 4px; }
    .divider { border-top: 1px dashed #000; margin: 4px 0; page-break-inside: avoid; break-inside: avoid; }
    .meta { font-size: ${px(9)}; line-height: 1.25; margin: 1px 0; word-break: break-word; overflow-wrap: anywhere; page-break-inside: avoid; break-inside: avoid; }
    .meta-label { font-weight: 700; }
    .summary-table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; font-size: ${px(8)}; page-break-inside: avoid; break-inside: avoid; }
    .summary-table col.col-label { width: 52%; }
    .summary-table col.col-value { width: 48%; }
    .summary-table td { padding: 1px 0; vertical-align: top; }
    .summary-table tr { page-break-inside: avoid; break-inside: avoid; }
    .summary-table tr.section-row td.section-label { padding-top: 6px; font-weight: 700; text-transform: uppercase; font-size: ${px(8)}; letter-spacing: .02em; border-top: 1px dashed #000; overflow-wrap: anywhere; word-break: break-word; }
    .summary-table tr.section-row-first td.section-label { padding-top: 2px; border-top: 0; }
    .summary-table .amount-label { font-weight: 700; text-align: left; overflow-wrap: anywhere; word-break: break-word; padding-right: 4px; }
    .summary-table .amount-value { font-weight: var(--print-w-body, 600); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; padding-left: 0; padding-right: 0; }
    .summary-table tr.amount-line-grand td { font-size: ${px(10)}; font-weight: 700; }
    .summary-table tr.amount-line-grand .amount-value { font-weight: 700; }
    .footer { margin-top: 8px; text-align: center; font-size: ${fpx(8)}; font-weight: var(--print-w-footer, 700); letter-spacing: normal; line-height: 1.3; page-break-inside: avoid; break-inside: avoid; word-break: break-word; overflow-wrap: anywhere; }
    @media print {
      @page { size: ${THERMAL_PAPER_WIDTH_MM}mm auto; margin: 0 !important; }
      html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm !important; max-width: ${THERMAL_PAPER_WIDTH_MM}mm !important; height: auto !important; min-height: 0 !important; margin: 0 auto !important; padding: 0 !important; overflow: visible !important; page: centrix-thermal; }
      body { font-size: ${px(10, true)}; }
      .receipt { width: ${THERMAL_CONTENT_WIDTH_MM}mm !important; max-width: ${THERMAL_CONTENT_WIDTH_MM}mm !important; margin: 0 auto !important; padding: 0 !important; overflow: visible !important; page-break-before: avoid !important; page-break-after: avoid !important; page-break-inside: avoid !important; break-before: avoid-page !important; break-after: avoid-page !important; break-inside: avoid-page !important; }
      .org-name { font-size: ${hpx(13, true)}; }
      .doc-title { font-size: ${px(11, true)}; }
      .meta { font-size: ${px(9, true)}; }
      .summary-table { font-size: ${px(8, true)}; }
      .summary-table tr.section-row td.section-label { font-size: ${px(8, true)}; }
      .summary-table tr.amount-line-grand td { font-size: ${px(10, true)}; }
      .footer { font-size: ${fpx(8, true)}; }
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
    ${isZ && closed ? `<div class="meta"><span class="meta-label">Closed:</span> ${escapeHtml(formatInTimezone(closed, { hour: "numeric", minute: "2-digit" }) ?? "—")}</div>` : ""}
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
