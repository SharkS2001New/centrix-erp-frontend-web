"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
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
  formatHrKesFull,
  formatPeriodRange,
  isAdminUser,
  isPayrollEligible,
  payPeriodRunnableToday,
  payrollRunCanDelete,
  payrollRunDeleteLockHint,
  payrollRunIsCompleted,
  payrollRunIsProcessed,
  payrollRunAwaitingApproval,
  periodLabel,
  StatutoryDeductionsPanel,
  suggestCurrentPayPeriodForm,
} from "@/components/hr/hr-shared";
import {
  mergeHrPayrollSettings,
  payrollGraceDays,
  payrollRunFormDefaults,
} from "@/lib/hr-settings";

export default function PayrollPage() {
  const router = useRouter();
  const { user, capabilities } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const admin = isAdminUser(user);

  const [tab, setTab] = useState("runs");
  const [runs, setRuns] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [runDrawerOpen, setRunDrawerOpen] = useState(false);
  const [runForm, setRunForm] = useState(EMPTY_PAYROLL_RUN_FORM);
  const [runSaving, setRunSaving] = useState(false);
  const [runPreparing, setRunPreparing] = useState(false);
  const [runError, setRunError] = useState(null);

  const [periodDrawerOpen, setPeriodDrawerOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState(EMPTY_PAY_PERIOD_FORM);
  const [periodSaving, setPeriodSaving] = useState(false);
  const [periodError, setPeriodError] = useState(null);
  const [runSchedule, setRunSchedule] = useState(null);

  const hrSettings = useMemo(
    () => mergeHrPayrollSettings(capabilities?.module_settings),
    [capabilities?.module_settings],
  );

  const graceDays = useMemo(
    () => payrollGraceDays(capabilities?.module_settings, runSchedule),
    [capabilities?.module_settings, runSchedule],
  );

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [runsRes, periodsRes, empRes, deptRes, scheduleRes] = await Promise.all([
        apiRequest("/payroll-runs", { searchParams: { per_page: 200 } }),
        apiRequest("/pay-periods", { searchParams: { per_page: 200 } }),
        apiRequest("/employees", { searchParams: { per_page: 200 } }),
        apiRequest("/departments", { searchParams: { per_page: 200 } }),
        apiRequest("/payroll/run-schedule").catch(() => null),
      ]);
      setRuns(runsRes.data ?? []);
      setPeriods(periodsRes.data ?? []);
      if (scheduleRes) setRunSchedule(scheduleRes);
      setEmployees(empRes.data ?? []);
      setDepartments(deptRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payroll");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const orgPeriods = useMemo(() => {
    if (!organizationId) return periods;
    return periods.filter((p) => Number(p.organization_id) === Number(organizationId));
  }, [periods, organizationId]);

  const periodById = useMemo(() => new Map(orgPeriods.map((p) => [p.id, p])), [orgPeriods]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthRuns = runs.filter((r) => {
      const period = periodById.get(r.pay_period_id);
      const ref = period?.period_start ?? r.run_date;
      const d = new Date(ref);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const monthTotal = monthRuns.reduce((sum, r) => sum + Number(r.total_net ?? 0), 0);
    const pendingApproval = runs.filter((r) => payrollRunAwaitingApproval(r.status)).length;
    const awaitingPayment = runs.filter((r) => payrollRunIsProcessed(r.status)).length;
    const paid = runs.filter((r) => payrollRunIsCompleted(r.status)).length;
    return {
      monthTotal,
      employees: employees.filter(isPayrollEligible).length,
      pendingApproval,
      awaitingPayment,
      paid,
    };
  }, [runs, employees, periodById]);

  const sortedRuns = useMemo(
    () =>
      [...runs].sort(
        (a, b) =>
          new Date(periodById.get(b.pay_period_id)?.period_start ?? b.run_date).getTime() -
          new Date(periodById.get(a.pay_period_id)?.period_start ?? a.run_date).getTime(),
      ),
    [runs, periodById],
  );

  const recentRuns = useMemo(() => sortedRuns.slice(0, 5), [sortedRuns]);

  const sortedPeriods = useMemo(
    () =>
      [...orgPeriods].sort(
        (a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime(),
      ),
    [orgPeriods],
  );

  const runnablePeriods = useMemo(() => {
    const codes = new Set(runSchedule?.runnable_period_codes ?? []);
    if (codes.size > 0) {
      return sortedPeriods.filter((p) => codes.has(p.period_code));
    }
    return sortedPeriods.filter((p) => payPeriodRunnableToday(p, new Date(), graceDays));
  }, [sortedPeriods, runSchedule, graceDays]);

  const ensurePayPeriodForRun = useCallback(async () => {
    if (!organizationId) {
      throw new Error("Your user account has no organization. Contact an administrator.");
    }
    const res = await apiRequest("/pay-periods/ensure-runnable", { method: "POST" });
    const ensured = res.data ?? res.periods ?? [];
    const schedule = res.schedule ?? runSchedule;
    setRunSchedule(schedule);
    setPeriods((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      for (const p of ensured) byId.set(p.id, p);
      return [...byId.values()];
    });
    const effectiveGrace = payrollGraceDays(capabilities?.module_settings, schedule);
    const codes = new Set(schedule?.runnable_period_codes ?? []);
    const runnable =
      codes.size > 0
        ? ensured.filter((p) => codes.has(p.period_code))
        : ensured.filter((p) => payPeriodRunnableToday(p, new Date(), effectiveGrace));
    if (runnable.length === 0) {
      throw new Error(
        schedule?.rules?.join(" ") ||
          `Payroll cannot run today. Use the last day of the month or the first ${effectiveGrace} days of the next month for the prior period.`,
      );
    }
    return runnable;
  }, [capabilities?.module_settings, organizationId, runSchedule]);

  async function openGenerateDrawer() {
    setRunError(null);
    setRunPreparing(true);
    try {
      const available = await ensurePayPeriodForRun();
      setRunForm({
        ...EMPTY_PAYROLL_RUN_FORM,
        ...payrollRunFormDefaults(capabilities?.module_settings),
        pay_period_id: String(available[0]?.id ?? ""),
      });
      setRunDrawerOpen(true);
    } catch (err) {
      setRunError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not prepare pay period",
      );
      setRunForm({
        ...EMPTY_PAYROLL_RUN_FORM,
        ...payrollRunFormDefaults(capabilities?.module_settings),
      });
      setRunDrawerOpen(true);
    } finally {
      setRunPreparing(false);
    }
  }

  function openAddPeriodModal() {
    setPeriodError(null);
    setPeriodForm(suggestCurrentPayPeriodForm());
    setPeriodDrawerOpen(true);
  }

  async function deletePeriod(period) {
    const runsCount = period.payroll_runs_count ?? 0;
    if (runsCount > 0) {
      setError(
        `Cannot delete ${periodLabel(period)}: ${runsCount} payroll run(s) are linked. Delete those runs first.`,
      );
      return;
    }
    if (
      !confirm(
        `Delete pay period ${periodLabel(period)} (${formatPeriodRange(period)})? This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await apiRequest(`/pay-periods/${period.id}`, { method: "DELETE" });
      await loadData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete pay period");
    }
  }

  async function deleteRun(run) {
    if (!payrollRunCanDelete(run)) {
      setError(payrollRunDeleteLockHint(run) ?? "This payroll run can no longer be deleted.");
      return;
    }
    const period = periodById.get(run.pay_period_id) ?? run.pay_period;
    const label = periodLabel(period);
    if (
      !confirm(
        `Delete payroll run for ${label}? Payroll lines are removed and attendance, overtime, leave, and advance deductions for that cycle are reopened (records are kept for reports).`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await apiRequest(`/payroll-runs/${run.id}`, { method: "DELETE" });
      await loadData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  async function generatePayroll(e) {
    e.preventDefault();
    if (!runForm.pay_period_id) {
      setRunError("Please select a pay period.");
      return;
    }
    setRunSaving(true);
    setRunError(null);
    try {
      const created = await apiRequest("/payroll-runs", {
        method: "POST",
        body: {
          pay_period_id: Number(runForm.pay_period_id),
          run_date: runForm.run_date,
          total_gross: 0,
          total_net: 0,
        },
      });
      if (created.status === "pending_approval") {
        setRunDrawerOpen(false);
        setRunForm({
          ...EMPTY_PAYROLL_RUN_FORM,
          ...payrollRunFormDefaults(capabilities?.module_settings),
        });
        router.push(`/hr/payroll/runs/${created.id}`);
        return;
      }
      await apiRequest(`/payroll/runs/${created.id}/process-auto`, {
        method: "POST",
        body: {
          department_id: runForm.department_id ? Number(runForm.department_id) : null,
          include_allowances: runForm.include_allowances,
          include_other_deductions: runForm.include_employee_deductions,
          include_deductions: runForm.include_employee_deductions,
          include_overtime: hrSettings.include_overtime_in_payroll ? runForm.include_overtime : false,
          use_attendance_proration: runForm.use_attendance_proration,
        },
      });
      setRunDrawerOpen(false);
      setRunForm({
        ...EMPTY_PAYROLL_RUN_FORM,
        ...payrollRunFormDefaults(capabilities?.module_settings),
      });
      router.push(`/hr/payroll/runs/${created.id}`);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : "Failed to generate payroll");
    } finally {
      setRunSaving(false);
    }
  }

  async function createPeriod(e) {
    e.preventDefault();
    if (!organizationId) {
      setPeriodError("Your user account has no organization. Contact an administrator.");
      return;
    }
    setPeriodSaving(true);
    setPeriodError(null);
    try {
      await apiRequest("/pay-periods", {
        method: "POST",
        body: buildPayPeriodBody(periodForm, organizationId),
      });
      await loadData();
      setPeriodDrawerOpen(false);
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
      subtitle="Runs, pay periods, and employee payroll lines"
      action={
        tab === "runs" ? (
          <PrimaryButton
            onClick={openGenerateDrawer}
            disabled={runPreparing || runSchedule?.can_run_any_period_today === false}
          >
            {runPreparing ? "Preparing…" : "Run payroll"}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={openAddPeriodModal}>Add period</PrimaryButton>
        )
      }
      banner={
        !loading && tab === "runs" ? (
          <div className="mb-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Current month" value={formatHrKesFull(stats.monthTotal)} />
              <StatCard label="Employees" value={stats.employees.toLocaleString()} />
              <StatCard label="Pending approval" value={stats.pendingApproval.toLocaleString()} />
              <StatCard label="Awaiting payment" value={stats.awaitingPayment.toLocaleString()} />
              <StatCard label="Paid runs" value={stats.paid.toLocaleString()} />
            </div>
            {recentRuns.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-[15px] font-medium text-slate-900">Recent payroll runs</h2>
                <ul className="mt-4 divide-y divide-slate-100">
                  {recentRuns.map((run) => {
                    const period = periodById.get(run.pay_period_id) ?? run.pay_period;
                    const done = payrollRunIsCompleted(run.status);
                    const processed = payrollRunIsProcessed(run.status);
                    return (
                      <li key={run.id}>
                        <button
                          type="button"
                          onClick={() => router.push(`/hr/payroll/runs/${run.id}`)}
                          className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-slate-50"
                        >
                          <div>
                            <p className="font-medium text-slate-900">{periodLabel(period)}</p>
                            <p className="text-sm text-slate-500">{formatHrKesFull(run.total_net)}</p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 text-sm ${
                              done ? "text-[#27500A]" : processed ? "text-[#0C447C]" : "text-slate-500"
                            }`}
                          >
                            {done ? (
                              <>
                                <CheckIcon />
                                Paid
                              </>
                            ) : (
                              <PayrollRunStatusBadge status={run.status} />
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
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
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-[15px] font-medium text-slate-900">Payroll runs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5 text-right">Employees</th>
                  <th className="px-4 py-2.5 text-right">Gross</th>
                  <th className="px-4 py-2.5 text-right">Net</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="w-[70px] px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedRuns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      No payroll runs yet.
                    </td>
                  </tr>
                ) : (
                  sortedRuns.map((run) => {
                    const period = periodById.get(run.pay_period_id) ?? run.pay_period;
                    const count = run.employee_count ?? run.lines_count ?? "—";
                    return (
                      <tr
                        key={run.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {periodLabel(period)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-800">{count}</td>
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
                          <div className="flex items-center gap-1">
                            <IconButton
                              label="View"
                              onClick={() => router.push(`/hr/payroll/runs/${run.id}`)}
                            >
                              <ViewIcon />
                            </IconButton>
                            {admin && payrollRunCanDelete(run) && (
                              <IconButton label="Delete run" onClick={() => deleteRun(run)}>
                                <TrashIcon />
                              </IconButton>
                            )}
                          </div>
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
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-[15px] font-medium text-slate-900">Pay periods</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Delete only when no payroll runs exist for that period. Overtime links are cleared
              automatically.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5">Dates</th>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5 text-right">Payroll runs</th>
                  <th className="px-4 py-2.5">Status</th>
                  {admin ? <th className="w-[70px] px-4 py-2.5">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {sortedPeriods.length === 0 ? (
                  <tr>
                    <td colSpan={admin ? 6 : 5} className="px-4 py-12 text-center text-slate-500">
                      No pay periods yet.
                    </td>
                  </tr>
                ) : (
                  sortedPeriods.map((period) => {
                    const runsCount = Number(period.payroll_runs_count ?? 0);
                    const canDeletePeriod = admin && runsCount === 0;
                    return (
                      <tr
                        key={period.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {periodLabel(period)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatPeriodRange(period)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {period.period_code}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-800">
                          {runsCount > 0 ? runsCount : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
                              period.status === "open"
                                ? "bg-[#EAF3DE] text-[#27500A]"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {period.status}
                          </span>
                        </td>
                        {admin ? (
                          <td className="px-4 py-3">
                            {canDeletePeriod ? (
                              <IconButton
                                label="Delete pay period"
                                onClick={() => deletePeriod(period)}
                              >
                                <TrashIcon />
                              </IconButton>
                            ) : (
                              <span
                                className="text-xs text-slate-400"
                                title="Delete linked payroll runs first"
                              >
                                —
                              </span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FormDrawer
        title="Generate payroll"
        open={runDrawerOpen}
        onClose={() => setRunDrawerOpen(false)}
        onSubmit={generatePayroll}
        saving={runSaving}
        error={runError}
        submitLabel="Generate"
        wide
      >
        <Field label="Pay period">
          {runnablePeriods.length === 0 ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <p>
                No pay period is available to run today. Payroll runs on the last day of the month
                or during the first {graceDays} day{graceDays === 1 ? "" : "s"} of the following month
                (for the previous month only).
              </p>
              {runSchedule?.rules?.map((rule) => (
                <p key={rule} className="text-xs text-amber-800">
                  • {rule}
                </p>
              ))}
            </div>
          ) : (
            <select
              value={runForm.pay_period_id}
              onChange={(e) => setRunForm((p) => ({ ...p, pay_period_id: e.target.value }))}
              required
              className={inputClassName()}
            >
              <option value="" disabled>
                Select period
              </option>
              {runnablePeriods.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {periodLabel(p)} ({formatPeriodRange(p)})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Department">
          <select
            value={runForm.department_id}
            onChange={(e) => setRunForm((p) => ({ ...p, department_id: e.target.value }))}
            className={inputClassName()}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.department_name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={runForm.include_allowances}
            onChange={(e) =>
              setRunForm((p) => ({ ...p, include_allowances: e.target.checked }))
            }
            className="rounded border-slate-300"
          />
          Include allowances (from HR → Allowances, or 10% of basic if none set)
        </label>
        <Field label="Deductions">
          <StatutoryDeductionsPanel />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={runForm.use_attendance_proration}
            onChange={(e) =>
              setRunForm((p) => ({ ...p, use_attendance_proration: e.target.checked }))
            }
            disabled={hrSettings.require_attendance_for_payroll}
            className="rounded border-slate-300"
          />
          Calculate basic pay from attendance, paid leave, and unpaid days off
          {hrSettings.require_attendance_for_payroll ? (
            <span className="text-xs text-slate-500">(required by organization settings)</span>
          ) : null}
        </label>
        {hrSettings.include_overtime_in_payroll ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={runForm.include_overtime}
              onChange={(e) =>
                setRunForm((p) => ({ ...p, include_overtime: e.target.checked }))
              }
              className="rounded border-slate-300"
            />
            Include overtime pay in gross (approved and pending, not yet on a payroll run)
          </label>
        ) : (
          <p className="text-xs text-slate-500">Overtime is excluded — disabled in HR organization settings.</p>
        )}
        {hrSettings.include_other_deductions_in_payroll ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={runForm.include_employee_deductions}
              onChange={(e) =>
                setRunForm((p) => ({ ...p, include_employee_deductions: e.target.checked }))
              }
              className="rounded border-slate-300"
            />
            Include other deductions (SACCO
            {hrSettings.enable_cash_advance_deductions && hrSettings.deduct_cash_advances_on_payroll
              ? ", cash advances"
              : ""}{" "}
            — full amounts, not prorated)
          </label>
        ) : (
          <p className="text-xs text-slate-500">
            Other payroll deductions are excluded — disabled in HR organization settings.
          </p>
        )}
        <p className="text-xs text-slate-500">
          SACCO and similar types must use Apply to all employees or be assigned under Deductions.
          {hrSettings.enable_cash_advance_deductions && hrSettings.deduct_cash_advances_on_payroll
            ? " Cash advances deduct the full balance (e.g. KES 2,500) per repayment rules."
            : ""}{" "}
          Only employees with a work shift are included.
        </p>
      </FormDrawer>

      <FormDrawer
        title="Add pay period"
        open={periodDrawerOpen}
        onClose={() => {
          setPeriodDrawerOpen(false);
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
      </FormDrawer>
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

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
