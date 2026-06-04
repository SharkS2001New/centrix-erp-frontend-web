"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  FormModal,
  IconButton,
  PrimaryButton,
  StatCard,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  EMPTY_PAY_PERIOD_FORM,
  EMPTY_PAYROLL_RUN_FORM,
  PayrollRunStatusBadge,
  buildPayPeriodBody,
  formatHrKes,
  formatPeriodRange,
  periodLabel,
} from "@/components/hr/hr-shared";

export default function PayrollPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [tab, setTab] = useState("runs");
  const [runs, setRuns] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [runDrawerOpen, setRunDrawerOpen] = useState(false);
  const [runForm, setRunForm] = useState(EMPTY_PAYROLL_RUN_FORM);
  const [runSaving, setRunSaving] = useState(false);
  const [runError, setRunError] = useState(null);

  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState(EMPTY_PAY_PERIOD_FORM);
  const [periodSaving, setPeriodSaving] = useState(false);
  const [periodError, setPeriodError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [runsRes, periodsRes, empRes] = await Promise.all([
        apiRequest("/payroll-runs", { searchParams: { per_page: 200 } }),
        apiRequest("/pay-periods", { searchParams: { per_page: 200 } }),
        apiRequest("/employees", { searchParams: { per_page: 200 } }),
      ]);
      setRuns(runsRes.data ?? []);
      setPeriods(periodsRes.data ?? []);
      setEmployees(empRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payroll");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const periodById = useMemo(() => new Map(periods.map((p) => [p.id, p])), [periods]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthRuns = runs.filter((r) => {
      const d = new Date(r.run_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const monthTotal = monthRuns.reduce((sum, r) => sum + Number(r.total_net ?? 0), 0);
    const pending = runs.filter((r) => r.status === "draft").length;
    const processed = runs.filter((r) => r.status === "processed" || r.status === "paid").length;
    return {
      monthTotal,
      employees: employees.filter((e) => e.is_active !== false).length,
      pending,
      processed,
    };
  }, [runs, employees]);

  const sortedRuns = useMemo(
    () =>
      [...runs].sort(
        (a, b) => new Date(b.run_date).getTime() - new Date(a.run_date).getTime(),
      ),
    [runs],
  );

  const sortedPeriods = useMemo(
    () =>
      [...periods].sort(
        (a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime(),
      ),
    [periods],
  );

  async function createRun(e) {
    e.preventDefault();
    if (!runForm.pay_period_id) {
      setRunError("Please select a pay period.");
      return;
    }
    setRunSaving(true);
    setRunError(null);
    try {
      await apiRequest("/payroll-runs", {
        method: "POST",
        body: {
          pay_period_id: Number(runForm.pay_period_id),
          run_date: runForm.run_date,
          status: "draft",
          total_gross: 0,
          total_net: 0,
        },
      });
      await loadData();
      setRunDrawerOpen(false);
      setRunForm(EMPTY_PAYROLL_RUN_FORM);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : "Failed to create payroll run");
    } finally {
      setRunSaving(false);
    }
  }

  async function createPeriod(e) {
    e.preventDefault();
    if (!user?.organization_id) return;
    setPeriodSaving(true);
    setPeriodError(null);
    try {
      await apiRequest("/pay-periods", {
        method: "POST",
        body: buildPayPeriodBody(periodForm, user.organization_id),
      });
      await loadData();
      setPeriodModalOpen(false);
      setPeriodForm(EMPTY_PAY_PERIOD_FORM);
    } catch (err) {
      setPeriodError(err instanceof ApiError ? err.message : "Failed to create pay period");
    } finally {
      setPeriodSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Payroll"
      subtitle="Payroll runs, pay periods, and employee lines"
      action={
        tab === "runs" ? (
          <PrimaryButton
            onClick={() => {
              setRunError(null);
              setRunForm({
                ...EMPTY_PAYROLL_RUN_FORM,
                pay_period_id: String(sortedPeriods[0]?.id ?? ""),
              });
              setRunDrawerOpen(true);
            }}
          >
            Run payroll
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => {
              setPeriodError(null);
              setPeriodForm(EMPTY_PAY_PERIOD_FORM);
              setPeriodModalOpen(true);
            }}
          >
            Add period
          </PrimaryButton>
        )
      }
      banner={
        !loading && tab === "runs" ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Current month (net)" value={formatHrKes(stats.monthTotal)} />
            <StatCard label="Employees" value={stats.employees.toLocaleString()} />
            <StatCard label="Pending approval" value={stats.pending.toLocaleString()} />
            <StatCard label="Processed runs" value={stats.processed.toLocaleString()} />
          </div>
        ) : null
      }
    >
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("runs")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "runs" ? "bg-[#185FA5] text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Payroll runs
        </button>
        <button
          type="button"
          onClick={() => setTab("periods")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "periods" ? "bg-[#185FA5] text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Pay periods
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading payroll…</p>
      ) : tab === "runs" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5 text-right">Gross</th>
                  <th className="px-4 py-2.5 text-right">Net</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="w-[70px] px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRuns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      No payroll runs yet.
                    </td>
                  </tr>
                ) : (
                  sortedRuns.map((run) => {
                    const period = periodById.get(run.pay_period_id);
                    return (
                      <tr
                        key={run.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {periodLabel(period)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-800">
                          {formatHrKes(run.total_gross)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {formatHrKes(run.total_net)}
                        </td>
                        <td className="px-4 py-3">
                          <PayrollRunStatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-3">
                          <IconButton
                            label="View"
                            onClick={() => router.push(`/hr/payroll/runs/${run.id}`)}
                          >
                            <ViewIcon />
                          </IconButton>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {sortedPeriods.length === 0 ? (
              <li className="px-4 py-12 text-center text-sm text-slate-500">No pay periods yet.</li>
            ) : (
              sortedPeriods.map((period) => (
                <li
                  key={period.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">{periodLabel(period)}</p>
                    <p className="text-sm text-slate-500">{formatPeriodRange(period)}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
                      period.status === "open"
                        ? "bg-[#EAF3DE] text-[#27500A]"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {period.status}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      <FormDrawer
        title="Generate payroll"
        open={runDrawerOpen}
        onClose={() => setRunDrawerOpen(false)}
        onSubmit={createRun}
        saving={runSaving}
        error={runError}
        submitLabel="Generate"
      >
        <Field label="Pay period">
          <select
            value={runForm.pay_period_id}
            onChange={(e) => setRunForm((p) => ({ ...p, pay_period_id: e.target.value }))}
            required
            className={inputClassName()}
          >
            <option value="" disabled>
              Select period
            </option>
            {sortedPeriods.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {periodLabel(p)} ({formatPeriodRange(p)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Run date">
          <input
            type="date"
            value={runForm.run_date}
            onChange={(e) => setRunForm((p) => ({ ...p, run_date: e.target.value }))}
            required
            className={inputClassName()}
          />
        </Field>
        <p className="text-xs text-slate-400">
          After creating the run, open it to add or process employee payroll lines.
        </p>
      </FormDrawer>

      <FormModal
        title="Add pay period"
        open={periodModalOpen}
        onClose={() => {
          setPeriodModalOpen(false);
          setPeriodError(null);
        }}
        onSubmit={createPeriod}
        saving={periodSaving}
        error={periodError}
        submitLabel="Create period"
      >
        <Field label="Period code">
          <input
            type="text"
            value={periodForm.period_code}
            onChange={(e) => setPeriodForm((p) => ({ ...p, period_code: e.target.value }))}
            required
            className={inputClassName()}
            placeholder="2026-06"
          />
        </Field>
        <Field label="Start date">
          <input
            type="date"
            value={periodForm.period_start}
            onChange={(e) => setPeriodForm((p) => ({ ...p, period_start: e.target.value }))}
            required
            className={inputClassName()}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={periodForm.period_end}
            onChange={(e) => setPeriodForm((p) => ({ ...p, period_end: e.target.value }))}
            required
            className={inputClassName()}
          />
        </Field>
      </FormModal>
    </CatalogPageShell>
  );
}

function ViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
