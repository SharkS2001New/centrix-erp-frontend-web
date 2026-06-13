import { formatTillKes, formatTillKesExact, tillDisplayName, normalizeFloatEntries, formatFloatEntryDate } from "@/lib/pos-till";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function line(label, value) {
  return `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

/**
 * Print X or Z till report (80mm thermal-style).
 */
export function printPosTillReport({
  type = "X",
  organizationName = "POS / ERP",
  tillName,
  cashierName,
  report,
  session,
  variance = null,
  showFloatBreakdown = false,
}) {
  const sales = report?.sales ?? {};
  const opened = session?.opened_at;
  const closed = session?.closed_at;
  const dateStr = opened
    ? new Date(opened).toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-KE");

  const rows = [
    line("Transactions", String(sales.transactions ?? 0)),
    line("Gross Sales", formatTillKes(sales.gross).replace(/^KES\s*/, "")),
    line("Discounts", formatTillKes(sales.discounts).replace(/^KES\s*/, "")),
    line("Refunds", formatTillKes(sales.refunds).replace(/^KES\s*/, "")),
    line("Net Sales", formatTillKes(sales.net).replace(/^KES\s*/, "")),
  ].join("");

  const payments = [
    line("Cash", formatTillKes(sales.cash).replace(/^KES\s*/, "")),
    line("M-Pesa", formatTillKes(sales.mpesa).replace(/^KES\s*/, "")),
    line("Bank", formatTillKes(sales.bank).replace(/^KES\s*/, "")),
  ].join("");

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
          variance != null
            ? Number(variance).toLocaleString("en-KE", { maximumFractionDigits: 0 })
            : "—",
        ),
      ].join("")
    : [
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
    <div class="section">Payments</div>
    ${payments}
    <hr />
    ${cashBlock}
    <hr />
    <div class="footer">${isZ ? "SESSION CLOSED" : "SESSION STILL OPEN"}</div>
  </div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=360,height=720");
  if (!win) return;
  win.document.write(html);
  win.document.close();
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
