"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { DetailDrawer, IconButton, StatCard } from "@/components/catalog/catalog-shared";
import {
  PayrollBreakdownPanel,
  PayrollRunStatusBadge,
  composeEmployeeDisplayName,
  formatHrKesFull,
  isAdminUser,
  payrollRunCanDelete,
  payrollRunDeleteLockHint,
  periodLabel,
} from "@/components/hr/hr-shared";

export default function PayrollRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const admin = isAdminUser(user);
  const runId = Number(params.id);

  const [run, setRun] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLine, setSelectedLine] = useState(null);
  const [lineDetail, setLineDetail] = useState(null);
  const [lineLoading, setLineLoading] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [runData, linesRes] = await Promise.all([
        apiRequest(`/payroll-runs/${runId}`),
        apiRequest("/payroll-lines", {
          searchParams: { per_page: 500, "filter[payroll_run_id]": runId },
        }),
      ]);
      setRun(runData);
      setLines(linesRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payroll run");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const period = run?.pay_period ?? run?.payPeriod ?? null;

  const totalDeductions = useMemo(() => {
    if (run?.total_gross != null && run?.total_net != null) {
      return Number(run.total_gross) - Number(run.total_net);
    }
    return lines.reduce((sum, l) => sum + Number(l.deductions ?? 0), 0);
  }, [run, lines]);

  const employeeCount = run?.employee_count ?? lines.length;

  async function openLineDetail(line) {
    setSelectedLine(line);
    setLineDetail(null);
    setLineLoading(true);
    try {
      const detail = await apiRequest(`/payroll-lines/${line.id}`);
      setLineDetail(detail);
    } catch {
      setLineDetail(line);
    } finally {
      setLineLoading(false);
    }
  }

  function closeLineDetail() {
    setSelectedLine(null);
    setLineDetail(null);
  }

  async function deleteRun() {
    if (!payrollRunCanDelete(run)) {
      setError(payrollRunDeleteLockHint(run) ?? "This payroll run can no longer be deleted.");
      return;
    }
    if (
      !confirm(
        "Delete this payroll run? Lines are removed and closed attendance, overtime, leave, and advance deductions for that cycle are reopened. Historical records stay for reports.",
      )
    ) {
      return;
    }
    setError(null);
    try {
      await apiRequest(`/payroll-runs/${runId}`, { method: "DELETE" });
      router.push("/hr/payroll");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  const breakdownLine = lineDetail ?? selectedLine;
  const breakdownEmployee = breakdownLine?.employee;
  const employeeName =
    composeEmployeeDisplayName(breakdownEmployee) ||
    breakdownEmployee?.full_name ||
    (selectedLine ? composeEmployeeDisplayName(selectedLine) : null) ||
    "Employee";

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-6">
        <Link href="/hr/payroll" className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back to payroll
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading payroll run…</p>
      ) : run ? (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-medium text-slate-900">
                Payroll run — {periodLabel(period)}
              </h1>
              <div className="mt-2">
                <PayrollRunStatusBadge status={run.status} />
              </div>
            </div>
            {admin && payrollRunCanDelete(run) ? (
              <button
                type="button"
                onClick={deleteRun}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete run
              </button>
            ) : admin ? (
              <p className="max-w-xs text-right text-xs text-slate-500">
                {payrollRunDeleteLockHint(run)}
              </p>
            ) : null}
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Employees" value={String(employeeCount)} />
            <StatCard label="Gross salary" value={formatHrKesFull(run.total_gross)} />
            <StatCard label="Net salary" value={formatHrKesFull(run.total_net)} />
            <StatCard label="Deductions" value={formatHrKesFull(totalDeductions)} />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-medium text-slate-900">Employee payroll lines</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Click a row or the view action to open the breakdown in the side panel.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5 text-right">Gross</th>
                    <th className="px-4 py-2.5 text-right">Deductions</th>
                    <th className="px-4 py-2.5 text-right">Net salary</th>
                    <th className="w-[70px] px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                        No payroll lines for this run.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => {
                      const emp = line.employee;
                      const name =
                        composeEmployeeDisplayName(emp) ||
                        emp?.full_name ||
                        `#${line.employee_id}`;
                      const isSelected = selectedLine?.id === line.id;
                      return (
                        <tr
                          key={line.id}
                          onClick={() => openLineDetail(line)}
                          className={`cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50 ${
                            isSelected ? "bg-[#E6F1FB]/40" : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">{name}</td>
                          <td className="px-4 py-3 text-right">{formatHrKesFull(line.gross_pay)}</td>
                          <td className="px-4 py-3 text-right">
                            {formatHrKesFull(line.deductions)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatHrKesFull(line.net_pay)}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <IconButton label="Breakdown" onClick={() => openLineDetail(line)}>
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

          <DetailDrawer
            title="Payroll breakdown"
            subtitle={employeeName}
            open={!!selectedLine}
            onClose={closeLineDetail}
            wide
          >
            <PayrollBreakdownPanel
              line={breakdownLine}
              employee={breakdownEmployee}
              loading={lineLoading}
            />
          </DetailDrawer>
        </>
      ) : null}
    </div>
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
