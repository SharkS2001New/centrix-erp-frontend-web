"use client";

import Link from "next/link";
import { formatTillKes, formatTillKesExact, formatSessionDateTime, formatSessionTime, normalizeFloatEntries, formatFloatEntryDate, resolveNetSalesMinusFloat, cashMovementLabel } from "@/lib/pos-till";
import { buildExpensesHref } from "@/lib/expenses-link";
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
    <div className="theme-panel rounded-xl border p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-900">Operating float</h2>
      <p className="mt-1 text-xs text-slate-500">
        Total declared float: {formatTillKes(session?.working_amount)}
      </p>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No float entries recorded.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="theme-table-head-row text-left text-xs font-medium">
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
    <div className="theme-panel rounded-xl border p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-900">Cash movements</h2>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="theme-table-head-row text-left text-xs font-medium">
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((row, index) => (
            <tr key={`${row.recorded_at}-${index}`} className="border-b border-slate-100 last:border-b-0">
              <td className="px-3 py-2.5 text-slate-800">{cashMovementLabel(row.type)}</td>
              <td className="px-3 py-2.5 text-slate-600">{row.reason ?? "—"}</td>
              <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatTillKes(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PosReportView({ report, session, tillName, cashierName, showCashReconciliation = false, variance = null, showFloatBreakdown = false, expensesFromDate = null, expensesToDate = null }) {
  const sales = report?.sales ?? {};
  const till = report?.till ?? {};
  const expensesHref = buildExpensesHref({ fromDate: expensesFromDate, toDate: expensesToDate });
  const netSales = Number(sales.net_sales ?? sales.net ?? 0);
  const openingFloat = Number(till.opening_float ?? session?.working_amount ?? 0);
  const netSalesMinusFloat = showFloatBreakdown
    ? resolveNetSalesMinusFloat({
        netSales,
        openingFloat,
        netSalesMinusFloat: sales.net_sales_minus_float,
      })
    : null;

  const salesItems = [
    { label: "Transactions", value: sales.transactions ?? 0 },
    { label: "Net sales", value: formatTillKes(netSales) },
    ...(showFloatBreakdown
      ? [{ label: "Net sales minus float", value: formatTillKes(netSalesMinusFloat) }]
      : []),
    ...(Number(sales.total_vat) > 0
      ? [{ label: "VAT total", value: formatTillKes(sales.total_vat) }]
      : []),
    { label: "Refunds", value: formatTillKes(sales.refunds) },
    ...(Number(sales.debtor_collections) > 0
      ? [{ label: "Debtor collections", value: formatTillKes(sales.debtor_collections) }]
      : []),
  ];

  const paymentItems = paymentSummaryItems(report);

  return (
    <div className="space-y-6">
      <div className="theme-panel rounded-xl border p-5 shadow-sm">
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

      <div className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-900">Sales summary</h2>
        <div className="mt-4">
          <ReportStatGrid items={salesItems} />
        </div>
      </div>

      <div className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-900">Payment summary</h2>
        <div className="mt-4">
          <ReportStatGrid items={paymentItems} />
        </div>
      </div>

      <FloatBreakdownSection session={session} report={report} showFloatBreakdown={showFloatBreakdown} />

      <CashMovementsSection report={report} />

      {Number(report?.session_expenses) > 0 ? (
        <div className="theme-panel rounded-xl border p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-900">Session expenses</h2>
            <Link href={expensesHref} className="text-xs font-medium text-[#185FA5] hover:underline">
              View expenses
            </Link>
          </div>
          <p className="mt-3 text-sm font-medium text-red-700">−{formatTillKes(report.session_expenses)}</p>
        </div>
      ) : null}

      <div className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-900">Cash summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          {showFloatBreakdown ? (
            <div className="flex justify-between"><dt className="text-slate-500">Operating float</dt><dd className="font-medium">{formatTillKes(till.opening_float ?? session?.working_amount)}</dd></div>
          ) : null}
          <div className="flex justify-between"><dt className="text-slate-500">Cash collected</dt><dd className="font-medium">{formatTillKes(till.cash_collected ?? sales.cash)}</dd></div>
          {showFloatBreakdown ? (
            <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="text-slate-500">Gross till total</dt><dd className="font-semibold text-slate-900">{formatTillKes(till.gross_total ?? (Number(till.opening_float ?? session?.working_amount ?? 0) + Number(till.cash_collected ?? sales.cash ?? 0)))}</dd></div>
          ) : null}
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

      {expensesFromDate ? (
        <div className="flex justify-end">
          <Link href={expensesHref} className="text-sm font-medium text-[#185FA5] hover:underline">
            View expenses
          </Link>
        </div>
      ) : null}
    </div>
  );
}
