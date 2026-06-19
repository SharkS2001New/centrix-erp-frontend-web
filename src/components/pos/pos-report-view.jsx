"use client";

import { formatTillKes, formatTillKesExact, formatSessionDateTime, formatSessionTime, normalizeFloatEntries, formatFloatEntryDate } from "@/lib/pos-till";
import { ReportStatGrid } from "@/components/pos/pos-shared";

function paymentSummaryItems(report) {
  const sales = report?.sales ?? {};
  const payments = Array.isArray(report?.payments) ? report.payments : [];

  if (payments.length > 0) {
    return payments.map((row) => ({
      label: row.method_name ?? row.method_code ?? "Payment",
      value: formatTillKes(row.total),
    }));
  }

  return [
    { label: "Cash", value: formatTillKes(sales.cash) },
    { label: "M-Pesa", value: formatTillKes(sales.mpesa) },
    { label: "Bank", value: formatTillKes(sales.bank) },
  ];
}

function FloatBreakdownSection({ session, report, showFloatBreakdown }) {
  if (!showFloatBreakdown) return null;

  const entries =
    report?.float_entries?.length
      ? report.float_entries
      : normalizeFloatEntries(session?.float_breakdown);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-900">Operating float</h2>
      <p className="mt-1 text-xs text-slate-500">
        Total declared float: {formatTillKes(session?.working_amount)}
      </p>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No float entries recorded.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <th className="px-3 py-2">Date added</th>
              <th className="px-3 py-2">Payment type</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={`${entry.date_added}-${index}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-3 py-2.5 text-slate-600">{formatFloatEntryDate(entry.date_added)}</td>
                <td className="px-3 py-2.5 text-slate-800">{entry.payment_type}</td>
                <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                  {formatTillKes(entry.new_float)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CashMovementsSection({ report }) {
  const movements = Array.isArray(report?.cash_movements) ? report.cash_movements : [];
  if (movements.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-900">Cash movements</h2>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((row, index) => (
            <tr key={`${row.recorded_at}-${index}`} className="border-b border-slate-100 last:border-b-0">
              <td className="px-3 py-2.5 capitalize text-slate-800">{String(row.type ?? "").replace("_", " ")}</td>
              <td className="px-3 py-2.5 text-slate-600">{row.reason ?? "—"}</td>
              <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatTillKes(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PosReportView({ report, session, tillName, cashierName, showCashReconciliation = false, variance = null, showFloatBreakdown = false }) {
  const sales = report?.sales ?? {};

  const salesItems = [
    { label: "Transactions", value: sales.transactions ?? 0 },
    { label: "Gross sales", value: formatTillKes(sales.gross) },
    { label: "Discounts", value: formatTillKes(sales.discounts) },
    { label: "Refunds", value: formatTillKes(sales.refunds) },
    { label: "Net sales", value: formatTillKes(sales.net) },
  ];

  const paymentItems = paymentSummaryItems(report);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-900">Session info</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Till</dt><dd className="font-medium">{tillName ?? "—"}</dd></div>
          <div><dt className="text-slate-500">Cashier</dt><dd className="font-medium">{cashierName ?? "—"}</dd></div>
          <div><dt className="text-slate-500">Opened</dt><dd className="font-medium">{formatSessionTime(session?.opened_at)}</dd></div>
          <div><dt className="text-slate-500">Current time</dt><dd className="font-medium">{formatSessionTime(new Date().toISOString())}</dd></div>
          {session?.closed_at ? (
            <div><dt className="text-slate-500">Closed</dt><dd className="font-medium">{formatSessionDateTime(session.closed_at)}</dd></div>
          ) : null}
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-900">Sales summary</h2>
        <div className="mt-4">
          <ReportStatGrid items={salesItems} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-900">Payment summary</h2>
        <div className="mt-4">
          <ReportStatGrid items={paymentItems} />
        </div>
      </div>

      <FloatBreakdownSection session={session} report={report} showFloatBreakdown={showFloatBreakdown} />

      <CashMovementsSection report={report} />

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-900">Cash summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          {showFloatBreakdown ? (
            <div className="flex justify-between"><dt className="text-slate-500">Operating float</dt><dd className="font-medium">{formatTillKes(session?.working_amount)}</dd></div>
          ) : null}
          <div className="flex justify-between"><dt className="text-slate-500">Cash sales</dt><dd className="font-medium">{formatTillKes(sales.cash)}</dd></div>
          {Number(report?.session_expenses) > 0 ? (
            <div className="flex justify-between"><dt className="text-slate-500">Session expenses</dt><dd className="font-medium text-red-700">−{formatTillKes(report.session_expenses)}</dd></div>
          ) : null}
          <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="text-slate-500">Expected cash</dt><dd className="font-semibold text-slate-900">{formatTillKesExact(report?.expected_cash)}</dd></div>
          {showCashReconciliation ? (
            <>
              <div className="flex justify-between"><dt className="text-slate-500">Actual cash</dt><dd className="font-medium">{formatTillKesExact(session?.closing_amount)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <dt className="text-slate-500">Variance</dt>
                <dd className={`font-semibold ${Number(variance) < 0 ? "text-red-700" : Number(variance) > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {variance != null ? formatTillKesExact(variance) : "—"}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
