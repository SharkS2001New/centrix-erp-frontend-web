"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { IconButton, StatCard } from "@/components/catalog/catalog-shared";
import {
  PayrollRunStatusBadge,
  formatHrKesFull,
  kenyaStatutoryRows,
  periodLabel,
} from "@/components/hr/hr-shared";

export default function PayrollRunDetailPage() {
  const params = useParams();
  const runId = Number(params.id);

  const [run, setRun] = useState(null);
  const [period, setPeriod] = useState(null);
  const [lines, setLines] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [lineModal, setLineModal] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [runData, linesRes, empRes] = await Promise.all([
        apiRequest(`/payroll-runs/${runId}`),
        apiRequest("/payroll-lines", { searchParams: { per_page: 500 } }),
        apiRequest("/employees", { searchParams: { per_page: 200 } }),
      ]);
      setRun(runData);
      setLines((linesRes.data ?? []).filter((l) => l.payroll_run_id === runId));
      setEmployees(empRes.data ?? []);
      if (runData.pay_period_id) {
        try {
          const p = await apiRequest(`/pay-periods/${runData.pay_period_id}`);
          setPeriod(p);
        } catch {
          setPeriod(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payroll run");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const totalStatutory = useMemo(
    () =>
      lines.reduce(
        (sum, l) =>
          sum + Number(l.nssf ?? 0) + Number(l.shif ?? 0) + Number(l.housing_levy ?? 0) + Number(l.paye ?? 0),
        0,
      ),
    [lines],
  );

  async function processAutoKenya() {
    if (!window.confirm("Process payroll for all active employees using Kenya statutory auto-calc?")) {
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      await apiRequest(`/payroll/runs/${runId}/process-auto`, { method: "POST", body: {} });
      await loadData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Processing failed");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link href="/hr/payroll" className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back to payroll
        </Link>
        {run?.status === "draft" && (
          <button
            type="button"
            onClick={processAutoKenya}
            disabled={processing}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
          >
            {processing ? "Processing…" : "Process (Kenya auto-calc)"}
          </button>
        )}
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
          <div className="mb-6">
            <h1 className="text-xl font-medium text-slate-900">
              Payroll run — {periodLabel(period)}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Kenya 2026: PAYE · NSSF · SHIF 2.75% · Housing Levy 1.5%
            </p>
            <div className="mt-2">
              <PayrollRunStatusBadge status={run.status} />
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Employees" value={String(lines.length)} />
            <StatCard label="Gross salary" value={formatHrKesFull(run.total_gross)} />
            <StatCard label="Net salary" value={formatHrKesFull(run.total_net)} />
            <StatCard label="Statutory deductions" value={formatHrKesFull(totalStatutory)} />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-medium text-slate-900">Employee payroll lines</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5 text-right">Gross</th>
                    <th className="px-4 py-2.5 text-right">NSSF</th>
                    <th className="px-4 py-2.5 text-right">SHIF</th>
                    <th className="px-4 py-2.5 text-right">AHL</th>
                    <th className="px-4 py-2.5 text-right">PAYE</th>
                    <th className="px-4 py-2.5 text-right">Net</th>
                    <th className="w-[70px] px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No lines yet. Use &quot;Process (Kenya auto-calc)&quot; for draft runs.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => {
                      const emp = empById.get(line.employee_id);
                      return (
                        <tr
                          key={line.id}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {emp?.full_name ?? `#${line.employee_id}`}
                          </td>
                          <td className="px-4 py-3 text-right">{formatHrKesFull(line.gross_pay)}</td>
                          <td className="px-4 py-3 text-right">{formatHrKesFull(line.nssf)}</td>
                          <td className="px-4 py-3 text-right">{formatHrKesFull(line.shif)}</td>
                          <td className="px-4 py-3 text-right">
                            {formatHrKesFull(line.housing_levy)}
                          </td>
                          <td className="px-4 py-3 text-right">{formatHrKesFull(line.paye)}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatHrKesFull(line.net_pay)}
                          </td>
                          <td className="px-4 py-3">
                            <IconButton label="Breakdown" onClick={() => setLineModal(line)}>
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

          {lineModal && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/30"
                aria-label="Close"
                onClick={() => setLineModal(null)}
              />
              <div className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                <h3 className="text-[15px] font-medium text-slate-900">Kenya statutory breakdown</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {empById.get(lineModal.employee_id)?.full_name ?? "Employee"}
                </p>
                <dl className="mt-4 space-y-2.5 text-sm">
                  {kenyaStatutoryRows(lineModal).map((row) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between gap-4 ${row.muted ? "text-slate-500" : ""}`}
                    >
                      <dt>{row.label}</dt>
                      <dd
                        className={
                          row.emphasis ? "font-semibold text-slate-900" : "font-medium text-slate-800"
                        }
                      >
                        {formatHrKesFull(row.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  onClick={() => setLineModal(null)}
                  className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </>
          )}
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
