"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { StatCard, formatShortDate } from "@/components/catalog/catalog-shared";
import {
  EmployeeStatusBadge,
  employeeBankAccounts,
  employeeInitials,
  formatHrKesFull,
  formatPaymentAccountSummary,
  kenyaStatutoryRows,
  paymentMethodLabel,
  sumEmployeeYtd,
} from "@/components/hr/hr-shared";

export default function EmployeeProfilePage() {
  const params = useParams();
  const employeeId = Number(params.id);

  const [employee, setEmployee] = useState(null);
  const [payrollLines, setPayrollLines] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [salaryPreview, setSalaryPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [emp, linesRes, runsRes] = await Promise.all([
        apiRequest(`/employees/${employeeId}`),
        apiRequest(`/employees/${employeeId}/payroll-lines`, { searchParams: { per_page: 200 } }),
        apiRequest("/payroll-runs", { searchParams: { per_page: 200 } }),
      ]);
      setEmployee(emp);
      setPayrollLines(linesRes.data ?? []);
      setPayrollRuns(runsRes.data ?? []);

      if (Number(emp.base_salary) > 0) {
        const preview = await apiRequest("/payroll/calculate", {
          searchParams: { gross_pay: emp.base_salary },
        });
        setSalaryPreview(preview);
      } else {
        setSalaryPreview(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const ytdEarnings = useMemo(
    () => sumEmployeeYtd(payrollLines, employeeId),
    [payrollLines, employeeId],
  );

  const lastPayroll = useMemo(() => {
    if (payrollLines.length === 0) return null;
    const runIds = new Set(payrollLines.map((l) => l.payroll_run_id));
    const runs = payrollRuns
      .filter((r) => runIds.has(r.id))
      .sort((a, b) => new Date(b.run_date).getTime() - new Date(a.run_date).getTime());
    return runs[0] ?? null;
  }, [payrollLines, payrollRuns]);

  const bankAccounts = employee ? employeeBankAccounts(employee) : [];
  const primaryBank = bankAccounts.find((b) => b.is_primary) ?? bankAccounts[0];
  const primaryEmergency =
    employee?.emergency_contacts?.find((c) => c.is_primary) ?? employee?.emergency_contacts?.[0];

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-6">
        <Link href="/hr/employees" className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back to employees
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading employee…</p>
      ) : employee ? (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EEEDFE] text-lg font-semibold text-[#3C3489]">
                {employeeInitials(employee.full_name)}
              </div>
              <div>
                <h1 className="text-xl font-medium text-slate-900">{employee.full_name}</h1>
                <p className="font-mono text-sm text-slate-500">
                  {employee.employee_code}
                  {employee.payroll_number && employee.payroll_number !== employee.employee_code
                    ? ` · Payroll ${employee.payroll_number}`
                    : ""}
                </p>
              </div>
            </div>
            <Link
              href={`/hr/employees/${employee.id}/edit`}
              className="inline-flex rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
            >
              Edit employee
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Employment</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow label="Department" value={employee.department?.department_name ?? "—"} />
                <DetailRow label="Branch" value={employee.branch?.branch_name ?? "—"} />
                <DetailRow label="Job title" value={employee.job_title || "—"} />
                <DetailRow label="Type" value={employee.employment_type ?? "—"} />
                <DetailRow
                  label="Manager"
                  value={employee.reports_to?.full_name ?? "—"}
                />
                <DetailRow label="Hired" value={formatShortDate(employee.hire_date)} />
                <DetailRow label="Basic salary" value={formatHrKesFull(employee.base_salary)} />
                <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                  <dt className="text-slate-500">Status</dt>
                  <dd>
                    <EmployeeStatusBadge
                      status={employee.employment_status}
                      active={employee.is_active}
                    />
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Kenya tax & IDs</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow label="KRA PIN" value={employee.kra_pin || "—"} mono />
                <DetailRow label="National ID" value={employee.national_id || "—"} mono />
                <DetailRow label="NSSF no." value={employee.nssf_number || "—"} />
                <DetailRow label="SHA / SHIF no." value={employee.sha_number || "—"} />
                <DetailRow label="Phone" value={employee.phone || "—"} />
                <DetailRow label="Email" value={employee.email || "—"} />
                <DetailRow
                  label="Linked user"
                  value={employee.user?.full_name ?? employee.user?.username ?? "—"}
                />
              </dl>
            </div>

            {salaryPreview && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h2 className="text-[15px] font-medium text-slate-900">
                  Estimated monthly net (Kenya {salaryPreview.effective_label})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Based on basic salary; actual payroll may include other deductions.
                </p>
                <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {kenyaStatutoryRows(salaryPreview)
                    .filter((r) => !r.muted)
                    .map((row) => (
                      <div
                        key={row.label}
                        className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="text-slate-500">{row.label}</span>
                        <span className="font-medium">{formatHrKesFull(row.value)}</span>
                      </div>
                    ))}
                </dl>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Payment & contacts</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow
                  label="Primary payment"
                  value={primaryBank ? formatPaymentAccountSummary(primaryBank) : "—"}
                />
                {primaryBank?.payment_method ? (
                  <DetailRow
                    label="Method"
                    value={paymentMethodLabel(primaryBank.payment_method)}
                  />
                ) : null}
                {bankAccounts.length > 1 ? (
                  <div className="border-t border-slate-100 pt-3">
                    <dt className="mb-2 text-slate-500">All payment methods</dt>
                    <dd className="space-y-1.5">
                      {bankAccounts.map((b) => (
                        <p key={b.id} className="text-sm text-slate-800">
                          {b.is_primary ? "★ " : ""}
                          {formatPaymentAccountSummary(b)}
                        </p>
                      ))}
                    </dd>
                  </div>
                ) : null}
                <DetailRow
                  label="Emergency"
                  value={
                    primaryEmergency
                      ? `${primaryEmergency.full_name} (${primaryEmergency.phone})`
                      : "—"
                  }
                />
                <DetailRow
                  label="Next of kin"
                  value={
                    employee.next_of_kin?.full_name
                      ? `${employee.next_of_kin.full_name} (${employee.next_of_kin.phone})`
                      : "—"
                  }
                />
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Payroll history</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatCard label="YTD net paid" value={formatHrKesFull(ytdEarnings)} />
                <StatCard
                  label="Last run"
                  value={lastPayroll ? formatShortDate(lastPayroll.run_date) : "—"}
                />
                <StatCard label="Pay lines" value={String(payrollLines.length)} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right font-medium text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
