"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { canApprovePayrollRuns } from "@/lib/approval-permissions";
import { P } from "@/lib/permission-codes";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useBlockingWait } from "@/lib/use-blocking-wait";
import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import {
  Field,
  DetailDrawer,
  IconButton,
  PrimaryButton,
  PaginationBar,
  SearchInput,
  StatCard,
  inputClassName,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { HrPageActions } from "@/components/hr/hr-list-toolbar";
import { useDebouncedValue } from "@/lib/use-debounced-value";
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
import {
  buildReportMeta,
  downloadReportCsv,
  normalizeExportColumns,
  printReportTable,
  reportPrintedAt,
  slugifyReportFilename,
} from "@/lib/reports/export";
import { resolveReportBranding } from "@/lib/reports/report-branding";
import { formatOrgDate } from "@/lib/format";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { ApprovalPendingNotice } from "@/components/approval-reminder-button";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";
import { useTabTitle, useTabWorkspace } from "@/contexts/tab-workspace-context";
import { tabDetailTitle } from "@/hooks/use-tab-form-exit";

import {
  buildPayrollSheetExportFooter,
  buildPayrollSheetExportRows,
  buildPayrollSheetFooter,
  buildPayrollSheetRows,
  PAYROLL_SHEET_COLUMNS,
} from "@/lib/payroll-sheet";

const AUTO_PROCESS_KEY = (id) => `payroll-auto-process-${id}`;
const AUTO_PROCESS_CONSUMED_KEY = (id) => `payroll-auto-process-consumed-${id}`;
const PAYROLL_SHEET_COL_COUNT = PAYROLL_SHEET_COLUMNS.length + 2;
const SHEET_CELL = "border border-slate-200 px-2 py-2";

function lineHasEmployeeEmail(line) {
  const employee = line?.employee;
  if (!employee) return false;
  const work = String(employee.email ?? "").trim();
  const personal = String(employee.personal_email ?? "").trim();
  return work !== "" || personal !== "";
}

function employeeNameFromLine(line) {
  const emp = line?.employee;
  return (
    composeEmployeeDisplayName(emp) ||
    emp?.full_name ||
    `#${line?.employee_id ?? ""}`
  );
}

export function HrPayrollRunsIdScreen() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const { runBlockingTask, overlayNode: deleteWaitOverlay, busy: deleteBusy } = useBlockingWait(
    "Deleting payroll…",
  );
  const { runQueuedTask } = useQueuedTask("Generating payroll…");
  const { user, hasPermission, capabilities, organization, generalSettings } = useAuth();
  const { enabled: tabWorkspaceEnabled, openTab, closeTab, clearTabDirty } =
    useTabWorkspace();
  const admin = isAdminUser(user);
  const canApprove = canApprovePayrollRuns({ hasPermission, capabilities });
  const canProcess = hasPermission(P.hr.payroll.create) || hasPermission(P.hr.manage);
  const canDeletePayrollRuns =
    admin || hasPermission(P.hr.manage) || hasPermission(P.hr.payroll.delete);
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
  const [processing, setProcessing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState(() => new Set());
  const [linesPage, setLinesPage] = useState(1);
  const [linesPageSize, setLinesPageSize] = useState(50);
  const [sheetSearch, setSheetSearch] = useState("");
  const debouncedSheetSearch = useDebouncedValue(sheetSearch, 250);
  const autoProcessStarted = useRef(false);
  /** After delete (or known 404), stop reloads and leave this sheet. */
  const leftRunSheetRef = useRef(false);

  const leavePayrollRunSheet = useCallback(() => {
    leftRunSheetRef.current = true;
    const sheetHref = `/hr/payroll/runs/${runId}`;
    if (tabWorkspaceEnabled) clearTabDirty(sheetHref);
    router.push("/hr/payroll");
    if (tabWorkspaceEnabled) {
      window.setTimeout(() => closeTab(sheetHref), 0);
    }
  }, [clearTabDirty, closeTab, router, runId, tabWorkspaceEnabled]);

  const loadData = useCallback(async () => {
    if (leftRunSheetRef.current) return;
    setLoading(true);
    try {
      // Load the run first. Parallel Promise.all let a 404 on the run race with
      // payroll-lines and surface as Uncaught (in promise) ApiError in the console.
      let runData;
      try {
        runData = await apiRequest(`/payroll-runs/${runId}`, { reportIssues: false });
      } catch (e) {
        if (leftRunSheetRef.current) return;
        const missingRun =
          e instanceof ApiError &&
          (e.status === 404 ||
            e.body?.code === "payroll_run_not_found" ||
            /payroll run not found/i.test(String(e.message ?? "")));
        if (missingRun) {
          notifyError("Payroll run not found. It may have been deleted.");
          leavePayrollRunSheet();
          return;
        }
        throw e;
      }

      if (leftRunSheetRef.current) return;

      const linesRows = await fetchAllPaginatedRowsSmart(
        "/payroll-lines",
        { "filter[payroll_run_id]": runId },
        { perPage: 100, message: "Loading payroll lines…" },
      );
      if (leftRunSheetRef.current) return;
      setRun(runData);
      setLines(linesRows ?? []);
      setSelectedLineIds(new Set());
      setLinesPage(1);
    } catch (e) {
      if (leftRunSheetRef.current) return;
      notifyError(e instanceof Error ? e.message : "Failed to load payroll run");
    } finally {
      if (!leftRunSheetRef.current) setLoading(false);
    }
  }, [runId, leavePayrollRunSheet]);

  const runAutoProcess = useCallback(
    async (options = {}) => {
      if (leftRunSheetRef.current) return;
      setProcessing(true);
      setLines([]);
      try {
        await runQueuedTask(
          () =>
            apiRequest(`/payroll/runs/${runId}/process-auto`, {
              method: "POST",
              body: { ...options },
            }),
          {
            message: "Generating payroll…",
            intervalMs: 400,
            maxIntervalMs: 1200,
          },
        );
        if (leftRunSheetRef.current) return;
        await loadData();
        notifySuccess("Payroll generated.");
      } catch (e) {
        if (leftRunSheetRef.current) return;
        if (e?.name !== "AbortError") {
          notifyError(e instanceof ApiError ? e.message : "Process failed");
          await loadData();
        }
      } finally {
        if (!leftRunSheetRef.current) setProcessing(false);
      }
    },
    [runId, runQueuedTask, loadData],
  );

  useTabAwareDataLoad(loadData);

  useEffect(() => {
    if (!canProcess || !Number.isFinite(runId)) return;
    const shouldProcess = searchParams.get("process") === "1";
    if (!shouldProcess) return;

    // Strip ?process=1 immediately so tab reopen / remount never re-triggers.
    router.replace(`/hr/payroll/runs/${runId}`);

    const consumedKey = AUTO_PROCESS_CONSUMED_KEY(runId);
    try {
      if (sessionStorage.getItem(consumedKey) === "1") return;
    } catch {
      /* ignore */
    }
    if (autoProcessStarted.current) return;
    autoProcessStarted.current = true;

    let options = {};
    try {
      const raw = sessionStorage.getItem(AUTO_PROCESS_KEY(runId));
      if (raw) options = JSON.parse(raw);
      sessionStorage.removeItem(AUTO_PROCESS_KEY(runId));
      sessionStorage.setItem(consumedKey, "1");
    } catch {
      /* ignore */
    }

    void (async () => {
      try {
        const existing = await apiRequest(`/payroll-runs/${runId}`);
        const status = String(existing?.status ?? "");
        // Already generated — just show the sheet (revisiting must not reprocess).
        if (["processed", "paid", "pending_approval", "approved"].includes(status)) {
          await loadData();
          return;
        }
        await runAutoProcess(options);
      } catch (e) {
        if (e?.name === "AbortError") return;
        // Fall back to process only when we cannot confirm status.
        if (e instanceof ApiError && e.status === 404) {
          notifyError("Payroll run not found.");
          return;
        }
        await runAutoProcess(options);
      }
    })();
  }, [canProcess, runId, searchParams, router, runAutoProcess, loadData]);

  const period = run?.pay_period ?? run?.payPeriod ?? null;

  useTabTitle(
    period || run
      ? tabDetailTitle("Payroll run", periodLabel(period) || run?.period_code || `#${runId}`)
      : "Payroll run",
  );

  const totalDeductions = useMemo(() => {
    if (run?.total_gross != null && run?.total_net != null) {
      return Number(run.total_gross) - Number(run.total_net);
    }
    return lines.reduce((sum, l) => sum + Number(l.deductions ?? 0), 0);
  }, [run, lines]);

  const employeeCount = run?.employee_count ?? lines.length;

  /** Open payroll reports in a new workspace tab — keep this run tab intact. */
  function openPayrollReportTab(href, title) {
    if (tabWorkspaceEnabled) {
      openTab(href, title);
      router.push(href);
      return;
    }
    router.push(href);
  }

  const lineIds = useMemo(() => lines.map((line) => String(line.id)), [lines]);
  const selectedCount = selectedLineIds.size;
  const allLinesSelected = lineIds.length > 0 && lineIds.every((id) => selectedLineIds.has(id));
  const filteredLines = useMemo(() => {
    const q = debouncedSheetSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((line) => {
      const name = employeeNameFromLine(line).toLowerCase();
      const code = String(line.employee?.employee_code ?? line.employee_code ?? "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [lines, debouncedSheetSearch]);
  const payrollSheetDisplayRows = useMemo(
    () => buildPayrollSheetRows(filteredLines, employeeNameFromLine),
    [filteredLines],
  );
  const payrollSheetTotals = useMemo(
    () => buildPayrollSheetFooter(lines, employeeNameFromLine),
    [lines],
  );
  const linesTotalPages = Math.max(1, Math.ceil(filteredLines.length / linesPageSize) || 1);
  const safeLinesPage = Math.min(linesPage, linesTotalPages);
  const pagedLines = useMemo(() => {
    const start = (safeLinesPage - 1) * linesPageSize;
    return filteredLines.slice(start, start + linesPageSize);
  }, [filteredLines, safeLinesPage, linesPageSize]);
  const pagedDisplayRows = useMemo(() => {
    const start = (safeLinesPage - 1) * linesPageSize;
    return payrollSheetDisplayRows.slice(start, start + linesPageSize);
  }, [payrollSheetDisplayRows, safeLinesPage, linesPageSize]);
  const canPrintOrEmailReceipts =
    run && ["processed", "paid"].includes(run.status) && lines.length > 0;
  const canExcludeFromRun =
    canProcess && run && run.status !== "paid" && lines.length > 0;

  useEffect(() => {
    setLinesPage(1);
  }, [debouncedSheetSearch]);

  function toggleLineSelected(lineId, checked) {
    const key = String(lineId);
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleSelectAllLines(checked) {
    setSelectedLineIds(checked ? new Set(lineIds) : new Set());
  }

  function printReceiptLines(targetLines, label) {
    if (!targetLines.length) {
      notifyError(`Select at least one employee to ${label}.`);
      return;
    }
    printPayrollReceipts({
      lines: targetLines,
      run,
      period,
      organization,
      generalSettings: generalSettings(),
    });
  }

  function payrollSheetExportColumns() {
    return normalizeExportColumns(
      PAYROLL_SHEET_COLUMNS.map((col) => ({
        key: col.key,
        label: col.label,
        align: col.align,
        csvAsText: col.key === "account_number",
        cellClass: col.key === "account_number" ? "text" : "",
        accessor: (row) => String(row[col.key] ?? ""),
      })),
    );
  }

  /** Print/PDF omits bank account numbers (keep Acc no on-screen + CSV). */
  function payrollSheetPrintColumns() {
    return payrollSheetExportColumns().filter((col) => col.key !== "account_number");
  }

  function payrollSheetPrintFooterRow(targetLines = lines) {
    const footer = payrollSheetFooterRow(targetLines);
    if (!footer || typeof footer !== "object") return footer;
    const { account_number: _omit, ...rest } = footer;
    return rest;
  }

  function payrollSheetRows(targetLines = lines) {
    return buildPayrollSheetRows(targetLines, employeeNameFromLine);
  }

  function payrollSheetExportRows(targetLines = lines) {
    return buildPayrollSheetExportRows(targetLines, employeeNameFromLine);
  }

  function payrollSheetFooterRow(targetLines = lines) {
    return buildPayrollSheetFooter(targetLines, employeeNameFromLine);
  }

  function payrollSheetExportFooterRow(targetLines = lines) {
    return buildPayrollSheetExportFooter(targetLines, employeeNameFromLine);
  }

  function exportPayrollSheetCsv() {
    if (!lines.length) {
      notifyError("No payroll lines to export.");
      return;
    }
    const periodText = periodLabel(period) || run?.period_code || "";
    const meta = buildReportMeta({
      organizationName: organization?.org_name ?? "",
      title: "Payroll sheet",
      subtitle: periodText ? `Pay period ${periodText}` : `Payroll run #${run?.id ?? runId}`,
      printedAt: reportPrintedAt(),
      extraLines: reportConstantHeaderForRun(),
    });
    downloadReportCsv(
      slugifyReportFilename(`payroll-sheet-${run?.id ?? runId}`),
      meta,
      payrollSheetExportColumns(),
      payrollSheetExportRows(),
      payrollSheetExportFooterRow(),
    );
    notifySuccess("Payroll sheet CSV downloaded.");
  }

  function printPayrollSheet() {
    if (!lines.length) {
      notifyError("No payroll lines to print.");
      return;
    }
    const periodText = periodLabel(period) || run?.period_code || "";
    const branding = resolveReportBranding({
      organization,
      generalSettings: generalSettings(),
    });
    const meta = buildReportMeta({
      organizationName: organization?.org_name ?? "",
      title: "Payroll sheet",
      subtitle: periodText ? `Pay period ${periodText}` : `Payroll run #${run?.id ?? runId}`,
      printedAt: reportPrintedAt(),
      extraLines: reportConstantHeaderForRun(),
      orientation: "landscape",
    });
    try {
      printReportTable({
        meta,
        columns: payrollSheetPrintColumns(),
        rows: payrollSheetRows(),
        footerRow: payrollSheetPrintFooterRow(),
        branding,
        generalSettings: generalSettings(),
      });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Print failed");
    }
  }

  function reportConstantHeaderForRun() {
    const linesOut = [];
    if (run?.run_date) linesOut.push(`Run date: ${formatOrgDate(run.run_date)}`);
    if (period?.period_start || period?.period_end) {
      const start = period?.period_start ? formatOrgDate(period.period_start) : "—";
      const end = period?.period_end ? formatOrgDate(period.period_end) : "—";
      linesOut.push(`Pay period: ${start} – ${end}`);
    }
    return linesOut;
  }

  async function emailReceiptLines(targetLines, { selected = false } = {}) {
    if (!targetLines.length) {
      notifyError("Select at least one employee to email.");
      return;
    }
    const withEmail = targetLines.filter(lineHasEmployeeEmail).length;
    const withoutEmail = targetLines.length - withEmail;
    if (withEmail === 0) {
      notifyError("None of these employees have a work or personal email on file.");
      return;
    }
    const scope = selected ? `${targetLines.length} selected employee(s)` : "all employees on this run";
    const ok = await confirm({
      title: selected ? "Email selected receipts" : "Email payroll receipts",
      message:
        `Send payslip PDFs for ${scope}? ${withEmail} have email on file` +
        (withoutEmail > 0 ? `; ${withoutEmail} without email will be skipped.` : "."),
      confirmLabel: "Send emails",
    });
    if (!ok) return;

    setEmailing(true);
    try {
      const body = selected
        ? { line_ids: targetLines.map((line) => Number(line.id)).filter((id) => id > 0) }
        : {};
      const res = await apiRequest(`/payroll/runs/${runId}/email-receipts`, {
        method: "POST",
        body,
      });
      notifySuccess(res.message ?? "Payroll receipts emailed.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to email receipts");
    } finally {
      setEmailing(false);
    }
  }

  async function emailAllReceipts() {
    await emailReceiptLines(lines, { selected: false });
  }

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
    const reprocess = run?.status === "processed";
    const ok = await confirm({
      title: reprocess ? "Reprocess payroll" : "Process payroll",
      message: reprocess
        ? "Recalculate all employee lines (including PAYE and other statutory deductions)? Existing lines for this run will be replaced."
        : "Process this payroll run? Employee lines will be calculated and attendance, leave, and advance deductions for this cycle will be locked.",
      confirmLabel: reprocess ? "Reprocess payroll" : "Process payroll",
    });
    if (!ok) return;
    await runAutoProcess({});
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
    ((requireApproval && ["approved", "processed"].includes(run?.status)) ||
      (!requireApproval && ["draft", "processed"].includes(run?.status)));

  const approvedBy =
    run?.approved_by_user?.full_name ??
    run?.approvedByUser?.full_name ??
    null;
  const paidBy =
    run?.paid_by_user?.full_name ??
    run?.paidByUser?.full_name ??
    null;

  async function excludeSelectedFromRun() {
    if (!canExcludeFromRun || selectedCount === 0) return;
    const ok = await confirm({
      title: "Exclude from this payroll run?",
      message: `Remove ${selectedCount} employee${selectedCount === 1 ? "" : "s"} from this run? They will not be paid on this payroll. Attendance and deductions for them are reopened so you can include them in a later run if needed.`,
      confirmLabel: "Exclude",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await apiRequest(`/payroll/runs/${runId}/exclude-lines`, {
        method: "POST",
        body: { line_ids: [...selectedLineIds].map((id) => Number(id)) },
      });
      setSelectedLineIds(new Set());
      await loadData();
      notifySuccess(res.message ?? "Employees excluded from this payroll run.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not exclude employees");
    }
  }

  async function deleteRun() {
    if (deleteBusy) return;
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
      // Stop concurrent sheet reloads before DELETE returns 404 on a follow-up GET.
      leftRunSheetRef.current = true;
      await runBlockingTask(
        () => apiRequest(`/payroll-runs/${runId}`, { method: "DELETE" }),
        {
          message: "Deleting payroll run…",
          detail: "Reopening attendance and deductions for that cycle. Please wait.",
        },
      );
      notifySuccess("Payroll run deleted.");
      leavePayrollRunSheet();
    } catch (e) {
      leftRunSheetRef.current = false;
      notifyError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  async function emailLineReceipt() {
    if (!breakdownLine?.id) return;
    const employee = breakdownEmployee ?? breakdownLine.employee;
    const defaultTo = employee?.email || employee?.personal_email || "";
    if (!defaultTo) {
      notifyError("This employee has no email on file. Add a work or personal email first.");
      return;
    }
    const ok = await confirm({
      title: "Email payroll receipt",
      message: `Send this payslip PDF to ${defaultTo}?`,
      confirmLabel: "Send email",
    });
    if (!ok) return;
    setEmailing(true);
    try {
      const res = await apiRequest(`/payroll/runs/${runId}/lines/${breakdownLine.id}/email-receipt`, {
        method: "POST",
        body: { to: defaultTo },
      });
      notifySuccess(res.message ?? "Payroll receipt emailed.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to email receipt");
    } finally {
      setEmailing(false);
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
    <>
    {deleteWaitOverlay}
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Payroll runs", href: "/hr/payroll" },
          { label: run ? periodLabel(period) || `Run #${run.id}` : "Payroll run" },
        ]}
      />

      {loading && !processing && !run ? (
        <p className="text-sm text-slate-500">Loading payroll run…</p>
      ) : run ? (
        <>
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
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
              {canPrintOrEmailReceipts ? (
                <HrPageActions>
                  <button
                    type="button"
                    onClick={() => void loadData()}
                    disabled={loading || processing}
                    className={`${SECONDARY_BTN_CLASS} disabled:opacity-50`}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => exportPayrollSheetCsv()}
                    className={SECONDARY_BTN_CLASS}
                  >
                    Export sheet CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => printPayrollSheet()}
                    className={SECONDARY_BTN_CLASS}
                  >
                    Print / PDF sheet
                  </button>
                </HrPageActions>
              ) : null}
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
              {canProcessRun && !processing ? (
                <PrimaryButton type="button" onClick={processRun} showIcon={false}>
                  {run.status === "processed" ? "Reprocess payroll" : "Process payroll"}
                </PrimaryButton>
              ) : null}
              {run.status === "processed" && (canApprove || canProcess) ? (
                <PrimaryButton type="button" onClick={() => setMarkPaidOpen(true)} showIcon={false}>
                  Mark as paid
                </PrimaryButton>
              ) : null}
              {canPrintOrEmailReceipts ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      openPayrollReportTab(
                        `/reports/statutory-deductions?payroll_run_id=${run.id}`,
                        "Statutory deductions",
                      )
                    }
                    className={SECONDARY_BTN_CLASS}
                  >
                    Statutory deductions
                  </button>
                  <button
                    type="button"
                    onClick={() => printReceiptLines(lines, "print")}
                    className={SECONDARY_BTN_CLASS}
                    title="Print employee payslip receipts for everyone on this run"
                  >
                    Print all receipts
                  </button>
                  <button
                    type="button"
                    disabled={emailing || processing}
                    onClick={() => void emailAllReceipts()}
                    className={`${SECONDARY_BTN_CLASS} disabled:opacity-50`}
                  >
                    {emailing ? "Emailing…" : "Email all"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openPayrollReportTab(
                        `/reports/bank-transfer?payroll_run_id=${run.id}`,
                        "Bank transfer report",
                      )
                    }
                    className={SECONDARY_BTN_CLASS}
                  >
                    Bank transfer report
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openPayrollReportTab(
                        `/reports/nssf-remittance?payroll_run_id=${run.id}`,
                        "NSSF remittance",
                      )
                    }
                    className={SECONDARY_BTN_CLASS}
                  >
                    NSSF remittance
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openPayrollReportTab(
                        `/reports/other-deductions?payroll_run_id=${run.id}`,
                        "Other deductions",
                      )
                    }
                    className={SECONDARY_BTN_CLASS}
                  >
                    Other deductions
                  </button>
                </>
              ) : null}
              {canDeletePayrollRuns && payrollRunCanDelete(run) ? (
                <button
                  type="button"
                  onClick={deleteRun}
                  disabled={deleteBusy}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteBusy ? "Deleting…" : "Delete run"}
                </button>
              ) : canDeletePayrollRuns && !payrollRunCanDelete(run) ? (
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
              <h2 className="text-[15px] font-medium text-slate-900">Payroll sheet</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Basic salary, overtime, statutory deductions, advances, and net pay — matching the
                payroll sheet layout. Export CSV or Print / PDF from the actions above.
                {canExcludeFromRun
                  ? " To skip someone who should not be paid, select their row(s) and choose Exclude from run."
                  : ""}
              </p>
              <div className="mt-3 max-w-sm">
                <SearchInput
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                  placeholder="Search employee on this sheet…"
                />
              </div>
              {selectedCount > 0 ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-700">
                  <span>{selectedCount} selected</span>
                  <button
                    type="button"
                    onClick={() => setSelectedLineIds(new Set())}
                    className="text-[#185FA5] hover:underline"
                  >
                    Clear
                  </button>
                  {canExcludeFromRun ? (
                    <button
                      type="button"
                      onClick={() => void excludeSelectedFromRun()}
                      className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-900 hover:bg-amber-100"
                    >
                      Exclude from run ({selectedCount})
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1400px] border-collapse border border-slate-200 text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className={`w-10 ${SHEET_CELL}`}>
                      {(lines.length > 0 && run?.status !== "paid") || canPrintOrEmailReceipts ? (
                        <input
                          type="checkbox"
                          checked={allLinesSelected}
                          onChange={(e) => toggleSelectAllLines(e.target.checked)}
                          aria-label="Select all employees"
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      ) : null}
                    </th>
                    {PAYROLL_SHEET_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`${SHEET_CELL} ${col.align === "right" ? "text-right" : "text-left"}`}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className={`w-[70px] ${SHEET_CELL}`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {processing ? (
                    <tr>
                      <td colSpan={PAYROLL_SHEET_COL_COUNT} className={`${SHEET_CELL} py-12 text-center text-slate-500`}>
                        Calculating employee lines… results will appear here when ready.
                      </td>
                    </tr>
                  ) : lines.length === 0 ? (
                    <tr>
                      <td colSpan={PAYROLL_SHEET_COL_COUNT} className={`${SHEET_CELL} py-12 text-center text-slate-500`}>
                        No payroll lines for this run.
                      </td>
                    </tr>
                  ) : filteredLines.length === 0 ? (
                    <tr>
                      <td colSpan={PAYROLL_SHEET_COL_COUNT} className={`${SHEET_CELL} py-12 text-center text-slate-500`}>
                        No employees match “{debouncedSheetSearch.trim()}”.
                      </td>
                    </tr>
                  ) : (
                    pagedLines.map((line, index) => {
                      const row = pagedDisplayRows[index] ?? {};
                      const name = employeeNameFromLine(line);
                      const isSelected = selectedLine?.id === line.id;
                      const isChecked = selectedLineIds.has(String(line.id));
                      const hasEmail = lineHasEmployeeEmail(line);
                      return (
                        <tr
                          key={line.id}
                          onClick={() => openLineDetail(line)}
                          className={`cursor-pointer hover:bg-slate-50 ${
                            isSelected ? "bg-[#E6F1FB]/40" : ""
                          }`}
                        >
                          <td className={SHEET_CELL} onClick={(e) => e.stopPropagation()}>
                            {(run?.status !== "paid" || canPrintOrEmailReceipts) ? (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => toggleLineSelected(line.id, e.target.checked)}
                                aria-label={`Select ${name}`}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                            ) : null}
                          </td>
                          {PAYROLL_SHEET_COLUMNS.map((col) => (
                            <td
                              key={col.key}
                              className={`${SHEET_CELL} ${
                                col.key === "name"
                                  ? "font-medium text-slate-900"
                                  : col.align === "right"
                                    ? "text-right font-mono text-slate-800"
                                    : "text-slate-700"
                              } ${col.key === "net_pay" ? "font-semibold" : ""}`}
                            >
                              {col.key === "name" ? (
                                <>
                                  <span>{row.name}</span>
                                  {canPrintOrEmailReceipts && !hasEmail ? (
                                    <span className="mt-0.5 block text-[11px] font-normal text-amber-700">
                                      No email on file
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                row[col.key] ?? (col.align === "right" ? "—" : "")
                              )}
                            </td>
                          ))}
                          <td className={SHEET_CELL} onClick={(e) => e.stopPropagation()}>
                            <IconButton label="Breakdown" onClick={() => openLineDetail(line)}>
                              <ViewIcon />
                            </IconButton>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {!processing && lines.length > 0 ? (
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold text-slate-900">
                      <td className={SHEET_CELL} />
                      {PAYROLL_SHEET_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={`${SHEET_CELL} ${col.align === "right" ? "text-right font-mono" : ""}`}
                        >
                          {payrollSheetTotals[col.key] ?? ""}
                        </td>
                      ))}
                      <td className={SHEET_CELL} />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            {filteredLines.length > linesPageSize ? (
              <PaginationBar
                page={safeLinesPage}
                totalPages={linesTotalPages}
                total={filteredLines.length}
                pageSize={linesPageSize}
                onChange={setLinesPage}
                onPageSizeChange={(size) => {
                  setLinesPageSize(size);
                  setLinesPage(1);
                }}
                pageSizeOptions={[25, 50, 100]}
              />
            ) : null}
          </div>

          <DetailDrawer
            title="Payroll breakdown"
            subtitle={employeeName}
            open={!!selectedLine}
            onClose={closeLineDetail}
            wide
            footer={
              breakdownLine && ["processed", "paid"].includes(run.status) ? (
                <div className="flex flex-wrap gap-2">
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
                  <button
                    type="button"
                    disabled={emailing}
                    onClick={() => void emailLineReceipt()}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {emailing ? "Emailing…" : "Email receipt"}
                  </button>
                </div>
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
    </>
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
