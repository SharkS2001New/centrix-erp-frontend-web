"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { formatAccountingAmount, defaultAccountingDateRange } from "@/lib/accounting-shared";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";

const GAAP_SUMMARY_LABELS = {
  net_operating: "Net operating cash",
  net_investing: "Net investing cash",
  net_financing: "Net financing cash",
  net_change_in_cash: "Net change in cash",
  beginning_cash: "Beginning cash",
  ending_cash: "Ending cash",
};

export function AccountingCashFlowScreen() {
  const { user } = useAuth();
  const initialRange = useMemo(() => defaultAccountingDateRange(), []);
  const [mode, setMode] = useState("gaap");
  const [rows, setRows] = useState([]);
  const [sections, setSections] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    apiRequest("/branches", { searchParams: { per_page: 100 } })
      .then((res) => setBranches(res.data ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (user?.branch_id && !branchId) setBranchId(String(user.branch_id));
  }, [user?.branch_id, branchId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = { per_page: 100 };
      if (fromDate) searchParams.from_date = fromDate;
      if (toDate) searchParams.to_date = toDate;
      if (branchId) searchParams.branch_id = branchId;
      if (mode === "gaap") searchParams.method = "gaap";

      const res = await apiRequest("/reports/cash-flow", { searchParams });
      setRows(res.data ?? []);
      setSections(res.sections ?? []);
      setSummary(res.summary ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load cash flow report");
      setRows([]);
      setSections([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [mode, fromDate, toDate, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const exportColumns = useMemo(
    () =>
      mode === "gaap"
        ? [
            { key: "section", label: "Section" },
            { key: "line_label", label: "Line" },
            { key: "amount", label: "Amount", align: "right" },
          ]
        : [
            { key: "entry_date", label: "Date" },
            { key: "entry_number", label: "Entry" },
            { key: "account_code", label: "Account code" },
            { key: "account_name", label: "Account" },
            { key: "cash_in", label: "Cash in", align: "right" },
            { key: "cash_out", label: "Cash out", align: "right" },
            { key: "net_cash_change", label: "Net", align: "right" },
          ],
    [mode],
  );

  const exportSearchParams = useMemo(() => {
    const searchParams = {};
    if (fromDate) searchParams.from_date = fromDate;
    if (toDate) searchParams.to_date = toDate;
    if (branchId) searchParams.branch_id = branchId;
    if (mode === "gaap") searchParams.method = "gaap";
    return searchParams;
  }, [branchId, fromDate, mode, toDate]);

  const branchLabel = branches.find((b) => String(b.id) === String(branchId))?.branch_name ?? "";

  return (
    <CatalogPageShell
      title="Cash Flow Statement"
      subtitle="Accounting > Cash Flow"
      action={
        rows.length > 0 ? (
          <ReportExportToolbar
            filename="Cash Flow Statement"
            title="Cash Flow Statement"
            subtitle={mode === "gaap" ? "GAAP (indirect)" : "Cash detail"}
            columns={exportColumns}
            exportSource={{
              path: "/reports/cash-flow",
              searchParams: exportSearchParams,
              estimatedRowCount: rows.length,
            }}
            meta={{
              fromDate,
              toDate,
              branchName: branchLabel,
            }}
            disabled={loading}
          />
        ) : null
      }
      toolbar={
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/accounting" className="text-sm text-[#185FA5] hover:underline">
              ← Accounting
            </Link>
            <div className="inline-flex rounded-lg border border-[var(--theme-border)] p-0.5">
              <button
                type="button"
                onClick={() => setMode("gaap")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  mode === "gaap" ? "bg-[#185FA5] text-white" : "theme-subtext"
                }`}
              >
                GAAP (indirect)
              </button>
              <button
                type="button"
                onClick={() => setMode("direct")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  mode === "direct" ? "bg-[#185FA5] text-white" : "theme-subtext"
                }`}
              >
                Cash detail
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From">
              <input type="date" className={inputClassName()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className={inputClassName()} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </Field>
            <Field label="Branch">
              <select className={inputClassName()} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </Field>
            <PrimaryButton type="button" showIcon={false} onClick={() => void load()}>
              Refresh
            </PrimaryButton>
          </div>
        </div>
      }
    >
      {summary ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key} className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
              <p className="theme-subtext text-xs font-medium uppercase tracking-wide">
                {GAAP_SUMMARY_LABELS[key] ?? key.replace(/_/g, " ")}
              </p>
              <p className="theme-heading mt-1 text-lg font-semibold">{formatAccountingAmount(value)}</p>
            </div>
          ))}
        </div>
      ) : null}

      {mode === "gaap" && sections.length > 0 ? (
        <div className="mb-6 space-y-4">
          {sections.map((section) => (
            <div key={section.key} className="theme-panel overflow-hidden rounded-xl border shadow-sm">
              <div className="border-b border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
                <h2 className="theme-heading text-sm font-semibold">{section.label}</h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[var(--theme-border)]">
                  {section.lines.map((line) => (
                    <tr key={line.label}>
                      <td className="theme-subtext px-4 py-2.5">{line.label}</td>
                      <td className="theme-heading px-4 py-2.5 text-right font-medium">
                        {formatAccountingAmount(line.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--theme-surface-muted)] font-semibold">
                    <td className="theme-heading px-4 py-2.5">Section total</td>
                    <td className="theme-heading px-4 py-2.5 text-right">{formatAccountingAmount(section.subtotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}

      <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
        {loading ? (
          <p className="theme-subtext px-5 py-8 text-center text-sm">Loading report…</p>
        ) : rows.length === 0 ? (
          <p className="theme-subtext px-5 py-8 text-center text-sm">No cash flow data for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="theme-table w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="theme-table-head border-b text-left text-xs font-medium uppercase tracking-wide">
                  {mode === "gaap" ? (
                    <>
                      <th className="px-4 py-2.5">Section</th>
                      <th className="px-4 py-2.5">Line</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Entry</th>
                      <th className="px-4 py-2.5">Account</th>
                      <th className="px-4 py-2.5 text-right">Cash in</th>
                      <th className="px-4 py-2.5 text-right">Cash out</th>
                      <th className="px-4 py-2.5 text-right">Net</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isHeader = row.is_header;
                  const isTotal = row.is_total;
                  const rowClass = isHeader
                    ? "theme-table-section bg-[var(--theme-surface-muted)] font-semibold"
                    : isTotal
                      ? "theme-table-total border-t font-semibold"
                      : "theme-table-row border-b last:border-b-0";

                  if (mode === "gaap") {
                    return (
                      <tr key={idx} className={rowClass}>
                        <td className="px-4 py-2.5">{row.section}</td>
                        <td className="px-4 py-2.5">{row.line_label}</td>
                        <td className="px-4 py-2.5 text-right">
                          {row.amount == null ? "" : formatAccountingAmount(row.amount)}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={idx} className="theme-table-row border-b last:border-b-0">
                      <td className="px-4 py-2.5">{formatShortDate(row.entry_date)}</td>
                      <td className="px-4 py-2.5">{row.entry_number}</td>
                      <td className="px-4 py-2.5">
                        {row.account_code} {row.account_name}
                      </td>
                      <td className="px-4 py-2.5 text-right">{formatAccountingAmount(row.cash_in)}</td>
                      <td className="px-4 py-2.5 text-right">{formatAccountingAmount(row.cash_out)}</td>
                      <td className="px-4 py-2.5 text-right">{formatAccountingAmount(row.net_cash_change)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CatalogPageShell>
  );
}
