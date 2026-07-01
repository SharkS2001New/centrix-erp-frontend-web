"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { isProductionApp } from "@/lib/app-environment";
import { CatalogPageShell, formatShortDate } from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { FISCAL_PERIOD_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { notifyError, notifySuccess } from "@/lib/notify";

export default function FiscalPeriodsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [closeYear, setCloseYear] = useState(new Date().getFullYear() - 1);
  const [closingYear, setClosingYear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/accounting/fiscal-periods", { searchParams: { year } });
      setPeriods(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load fiscal periods");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const showSeedActions = !isProductionApp();

  async function seedYear() {
    try {
      const res = await apiRequest("/accounting/fiscal-periods", {
        method: "POST",
        body: { year },
      });
      setPeriods(res.data ?? []);
      notifySuccess(`Created monthly periods for ${year}.`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to seed fiscal periods");
    }
  }

  async function togglePeriod(period, action) {
    setBusyId(period.id);
    try {
      const updated = await apiRequest(`/accounting/fiscal-periods/${period.id}/${action}`, {
        method: "POST",
      });
      setPeriods((rows) => rows.map((row) => (row.id === period.id ? updated : row)));
      notifySuccess(`Period "${period.period_name}" ${action === "close" ? "closed" : "reopened"}.`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : `Failed to ${action} period`);
    } finally {
      setBusyId(null);
    }
  }

  async function runYearEndClose() {
    setClosingYear(true);
    try {
      const res = await apiRequest("/accounting/year-end-close", {
        method: "POST",
        body: { year: closeYear },
      });
      notifySuccess(
        `Year ${closeYear} closed. Net income: ${Number(res.net_income ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      );
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Year-end close failed");
    } finally {
      setClosingYear(false);
    }
  }

  const openCount = periods.filter((p) => p.status === "open").length;
  const closedCount = periods.filter((p) => p.status === "closed").length;

  return (
    <CatalogPageShell
      title="Fiscal Periods"
      subtitle="Accounting > Period close checklist"
      action={
        <CatalogListExport
          title="Fiscal periods"
          filename="fiscal-periods"
          apiPath="/accounting/fiscal-periods"
          columns={FISCAL_PERIOD_EXPORT_COLUMNS}
          totalCount={periods.length}
          getSearchParams={() => ({ year, per_page: 200 })}
          disabled={loading}
        />
      }
    >
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="theme-panel rounded-xl border p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open periods</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{openCount}</p>
        </div>
        <div className="theme-panel rounded-xl border p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Closed periods</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{closedCount}</p>
        </div>
        <div className="theme-panel rounded-xl border p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Year-end close</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="number"
              value={closeYear}
              onChange={(e) => setCloseYear(Number(e.target.value))}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={runYearEndClose}
              disabled={closingYear}
              className="rounded-lg bg-[#185FA5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#134a84] disabled:opacity-60"
            >
              {closingYear ? "Closing…" : "Close P&L"}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Calendar year</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        {showSeedActions ? (
          <button
            type="button"
            onClick={seedYear}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Seed monthly periods
          </button>
        ) : null}
      </div>

      <div className={`theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm ${loading ? "opacity-60" : ""}`}>
        <table className="min-w-full text-sm">
          <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Start</th>
              <th className="px-4 py-3">End</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {periods.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No periods for {year}.
                  {showSeedActions
                    ? ' Use "Seed monthly periods" to create them in development.'
                    : " Contact your administrator if periods should exist for this year."}
                </td>
              </tr>
            ) : (
              periods.map((period) => (
                <tr key={period.id} className="theme-table-body-row">
                  <td className="px-4 py-3 font-medium text-slate-900">{period.period_name}</td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(period.start_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(period.end_date)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        period.status === "closed"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {period.status === "closed" ? "Closed" : "Open"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {period.status === "open" ? (
                      <button
                        type="button"
                        disabled={busyId === period.id}
                        onClick={() => togglePeriod(period, "close")}
                        className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                      >
                        Close
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === period.id}
                        onClick={() => togglePeriod(period, "reopen")}
                        className="text-sm font-medium text-[#185FA5] hover:underline disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CatalogPageShell>
  );
}
