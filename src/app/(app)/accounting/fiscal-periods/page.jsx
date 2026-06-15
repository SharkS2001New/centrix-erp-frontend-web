"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { CatalogPageShell, formatShortDate } from "@/components/catalog/catalog-shared";

export default function FiscalPeriodsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [closeYear, setCloseYear] = useState(new Date().getFullYear() - 1);
  const [closingYear, setClosingYear] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest("/accounting/fiscal-periods", { searchParams: { year } });
      setPeriods(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load fiscal periods");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  async function seedYear() {
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest("/accounting/fiscal-periods", {
        method: "POST",
        body: { year },
      });
      setPeriods(res.data ?? []);
      setMessage(`Created monthly periods for ${year}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to seed fiscal periods");
    }
  }

  async function togglePeriod(period, action) {
    setBusyId(period.id);
    setMessage(null);
    setError(null);
    try {
      const updated = await apiRequest(`/accounting/fiscal-periods/${period.id}/${action}`, {
        method: "POST",
      });
      setPeriods((rows) => rows.map((row) => (row.id === period.id ? updated : row)));
      setMessage(`Period "${period.period_name}" ${action === "close" ? "closed" : "reopened"}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Failed to ${action} period`);
    } finally {
      setBusyId(null);
    }
  }

  async function runYearEndClose() {
    setClosingYear(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest("/accounting/year-end-close", {
        method: "POST",
        body: { year: closeYear },
      });
      setMessage(
        `Year ${closeYear} closed. Net income: ${Number(res.net_income ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Year-end close failed");
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
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open periods</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{openCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Closed periods</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{closedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
        <button
          type="button"
          onClick={seedYear}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Seed monthly periods
        </button>
      </div>

      <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm ${loading ? "opacity-60" : ""}`}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
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
                  No periods for {year}. Use &quot;Seed monthly periods&quot; to create them.
                </td>
              </tr>
            ) : (
              periods.map((period) => (
                <tr key={period.id} className="hover:bg-slate-50/80">
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
