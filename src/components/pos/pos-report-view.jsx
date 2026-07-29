"use client";

import {
  formatTillKes,
  formatTillKesExact,
  formatSessionDateTime,
  formatSessionTime,
  normalizeFloatEntries,
  formatFloatEntryDate,
  cashMovementLabel,
  resolveTillReportNo,
  resolveTillReportPaymentLines,
  resolveTillSalesSummaryRows,
} from "@/lib/pos-till";

function ReportSection({ title, children, action = null }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function ReportSummaryRows({ items, grandLabels = [] }) {
  const grandSet = new Set(grandLabels);

  return (
    <dl className="text-sm">
      {items.map((item) => {
        const grand = grandSet.has(item.label);
        return (
          <div
            key={item.label}
            className={`py-1 ${grand ? "mt-1 border-t border-slate-200 pt-2 font-semibold" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-4">
              <dt className={grand ? "text-slate-800" : "text-slate-600"}>{item.label}</dt>
              <dd className={`shrink-0 tabular-nums ${item.valueClassName ?? "text-slate-900"}`}>
                {item.value}
              </dd>
            </div>
            {item.hint ? (
              <p className="mt-0.5 text-[11px] italic leading-snug text-slate-400">{item.hint}</p>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

function FloatBreakdownSection({ session, report, showFloatBreakdown }) {
  if (!showFloatBreakdown) return null;

  const entries =
    report?.float_entries?.length
      ? report.float_entries
      : normalizeFloatEntries(session?.float_breakdown);

  if (entries.length === 0) {
    return (
      <ReportSection title="Operating float">
        <ReportSummaryRows
          items={[{ label: "Total", value: formatTillKes(session?.working_amount) }]}
          grandLabels={["Total"]}
        />
      </ReportSection>
    );
  }

  return (
    <ReportSection title="Operating float">
      <dl className="text-sm">
        {entries.map((entry, index) => (
          <div
            key={`${entry.date_added}-${index}`}
            className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-1 last:border-b-0"
          >
            <dt className="min-w-0 text-slate-600">
              {entry.payment_type}
              {entry.date_added ? (
                <span className="text-slate-400"> · {formatFloatEntryDate(entry.date_added)}</span>
              ) : null}
            </dt>
            <dd className="shrink-0 tabular-nums text-slate-900">{formatTillKes(entry.new_float)}</dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2 font-semibold">
          <dt className="text-slate-800">Total float</dt>
          <dd className="shrink-0 tabular-nums text-slate-900">{formatTillKes(session?.working_amount)}</dd>
        </div>
      </dl>
    </ReportSection>
  );
}

function CashMovementsSection({ report }) {
  const movements = Array.isArray(report?.cash_movements) ? report.cash_movements : [];
  if (movements.length === 0) return null;

  return (
    <ReportSection title="Cash movements">
      <dl className="text-sm">
        {movements.map((row, index) => (
          <div
            key={`${row.recorded_at}-${index}`}
            className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-1 last:border-b-0"
          >
            <dt className="min-w-0 text-slate-600">
              {cashMovementLabel(row.type)}
              {row.reason ? <span className="text-slate-400"> · {row.reason}</span> : null}
            </dt>
            <dd className="shrink-0 tabular-nums text-slate-900">{formatTillKes(row.amount)}</dd>
          </div>
        ))}
      </dl>
    </ReportSection>
  );
}

export function PosReportView({
  report,
  session,
  tillName,
  till = null,
  cashierName,
  showCashReconciliation = false,
  variance = null,
  showFloatBreakdown = false,
}) {
  const sales = report?.sales ?? {};
  const tillReport = report?.till ?? {};
  const sessionExpenses = Number(report?.session_expenses ?? tillReport?.session_expenses ?? 0);
  const tillNo = resolveTillReportNo({ tillName, till, session, report });

  const paymentItems = resolveTillReportPaymentLines(report).map((row) => ({
    label: row.label,
    value: formatTillKes(row.total),
  }));
  paymentItems.push({
    label: "Total paid debtors",
    value: formatTillKes(sales.debtor_collections ?? 0),
  });

  const salesItems = [
    {
      label: "Total expenses",
      value: formatTillKes(sessionExpenses),
      valueClassName: sessionExpenses > 0 ? "text-red-700" : undefined,
    },
  ];

  const salesSummaryItems = resolveTillSalesSummaryRows(report, session, {
    showFloatBreakdown,
  }).map((row) => ({
    label: row.label,
    value: formatTillKes(row.amount),
    hint: row.hint,
  }));

  const cashItems = [
    ...(showFloatBreakdown
      ? [
          { label: "Operating float", value: formatTillKes(tillReport.opening_float ?? session?.working_amount) },
          { label: "Cash collected", value: formatTillKes(tillReport.cash_collected ?? sales.cash) },
          {
            label: "Gross till total",
            value: formatTillKes(
              tillReport.gross_total ??
                Number(tillReport.opening_float ?? session?.working_amount ?? 0)
                + Number(tillReport.cash_collected ?? sales.cash ?? 0),
            ),
          },
        ]
      : []),
    { label: "Expected cash", value: formatTillKesExact(report?.expected_cash) },
    ...(showCashReconciliation
      ? [
          { label: "Actual cash", value: formatTillKesExact(session?.closing_amount) },
          {
            label: "Variance",
            value: variance != null ? formatTillKesExact(variance) : "—",
            valueClassName:
              variance != null
                ? Number(variance) < 0
                  ? "text-red-700"
                  : Number(variance) > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
                : undefined,
          },
        ]
      : []),
  ];

  const cashGrandLabels = showCashReconciliation ? ["Variance"] : ["Expected cash"];

  return (
    <div className="space-y-4 text-sm">
      <ReportSummaryRows
        items={[
          { label: "Till No", value: tillNo },
          { label: "Cashier", value: cashierName ?? "—" },
          { label: "Opened", value: formatSessionTime(session?.opened_at) },
          ...(session?.closed_at
            ? [{ label: "Closed", value: formatSessionDateTime(session.closed_at) }]
            : [{ label: "Current time", value: formatSessionTime(new Date().toISOString()) }]),
        ]}
      />

      <div className="space-y-4 border-t border-slate-200 pt-4">
        <FloatBreakdownSection session={session} report={report} showFloatBreakdown={showFloatBreakdown} />

        <ReportSection title="Payment summary">
          <ReportSummaryRows items={paymentItems} />
        </ReportSection>

        <ReportSection title="Sales">
          <ReportSummaryRows items={salesItems} />
        </ReportSection>

        <ReportSection title="Sales summary">
          <ReportSummaryRows items={salesSummaryItems} />
        </ReportSection>

        <CashMovementsSection report={report} />

        <ReportSection title="Cash">
          <ReportSummaryRows items={cashItems} grandLabels={cashGrandLabels} />
        </ReportSection>
      </div>
    </div>
  );
}
