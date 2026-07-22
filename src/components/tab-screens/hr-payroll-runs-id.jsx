"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { canApprovePayrollRuns } from "@/lib/approval-permissions";
import { P } from "@/lib/permission-codes";
import { Field, DetailDrawer, IconButton, PrimaryButton, StatCard, inputClassName } from "@/components/catalog/catalog-shared";
import {
  PayrollBreakdownPanel,
  PayrollRunStatusBadge,
  PayrollWorkflowSteps,
  composeEmployeeDisplayName,
  formatHrKesFull,
  isAdminUser,
  payrollRunCanDelete,
  payrollRunDeleteLockHint,
  periodLabel,
} from "@/components/hr/hr-shared";
import { mergeHrPayrollSettings } from "@/lib/hr-settings";
import {
  printPayrollReceipt,
  printPayrollReceipts,
} from "@/components/hr/payroll-receipt-print";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { ApprovalPendingNotice } from "@/components/approval-reminder-button";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";

export function HrPayrollRunsIdScreen() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const { user, hasPermission, capabilities, organization, generalSettings } = useAuth();
  const admin = isAdminUser(user);
  const canApprove = canApprovePayrollRuns({ hasPermission, capabilities });
  const canProcess = hasPermission(P.hr.payroll.create) || hasPermission(P.hr.manage);
  const runId = Number(params.id);

  const hrSettings = useMemo(
    () => mergeHrPayrollSettings(capabilities?.module_settings),
    [capabilities?.module_settings],
  );
  const requireApproval = Boolean(hrSettings.require_payroll_approval);

  const [run, setRun] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLine, setSelectedLine] = useState(null);
  const [lineDetail, setLineDetail] = useState(null);
  const [lineLoading, setLineLoading] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [markPaidSaving, setMarkPaidSaving] = useState(false);

  const loadData = useCallback(async () => {
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
      notifyError(e instanceof Error ? e.message : "Failed to load payroll run");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useTabAwareDataLoad(loadData);

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

  async function approveRun() {
    try {
      await apiRequest(`/payroll/runs/${runId}/approve`, { method: "POST" });
      await loadData();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Approve failed");
    }
  }

  async function rejectRun() {
    const ok = await confirm({
      title: "Reject payroll run",
      message: "Reject this payroll run? It will return to draft so you can revise and resubmit.",
      confirmLabel: "Reject",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/payroll/runs/${runId}/reject`, { method: "POST" });
      await loadData();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Reject failed");
    }
  }

  async function processRun() {
    const ok = await confirm({
      title: "Process payroll",
      message:
        "Process this payroll run? Employee lines will be calculated and attendance, leave, and advance deductions for this cycle will be locked.",
      confirmLabel: "Process payroll",
    });
    if (!ok) return;
    try {
      await apiRequest(`/payroll/runs/${runId}/process-auto`, { method: "POST", body: {} });
      await loadData();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Process failed");
    }
  }

  async function markPaid() {
    setMarkPaidSaving(true);
    try {
      await apiRequest(`/payroll/runs/${runId}/mark-paid`, {
        method: "POST",
        body: { payment_reference: paymentReference.trim() || null },
      });
      setMarkPaidOpen(false);
      setPaymentReference("");
      await loadData();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Mark paid failed");
    } finally {
      setMarkPaidSaving(false);
    }
  }

  const canProcessRun =
    canProcess &&
    ((requireApproval && run?.status === "approved") ||
      (!requireApproval && run?.status === "draft"));

  const approvedBy =
    run?.approved_by_user?.full_name ??
    run?.approvedByUser?.full_name ??
    null;
  const paidBy =
    run?.paid_by_user?.full_name ??
    run?.paidByUser?.full_name ??
    null;

  async function deleteRun() {
    if (!payrollRunCanDelete(run)) {
      notifyError(payrollRunDeleteLockHint(run) ?? "This payroll run can no longer be deleted.");
      return;
    }
    const ok = await confirm({
      title: "Delete payroll run",
      message:
        "Delete this payroll run? Lines are removed and closed attendance, overtime, leave, and advance deductions for that cycle are reopened. Historical records stay for reports.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/payroll-runs/${runId}`, { method: "DELETE" });
      router.push("/hr/payroll");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Delete failed");
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
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Payroll", href: "/hr/payroll" },
          { label: run ? `Run — ${periodLabel(period)}` : "Payroll run" },
        ]}
      />

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
              <div className="mt-3">
                <PayrollWorkflowSteps status={run.status} requireApproval={requireApproval} />
              </div>
              {(run.approved_at || run.paid_at) && (
                <dl className="mt-3 space-y-1 text-xs text-slate-500">
                  {run.approved_at ? (
                    <div>
                      Approved {formatWorkflowDate(run.approved_at)}
                      {approvedBy ? ` by ${approvedBy}` : ""}
                    </div>
                  ) : null}
                  {run.paid_at ? (
                    <div>
                      Paid {formatWorkflowDate(run.paid_at)}
                      {paidBy ? ` by ${paidBy}` : ""}
                      {run.payment_reference ? ` · Ref ${run.payment_reference}` : ""}
                    </div>
                  ) : null}
                </dl>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {run.status === "pending_approval" && canApprove ? (
                <>
                  <PrimaryButton type="button" onClick={approveRun} showIcon={false}>
                    Approve
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={rejectRun}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Reject
                  </button>
                </>
              ) : null}
              {canProcessRun ? (
                <PrimaryButton type="button" onClick={processRun} showIcon={false}>
                  Process payroll
                </PrimaryButton>
              ) : null}
              {run.status === "processed" && canApprove ? (
                <PrimaryButton type="button" onClick={() => setMarkPaidOpen(true)} showIcon={false}>
                  Mark as paid
                </PrimaryButton>
              ) : null}
              {["processed", "paid"].includes(run.status) && lines.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      printPayrollReceipts({
                        lines,
                        run,
                        period,
                        organization,
                        generalSettings: generalSettings(),
                      })
                    }
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Print receipts
                  </button>
                  <Link
                    href={`/reports/bank-transfer?payroll_run_id=${run.id}`}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Bank transfer report
                  </Link>
                </>
              ) : null}
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
          </div>

          {run.status === "pending_approval" && run.action_request?.status === "pending" ? (
            <ApprovalPendingNotice
              className="mb-4"
              message="This payroll run is waiting for manager approval."
              actionRequest={run.action_request}
              onReminded={loadData}
            />
          ) : null}

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Employees" value={String(employeeCount)} />
            <StatCard label="Gross salary" value={formatHrKesFull(run.total_gross)} />
            <StatCard label="Net salary" value={formatHrKesFull(run.total_net)} />
            <StatCard label="Deductions" value={formatHrKesFull(totalDeductions)} />
          </div>

          <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-medium text-slate-900">Employee payroll lines</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Click a row or the view action to open the breakdown in the side panel.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
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
            footer={
              breakdownLine && ["processed", "paid"].includes(run.status) ? (
                <button
                  type="button"
                  onClick={() =>
                    printPayrollReceipt({
                      line: breakdownLine,
                      employee: breakdownEmployee,
                      run,
                      period,
                      organization,
                      generalSettings: generalSettings(),
                    })
                  }
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Print receipt
                </button>
              ) : null
            }
          >
            <PayrollBreakdownPanel
              line={breakdownLine}
              employee={breakdownEmployee}
              loading={lineLoading}
            />
          </DetailDrawer>

          <DetailDrawer
            title="Mark payroll as paid"
            subtitle="Confirm bank disbursement or cash payment for this run."
            open={markPaidOpen}
            onClose={() => {
              if (!markPaidSaving) {
                setMarkPaidOpen(false);
                setPaymentReference("");
              }
            }}
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Net pay total: <span className="font-medium text-slate-900">{formatHrKesFull(run.total_net)}</span>
              </p>
              <Field label="Payment reference (optional)">
                <input
                  type="text"
                  className={inputClassName()}
                  placeholder="Bank batch ref, M-Pesa code, etc."
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  maxLength={120}
                />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={markPaidSaving}
                  onClick={() => {
                    setMarkPaidOpen(false);
                    setPaymentReference("");
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <PrimaryButton type="button" onClick={markPaid} disabled={markPaidSaving} showIcon={false}>
                  {markPaidSaving ? "Saving…" : "Confirm payment"}
                </PrimaryButton>
              </div>
            </div>
          </DetailDrawer>
        </>
      ) : null}
    </div>
  );
}

function formatWorkflowDate(value) {
  return new Date(value).toLocaleString("en-KE", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
