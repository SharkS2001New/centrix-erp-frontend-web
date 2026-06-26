import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { formatTillKes, formatTillKesExact, tillDisplayName, normalizeFloatEntries, formatFloatEntryDate, resolveTillReportBundle, resolveNetSalesMinusFloat } from "@/lib/pos-till";
import { openPrintWindow } from "@/lib/open-print-window";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function line(label, value) {
  return `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function paymentPrintLines(report) {
  const sales = report?.sales ?? {};
  const payments = Array.isArray(report?.payments) ? report.payments : [];

  if (payments.length > 0) {
    return payments
      .map((row) =>
        line(
          row.method_name ?? row.method_code ?? "Payment",
          formatTillKes(row.total).replace(/^KES\s*/, ""),
        ),
      )
      .join("");
  }

  return [
    line("Cash", formatTillKes(sales.cash).replace(/^KES\s*/, "")),
    line("M-Pesa", formatTillKes(sales.mpesa).replace(/^KES\s*/, "")),
    line("Bank", formatTillKes(sales.bank).replace(/^KES\s*/, "")),
  ].join("");
}

/**
 * Print X or Z till report (80mm thermal-style).
 */
export function printPosTillReport({
  type = "X",
  organizationName = DEFAULT_PRINT_ORG_NAME,
  tillName,
  cashierName,
  report: reportPayload,
  session: sessionOverride,
  variance = null,
  showFloatBreakdown = false,
}) {
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

  const rows = [
    line("Transactions", String(sales.transactions ?? 0)),
    line("Net Sales", formatTillKes(netSales).replace(/^KES\s*/, "")),
    ...(showFloatBreakdown
      ? [line("Net sales minus float", formatTillKes(netSalesMinusFloat).replace(/^KES\s*/, ""))]
      : []),
    ...(Number(sales.total_vat) > 0
      ? [line("VAT total", formatTillKes(sales.total_vat).replace(/^KES\s*/, ""))]
      : []),
    line("Refunds", formatTillKes(sales.refunds).replace(/^KES\s*/, "")),
    ...(Number(sales.debtor_collections) > 0
      ? [line("Debtor collections", formatTillKes(sales.debtor_collections).replace(/^KES\s*/, ""))]
      : []),
  ].join("");

  const payments = paymentPrintLines(report);

  const isZ = type === "Z";
  const floatEntries =
    showFloatBreakdown && (report?.float_entries?.length || session?.float_breakdown)
      ? report?.float_entries?.length
        ? report.float_entries
        : normalizeFloatEntries(session?.float_breakdown)
      : [];
  const floatBlock =
    floatEntries.length > 0
      ? [
          `<div class="section">Operating float</div>`,
          ...floatEntries.map((entry) =>
            line(
              `${entry.payment_type}${entry.date_added ? ` (${formatFloatEntryDate(entry.date_added)})` : ""}`,
              formatTillKes(entry.new_float).replace(/^KES\s*/, ""),
            ),
          ),
          line("Total float", formatTillKes(session?.working_amount).replace(/^KES\s*/, "")),
          "<hr />",
        ].join("")
      : showFloatBreakdown && session?.working_amount != null
        ? `<div class="section">Operating float</div>${line("Total", formatTillKes(session.working_amount).replace(/^KES\s*/, ""))}<hr />`
        : "";

  const cashBlock = isZ
    ? [
        line("Expected Cash", formatTillKesExact(report?.expected_cash).replace(/^KES\s*/, "")),
        line("Actual Cash", formatTillKesExact(session?.closing_amount).replace(/^KES\s*/, "")),
        line(
          "Variance",
          printVariance != null
            ? Number(printVariance).toLocaleString("en-KE", { maximumFractionDigits: 0 })
            : "—",
        ),
      ].join("")
    : [
        ...(showFloatBreakdown
          ? [
              line("Operating float", formatTillKes(till.opening_float ?? session?.working_amount).replace(/^KES\s*/, "")),
              line("Cash collected", formatTillKes(till.cash_collected ?? sales.cash).replace(/^KES\s*/, "")),
              line("Gross till total", formatTillKes(till.gross_total).replace(/^KES\s*/, "")),
            ]
          : []),
        ...(Number(report?.session_expenses) > 0
          ? [line("Session expenses", formatTillKes(report.session_expenses).replace(/^KES\s*/, ""))]
          : []),
        line("Expected Cash", formatTillKes(report?.expected_cash).replace(/^KES\s*/, "")),
      ].join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${type} Report</title>
  <style>
    body { font-family: monospace; margin: 0; padding: 12px; font-size: 12px; color: #000; }
    .wrap { max-width: 280px; margin: 0 auto; }
    .center { text-align: center; }
    .title { font-size: 14px; font-weight: 700; margin: 8px 0; }
    .org { font-size: 11px; letter-spacing: 0.08em; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    .section { margin: 8px 0; font-weight: 700; text-transform: uppercase; font-size: 11px; }
    .footer { margin-top: 12px; text-align: center; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="center org">${escapeHtml(organizationName)}</div>
    <div class="center title">${type} REPORT</div>
    <hr />
    <div>Till: ${escapeHtml(tillName ?? "—")}</div>
    <div>Cashier: ${escapeHtml(cashierName ?? "—")}</div>
    <div>Date: ${escapeHtml(dateStr)}</div>
    ${isZ && closed ? `<div>Closed: ${escapeHtml(new Date(closed).toLocaleTimeString("en-KE"))}</div>` : ""}
    <hr />
    ${floatBlock}
    <div class="section">Sales</div>
    ${rows}
    <hr />
    <div class="section">Payment summary</div>
    ${payments}
    <hr />
    ${cashBlock}
    <hr />
    <div class="footer">${isZ ? "SESSION CLOSED" : "SESSION STILL OPEN"}</div>
  </div>
</body>
</html>`;

  openPrintWindow(html, "width=360,height=720");
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
