"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { StatCard, formatShortDate } from "@/components/catalog/catalog-shared";
import {
  EmployeeStatusBadge,
  employeeBankAccounts,
  composeEmployeeDisplayName,
  employeeInitials,
  formatHrKesFull,
  formatPaymentAccountSummary,
  formatShiftExpectedHours,
  formatWorkShiftLabel,
  defaultPayrollAllowances,
  payrollBreakdownRows,
  paymentMethodLabel,
  sumEmployeeYtd,
} from "@/components/hr/hr-shared";
import { EmployeeDocuments } from "@/components/hr/employee-documents";
import { EmployeeEmergencyContactsPanel } from "@/components/hr/employee-emergency-contacts-panel";
import { EmployeeKpisPanel } from "@/components/hr/employee-kpis-panel";
import {
  EntityPhotoDisplay,
  employeePhotoFileUrl,
} from "@/components/media/entity-photo-display";
import { ProtectedPhotoEnlarge } from "@/components/media/protected-file-preview";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";

export function HrEmployeesIdScreen() {
  const params = useParams();
  const employeeId = Number(params.id);

  const [employee, setEmployee] = useState(null);
  const [payrollLines, setPayrollLines] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [salaryPreview, setSalaryPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadData = useCallback(async () => {
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
        const basic = Number(emp.base_salary);
        let allowances = defaultPayrollAllowances(basic, emp);
        try {
          const allowRes = await apiRequest("/employee-allowances", {
            searchParams: { employee_id: employeeId, per_page: 50 },
          });
          const lines = (allowRes.data ?? []).filter((a) => a.is_active !== false);
          if (lines.length > 0) {
            allowances = lines.reduce((s, a) => s + Number(a.amount ?? 0), 0);
          }
        } catch {
          /* use default */
        }
        const gross = basic + allowances;
        const preview = await apiRequest("/payroll/calculate", {
          searchParams: { gross_pay: gross },
        });
        setSalaryPreview({
          ...preview,
          basic_salary: basic,
          allowances,
          gross_pay: gross,
        });
      } else {
        setSalaryPreview(null);
      }
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load employee");
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

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Employees", href: "/hr/employees" },
          {
            label: employee ? composeEmployeeDisplayName(employee) : "Employee",
          },
        ]}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading employee…</p>
      ) : employee ? (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {employee.photo_path || employee.photo_url ? (
                <ProtectedPhotoEnlarge
                  filePath={employeePhotoFileUrl(employee.id)}
                  alt={composeEmployeeDisplayName(employee)}
                  className="rounded-full"
                >
                  <div className="h-14 w-14 overflow-hidden rounded-full border border-slate-200 bg-slate-50 ring-offset-2 transition hover:ring-2 hover:ring-[#185FA5]/30">
                    <EntityPhotoDisplay
                      fileUrl={employeePhotoFileUrl(employee.id)}
                      imageUrl={employee.photo_url ?? employee.photo_path}
                      alt={composeEmployeeDisplayName(employee)}
                      className="h-14 w-14 object-cover"
                      placeholderClassName="flex h-full w-full items-center justify-center text-lg font-semibold text-[#3C3489]"
                    />
                  </div>
                </ProtectedPhotoEnlarge>
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EEEDFE] text-lg font-semibold text-[#3C3489]">
                  {employeeInitials(composeEmployeeDisplayName(employee))}
                </div>
              )}
              <div>
                <h1 className="text-xl font-medium text-slate-900">
                  {composeEmployeeDisplayName(employee)}
                </h1>
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

          {employee.employment_status !== "active" || employee.is_active === false ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              This employee is <strong>{employee.employment_status ?? "inactive"}</strong>
              {employee.user ? (
                <>
                  {" "}
                  — linked user <strong>{employee.user.username}</strong> cannot log in while the employee record is not active.
                </>
              ) : (
                " — no linked system user."
              )}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="theme-panel rounded-xl border p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Employment</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow label="Department" value={employee.department?.department_name ?? "—"} />
                <DetailRow
                  label="Position"
                  value={employee.position?.position_title ?? "—"}
                />
                <DetailRow
                  label="Work shift"
                  value={
                    employee.shift ? (
                      <span className="block text-right">
                        <span className="block font-medium text-slate-800">
                          {formatWorkShiftLabel(employee.shift)}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal text-slate-500">
                          {formatShiftExpectedHours(employee.shift)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-amber-700">Not assigned</span>
                    )
                  }
                />
                <DetailRow label="Branch" value={employee.branch?.branch_name ?? "—"} />
                <DetailRow label="Job title" value={employee.job_title || "—"} />
                <DetailRow label="Type" value={employee.employment_type ?? "—"} />
                <DetailRow
                  label="Manager"
                  value={
                    employee.reports_to
                      ? composeEmployeeDisplayName(employee.reports_to)
                      : "—"
                  }
                />
                <DetailRow label="Hired" value={formatShortDate(employee.hire_date)} />
                <DetailRow label="Basic salary" value={formatHrKesFull(employee.base_salary)} />
                <DetailRow
                  label="Allowances"
                  value={
                    <Link href="/hr/allowances" className="text-[#185FA5] hover:underline">
                      View on Allowances →
                    </Link>
                  }
                />
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

            <div className="theme-panel rounded-xl border p-5 shadow-sm">
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
              <div className="theme-panel rounded-xl border p-5 shadow-sm lg:col-span-2">
                <h2 className="text-[15px] font-medium text-slate-900">
                  Estimated monthly net (Kenya {salaryPreview.effective_label})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Preview uses basic salary plus default 10% allowances (same as payroll generate).
                  Statutory numbers on processed runs may differ if allowances are turned off.
                </p>
                <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {payrollBreakdownRows(salaryPreview, employee).map((row) => (
                    <div
                      key={row.label}
                      className={`flex justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                        row.muted ? "bg-slate-50/80 text-slate-500" : "bg-slate-50"
                      }`}
                    >
                      <span className="text-slate-500">{row.label}</span>
                      <span className="font-medium">{formatHrKesFull(row.value)}</span>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="theme-panel rounded-xl border p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Payment methods</h2>
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
              </dl>
            </div>

            <EmployeeEmergencyContactsPanel
              employeeId={employeeId}
              employee={employee}
              onUpdated={setEmployee}
            />

            <EmployeeDocuments employeeId={employee.id} />

            <EmployeeKpisPanel employeeId={employee.id} />

            <div className="theme-panel rounded-xl border p-5 shadow-sm lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-medium text-slate-900">Payroll history</h2>
                <Link
                  href="/hr/payroll"
                  className="text-sm font-medium text-[#185FA5] hover:text-[#144f8a]"
                >
                  Open payroll →
                </Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatCard label="YTD net paid" value={formatHrKesFull(ytdEarnings)} />
                <StatCard
                  label="Last run"
                  value={
                    lastPayroll
                      ? formatShortDate(lastPayroll.run_date)
                      : "—"
                  }
                />
                <StatCard label="Pay lines" value={String(payrollLines.length)} />
              </div>
              {lastPayroll && (
                <p className="mt-3 text-sm text-slate-600">
                  <Link
                    href={`/hr/payroll/runs/${lastPayroll.id}`}
                    className="font-medium text-[#185FA5] hover:text-[#144f8a]"
                  >
                    View last payroll run
                  </Link>
                </p>
              )}
              {payrollLines.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                        <th className="py-2 pr-4">Run</th>
                        <th className="py-2 pr-4 text-right">Gross</th>
                        <th className="py-2 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...payrollLines]
                        .sort((a, b) => b.id - a.id)
                        .slice(0, 6)
                        .map((line) => {
                          const run = payrollRuns.find((r) => r.id === line.payroll_run_id);
                          return (
                            <tr key={line.id} className="border-b border-slate-100">
                              <td className="py-2 pr-4 text-slate-800">
                                {run ? (
                                  <Link
                                    href={`/hr/payroll/runs/${run.id}`}
                                    className="text-[#185FA5] hover:text-[#144f8a]"
                                  >
                                    {formatShortDate(run.run_date)}
                                  </Link>
                                ) : (
                                  `Run #${line.payroll_run_id}`
                                )}
                              </td>
                              <td className="py-2 pr-4 text-right">
                                {formatHrKesFull(line.gross_pay)}
                              </td>
                              <td className="py-2 text-right font-medium">
                                {formatHrKesFull(line.net_pay)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
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
