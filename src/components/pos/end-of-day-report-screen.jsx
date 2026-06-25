"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { filterByOrganization, orgListParams } from "@/lib/admin";
import { isTillFloatWorkflowEnabled, areSalesDiscountsEnabled } from "@/lib/sales-settings";
import { openPrintWindow } from "@/lib/open-print-window";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";
import { formatTillKes, formatTillKesExact } from "@/lib/pos-till";
import {
  FilterSelect,
  PrimaryButton,
  StatCard,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  formatAppDate,
  formatAppDateTime,
  formatInTimezone,
  todayCalendarDate,
} from "@/lib/datetime";

function todayIsoDate() {
  return todayCalendarDate();
}

function formatReportDate(value) {
  return formatAppDate(value);
}

function formatReportTime(value) {
  if (!value) return "—";
  return (
    formatInTimezone(value, {
      hour: "numeric",
      minute: "2-digit",
    }) ?? "—"
  );
}

function formatDuration(start, end) {
  if (!start || !end) return "—";
  const mins = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function kesNum(value) {
  return Number(value ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 });
}

function PaymentDonut({ payments }) {
  const segments = [
    { key: "cash", label: "Cash", value: Number(payments?.cash ?? 0), color: "#185FA5" },
    { key: "mpesa", label: "M-Pesa", value: Number(payments?.mpesa ?? 0), color: "#059669" },
    { key: "bank", label: "Bank", value: Number(payments?.bank ?? 0), color: "#7c3aed" },
    { key: "card", label: "Card", value: Number(payments?.card ?? 0), color: "#d97706" },
  ];
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        No payments recorded
      </div>
    );
  }

  let offset = 0;
  const stops = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const pct = (s.value / total) * 100;
      const stop = `${s.color} ${offset}% ${offset + pct}%`;
      offset += pct;
      return stop;
    })
    .join(", ");

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div
        className="h-36 w-36 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
        aria-hidden
      />
      <table className="w-full text-sm">
        <tbody>
          {segments.map((s) => {
            const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0";
            return (
              <tr key={s.key} className="border-b border-slate-100 last:border-b-0">
                <td className="py-2 pr-3">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </td>
                <td className="py-2 text-right font-medium text-black">{formatTillKes(s.value)}</td>
                <td className="py-2 pl-3 text-right text-slate-500">{pct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ title, children, className = "" }) {
  return (
    <div className={`theme-panel rounded-xl border p-5 shadow-sm ${className}`}>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value, tone = "default", bold = false }) {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "success"
        ? "text-emerald-700"
        : tone === "primary"
          ? "text-[#185FA5]"
          : "text-black";
  return (
    <div className={`flex items-center justify-between gap-3 py-2 text-sm ${bold ? "font-semibold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={toneClass}>{value}</span>
    </div>
  );
}

function printEodReport(report, meta) {
  const s = report?.summary ?? {};
  const html = `<!DOCTYPE html><html><head><title>End of Day Report</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#000;font-size:13px}
h1{font-size:20px;margin:0 0 4px} .muted{color:#64748b;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:20px}
.box{border:1px solid #e2e8f0;border-radius:8px;padding:12px}
.row{display:flex;justify-content:space-between;margin:4px 0}
.footer{margin-top:24px;font-size:11px;color:#64748b}
</style></head><body>
${meta.organizationName ? `<h1>${meta.organizationName}</h1>` : ""}
<h1${meta.organizationName ? ' style="font-size:16px;margin-top:8px"' : ""}>End of Day Sales Report</h1>
<p class="muted">${meta.branchName ?? "All branches"} · ${meta.cashierName ?? "All cashiers"} · ${formatReportDate(report?.sale_date)}</p>
<p class="muted">Printed: ${formatAppDateTime(new Date())}</p>
<div class="grid">
<div class="box"><strong>Sales</strong>
<div class="row"><span>Gross</span><span>${kesNum(s.gross_sales)}</span></div>
${meta.showDiscounts ? `<div class="row"><span>Discounts</span><span>${kesNum(s.total_discounts)}</span></div>` : ""}
<div class="row"><span>Refunds</span><span>${kesNum(s.total_refunds)}</span></div>
<div class="row"><span>Net sales</span><span>${kesNum(s.net_sales)}</span></div>
${meta.showFloat ? `<div class="row"><span>Opening float</span><span>${kesNum(s.opening_float)}</span></div>` : ""}
<div class="row"><span>Net cash expected</span><span>${kesNum(s.net_cash_expected)}</span></div>
</div>
<div class="box"><strong>Payments</strong>
<div class="row"><span>Cash</span><span>${kesNum(report?.payments?.cash)}</span></div>
<div class="row"><span>M-Pesa</span><span>${kesNum(report?.payments?.mpesa)}</span></div>
<div class="row"><span>Bank</span><span>${kesNum(report?.payments?.bank)}</span></div>
</div>
</div>
<p class="footer">Generated by ${meta.userName ?? "—"}</p>
</body></html>`;
  openPrintWindow(html, "width=900,height=720");
}

function buildEodExportRows(report, { requireTillFloat, discountsEnabled }) {
  const s = report?.summary ?? {};
  const p = report?.payments ?? {};
  const rows = [];
  const push = (section, item, value) => rows.push({ section, item, value });

  push("Sales", "Gross sales", kesNum(s.gross_sales));
  if (discountsEnabled) push("Sales", "Total discounts", kesNum(s.total_discounts));
  push("Sales", "Total refunds", kesNum(s.total_refunds));
  push("Sales", "Net sales", kesNum(s.net_sales));
  push("Sales", "Transactions", String(s.transactions ?? 0));
  if (requireTillFloat) push("Sales", "Opening float", kesNum(s.opening_float));
  if (requireTillFloat) push("Sales", "Net cash expected", kesNum(s.net_cash_expected));

  push("Payments", "Cash", kesNum(p.cash));
  push("Payments", "M-Pesa", kesNum(p.mpesa));
  push("Payments", "Bank", kesNum(p.bank));
  push("Payments", "Card", kesNum(p.card));

  push("Metrics", "Average sale value", kesNum(s.average_sale_value));
  push("Metrics", "Items sold", String(s.items_sold ?? 0));
  push("Metrics", "Voided transactions", String(s.voided_transactions ?? 0));
  push("Metrics", "Total customers", String(s.customers ?? 0));

  for (const row of report?.cashiers ?? []) {
    push(
      "Cashier sales",
      row.cashier ?? "—",
      `${kesNum(row.gross_sales)} · ${row.transactions ?? 0} txns`,
    );
  }

  for (const row of report?.expenses ?? []) {
    push("Expenses", row.group_name ?? "Other", kesNum(row.amount));
  }
  if ((report?.expenses ?? []).length) {
    push("Expenses", "Total expenses", kesNum(report.total_expenses));
  }

  if (report?.debtors) {
    push("Debtors", "New credit sales", kesNum(report.debtors.new_credit_sales));
    push("Debtors", "Payments received", kesNum(report.debtors.payments_received));
    push("Debtors", "Closing debtors", kesNum(report.debtors.closing));
  }

  if (requireTillFloat && report?.net_position != null) {
    push("Net position", "Net position", kesNum(report.net_position));
  }

  return rows;
}

const EOD_EXPORT_COLUMNS = [
  { key: "section", label: "Section", accessor: (row) => row.section },
  { key: "item", label: "Item", accessor: (row) => row.item },
  { key: "value", label: "Value", accessor: (row) => row.value, align: "right" },
];

export function EndOfDayReportScreen() {
  const { user, capabilities, organization } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const requireTillFloat = isTillFloatWorkflowEnabled(capabilities?.module_settings);
  const discountsEnabled = areSalesDiscountsEnabled(capabilities?.module_settings);

  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [saleDate, setSaleDate] = useState(todayIsoDate());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!organizationId) return;
    Promise.all([
      apiRequest("/branches", { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
      apiRequest("/users", { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
    ])
      .then(([branchRes, userRes]) => {
        const list = filterByOrganization(branchRes.data ?? [], organizationId);
        setBranches(list);
        setUsers(filterByOrganization(userRes.data ?? [], organizationId));
        if (!branchId && user?.branch_id) {
          setBranchId(String(user.branch_id));
        } else if (!branchId && list[0]) {
          setBranchId(String(list[0].id));
        }
      })
      .catch(() => {
        setBranches([]);
        setUsers([]);
      });
  }, [organizationId, user?.branch_id, branchId]);

  const cashierOptions = useMemo(() => {
    const active = users.filter((u) => u.is_active !== false);
    const scoped = branchId
      ? active.filter((u) => !u.branch_id || String(u.branch_id) === branchId)
      : active;
    return scoped
      .map((u) => ({
        value: String(u.id),
        label: u.full_name?.trim() || u.username || `User #${u.id}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [users, branchId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { sale_date: saleDate };
      if (branchId) params.branch_id = branchId;
      if (cashierId) params.cashier_id = cashierId;
      const data = await apiRequest("/reports/eod-report", { searchParams: params });
      setReport(data);
    } catch (e) {
      setReport(null);
      setError(e instanceof ApiError ? e.message : "Failed to load end-of-day report");
    } finally {
      setLoading(false);
    }
  }, [saleDate, branchId, cashierId]);

  useEffect(() => {
    if (saleDate) load();
  }, [load, saleDate]);

  const summary = report?.summary ?? {};
  const payments = report?.payments ?? {};
  const branchName =
    report?.branch_name ?? branches.find((b) => String(b.id) === branchId)?.branch_name ?? "All branches";
  const cashierName =
    report?.cashier_name ??
    (cashierId ? cashierOptions.find((c) => c.value === cashierId)?.label : null);

  const paymentTotal = useMemo(
    () =>
      Number(payments.cash ?? 0) +
      Number(payments.mpesa ?? 0) +
      Number(payments.bank ?? 0) +
      Number(payments.card ?? 0),
    [payments],
  );

  const eodExportMeta = useMemo(
    () => ({
      fromDate: saleDate,
      toDate: saleDate,
      branchName,
      extraLines: [
        cashierName ? `Cashier: ${cashierName}` : "Cashier: All cashiers",
        `Report date: ${formatReportDate(saleDate)}`,
      ],
    }),
    [branchName, cashierName, saleDate],
  );

  const getEodExportRows = useCallback(
    async () =>
      buildEodExportRows(report, {
        requireTillFloat,
        discountsEnabled,
      }),
    [discountsEnabled, report, requireTillFloat],
  );

  const handleEodPrint = useCallback(
    async () => {
      if (!report) return;
      printEodReport(report, {
        organizationName: organization?.org_name ?? organization?.name ?? "",
        branchName,
        cashierName: cashierName ?? "All cashiers",
        showFloat: requireTillFloat,
        showDiscounts: discountsEnabled,
        userName: user?.full_name ?? user?.username,
      });
    },
    [
      branchName,
      cashierName,
      discountsEnabled,
      organization?.name,
      organization?.org_name,
      report,
      requireTillFloat,
      user?.full_name,
      user?.username,
    ],
  );

  return (
    <div className="theme-workspace min-h-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">
            <Link href="/reports" className="hover:text-[#185FA5]">Reports</Link>
            {" / "}
            <span className="text-slate-700">End of Day Sales</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">End of Day Sales Report</h1>
          <p className="mt-1 text-sm text-slate-500">
            {branchName} · {formatReportDate(saleDate)}
            {cashierName ? ` · ${cashierName}` : " · All cashiers"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Branch</label>
            <FilterSelect
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setCashierId("");
              }}
              options={[
                { value: "", label: "All branches" },
                ...branches.map((b) => ({ value: String(b.id), label: b.branch_name })),
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Cashier</label>
            <FilterSelect
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              options={[{ value: "", label: "All cashiers" }, ...cashierOptions]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
            <input
              type="date"
              className={`${inputClassName()} w-40`}
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-black hover:bg-slate-50"
          >
            Filter
          </button>
          {report ? (
            <ReportExportToolbar
              filename={`eod-report-${saleDate}`}
              title="End of Day Sales Report"
              subtitle={`${branchName} · ${formatReportDate(saleDate)}`}
              columns={EOD_EXPORT_COLUMNS}
              getRows={getEodExportRows}
              meta={eodExportMeta}
              onPrint={handleEodPrint}
              disabled={loading}
            />
          ) : null}
          <PrimaryButton type="button" showIcon={false} onClick={load} disabled={loading}>
            Refresh
          </PrimaryButton>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading end-of-day report…</p>
      ) : !report ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
          No report data for the selected date.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total sales" value={formatTillKes(summary.gross_sales)} hint="Gross sales" />
            <StatCard label="Total transactions" value={summary.transactions ?? 0} hint="All transactions" />
            {discountsEnabled ? (
              <StatCard label="Total discounts" value={formatTillKes(summary.total_discounts)} hint="Discounts given" />
            ) : null}
            <StatCard label="Total refunds" value={formatTillKes(summary.total_refunds)} hint="Refunds issued" />
            <StatCard
              label="Net sales"
              value={formatTillKes(summary.net_sales)}
              hint={discountsEnabled ? "After discounts & refunds" : "After refunds"}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Panel title="Sales summary">
              <SummaryRow label="Gross sales" value={formatTillKes(summary.gross_sales)} />
              {discountsEnabled ? (
                <SummaryRow label="Total discounts" value={`-${formatTillKes(summary.total_discounts)}`} tone="danger" />
              ) : null}
              <SummaryRow label="Total refunds" value={`-${formatTillKes(summary.total_refunds)}`} tone="danger" />
              <div className="my-2 border-t border-slate-100" />
              <SummaryRow label="Net sales" value={formatTillKes(summary.net_sales)} tone="success" bold />
              {requireTillFloat ? (
                <SummaryRow label="Opening float" value={formatTillKes(summary.opening_float)} />
              ) : null}
              {requireTillFloat ? (
                <div className="mt-2 rounded-lg bg-[#E6F1FB] px-3 py-2">
                  <SummaryRow label="Net cash expected" value={formatTillKesExact(summary.net_cash_expected)} tone="primary" bold />
                </div>
              ) : null}
            </Panel>

            <Panel title="Payment summary">
              <PaymentDonut payments={payments} />
              <p className="mt-3 text-right text-xs text-slate-500">
                Total collected {formatTillKes(paymentTotal)}
              </p>
            </Panel>

            <Panel title="Key metrics">
              <SummaryRow label="Average sale value" value={formatTillKesExact(summary.average_sale_value)} />
              <SummaryRow label="Items sold" value={summary.items_sold ?? 0} />
              <SummaryRow label="Voided transactions" value={summary.voided_transactions ?? 0} />
              <SummaryRow label="Total customers" value={summary.customers ?? 0} />
              <SummaryRow label="Start time" value={formatReportTime(summary.start_time)} />
              <SummaryRow label="End time" value={formatReportTime(summary.end_time)} />
              <SummaryRow label="Session duration" value={formatDuration(summary.start_time, summary.end_time)} />
            </Panel>

            <Panel title="Cashier sales">
              {(report.cashiers ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No cashier sales for this date.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                      <th className="pb-2 pr-3">Cashier</th>
                      <th className="pb-2 pr-3 text-right">Total sales</th>
                      <th className="pb-2 pr-3 text-right">Transactions</th>
                      <th className="pb-2 pr-3 text-right">Cash</th>
                      <th className="pb-2 pr-3 text-right">M-Pesa</th>
                      <th className="pb-2 text-right">Bank</th>
                      {requireTillFloat ? <th className="pb-2 pl-3 text-right">Float</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {(report.cashiers ?? []).map((row) => {
                      const isSelected = cashierId && String(row.cashier_id) === cashierId;
                      return (
                        <tr
                          key={row.cashier_id}
                          className={`border-b border-slate-100 last:border-b-0 ${
                            isSelected ? "bg-[#E6F1FB]" : ""
                          }`}
                        >
                          <td className="py-2.5 pr-3">
                            <button
                              type="button"
                              onClick={() => setCashierId(String(row.cashier_id))}
                              className="font-medium text-[#185FA5] hover:underline"
                            >
                              {row.cashier ?? "—"}
                            </button>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-medium text-slate-900">
                            {formatTillKes(row.gross_sales)}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-slate-700">{row.transactions ?? 0}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-700">{formatTillKes(row.cash_collected)}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-700">{formatTillKes(row.mpesa_collected)}</td>
                          <td className="py-2.5 text-right text-slate-700">{formatTillKes(row.bank_collected)}</td>
                          {requireTillFloat ? (
                            <td className="py-2.5 pl-3 text-right text-slate-700">
                              {formatTillKes(row.opening_float)}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {cashierId ? (
                <button
                  type="button"
                  onClick={() => setCashierId("")}
                  className="mt-3 text-xs font-medium text-[#185FA5] hover:underline"
                >
                  Clear cashier filter — show all cashiers
                </button>
              ) : null}
            </Panel>

            {requireTillFloat ? (
            <Panel title="Till & cashier summary" className="lg:col-span-2">
              {(report.tills ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No till sessions for this date.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                      <th className="pb-2 pr-3">Till</th>
                      <th className="pb-2 pr-3">Cashier</th>
                      <th className="pb-2 pr-3 text-right">Total sales</th>
                      <th className="pb-2 text-right">Transactions</th>
                      <th className="pb-2 pl-3 text-right">Float</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.tills ?? []).map((row, i) => (
                      <tr key={`${row.till_number}-${i}`} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-2.5 pr-3 font-medium text-slate-900">
                          {row.till_number}
                          {row.till_name ? ` · ${row.till_name}` : ""}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">{row.cashier ?? "—"}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-900">{formatTillKes(row.gross_sales)}</td>
                        <td className="py-2.5 text-right text-slate-700">{row.transactions ?? 0}</td>
                        <td className="py-2.5 pl-3 text-right text-slate-700">{formatTillKes(row.opening_float)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
            ) : null}

            <Panel title="Expenses summary">
              {(report.expenses ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No expenses recorded.</p>
              ) : (
                <>
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {(report.expenses ?? []).map((row) => (
                        <tr key={row.group_name} className="border-b border-slate-100 last:border-b-0">
                          <td className="py-2 text-slate-700">{row.group_name ?? "Other"}</td>
                          <td className="py-2 text-right font-medium text-black">{formatTillKes(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 border-t border-slate-200 pt-2">
                    <SummaryRow label="Total expenses" value={formatTillKes(report.total_expenses)} tone="danger" bold />
                  </div>
                </>
              )}
            </Panel>

            <Panel title="Debtor summary">
              <SummaryRow label="Opening debtors" value="—" />
              <SummaryRow label="New sales (credit)" value={formatTillKes(report.debtors?.new_credit_sales)} />
              <SummaryRow label="Payments received" value={formatTillKes(report.debtors?.payments_received)} tone="success" />
              <div className="mt-2 border-t border-slate-100 pt-2">
                <SummaryRow label="Closing debtors" value={formatTillKes(report.debtors?.closing)} tone="danger" bold />
              </div>
            </Panel>
          </div>

          {requireTillFloat ? (
          <div className="mt-6 theme-panel rounded-xl border p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-center gap-3 text-center text-sm">
              <div className="rounded-lg bg-[#E6F1FB] px-4 py-3">
                <p className="text-xs text-slate-500">Net cash expected</p>
                <p className="text-lg font-semibold text-[#185FA5]">{formatTillKes(summary.net_cash_expected)}</p>
              </div>
              <span className="text-xl text-slate-400">−</span>
              <div className="rounded-lg bg-red-50 px-4 py-3">
                <p className="text-xs text-slate-500">Total expenses</p>
                <p className="text-lg font-semibold text-red-700">{formatTillKes(report.total_expenses)}</p>
              </div>
              <span className="text-xl text-slate-400">−</span>
              <div className="rounded-lg bg-amber-50 px-4 py-3">
                <p className="text-xs text-slate-500">Closing debtors</p>
                <p className="text-lg font-semibold text-amber-800">{formatTillKes(report.debtors?.closing)}</p>
              </div>
              <span className="text-xl text-slate-400">=</span>
              <div className="rounded-lg bg-emerald-50 px-4 py-3">
                <p className="text-xs text-slate-500">Net position</p>
                <p className="text-lg font-semibold text-emerald-800">{formatTillKes(report.net_position)}</p>
              </div>
            </div>
          </div>
          ) : null}

          <p className="mt-6 text-xs text-slate-500">
            Report generated on {formatAppDateTime(new Date())} by {user?.full_name ?? user?.username ?? "—"}
          </p>
        </>
      )}
    </div>
  );
}
