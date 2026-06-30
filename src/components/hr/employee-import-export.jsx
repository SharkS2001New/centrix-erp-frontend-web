"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { resolveImportTaskError } from "@/lib/background-task-errors";
import { formatImportBatchProgress, prepareImportRows, runBatchedQueuedImport, summarizeImportFailures } from "@/lib/import-batch";
import { ImportProgressLine, ImportResultPanel } from "@/components/catalog/import-feedback";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useBackgroundTasks } from "@/contexts/background-task-context";
import { EMPLOYEE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { queueReportExport, serializeExportMeta } from "@/lib/report-export-api";
import { downloadExcelFromRows } from "@/lib/spreadsheet";
import { reportPrintedAt } from "@/lib/reports/export";
import { ImportExportIcons, parseSpreadsheet, downloadBlob } from "@/components/catalog/catalog-import-export-shared";
import { canUseAdvancedDataImport } from "@/lib/advanced-data-import";
import { useAuth } from "@/contexts/auth-context";

const SAMPLE_HEADERS = [
  "first_name",
  "last_name",
  "middle_name",
  "job_title",
  "department_id",
  "position_id",
  "shift_id",
  "branch_id",
  "email",
  "phone",
  "hire_date",
  "base_salary",
  "employment_type",
  "kra_pin",
  "nssf_number",
];

const SAMPLE_ROW = [
  "Jane",
  "Doe",
  "",
  "Sales rep",
  "1",
  "",
  "1",
  "1",
  "jane@example.com",
  "0712345678",
  "2026-01-01",
  "45000",
  "permanent",
  "",
  "",
];

function ExportModal({ open, onClose, totalCount, exportSearchParams }) {
  const { runBackgroundTask } = useBackgroundTasks();
  if (!open) return null;

  function runExport(format) {
    const stamp = new Date().toISOString().slice(0, 10);
    const exportFormat = format === "pdf" ? "pdf" : format === "csv" ? "csv" : "xlsx";
    onClose();
    void runBackgroundTask(
      () =>
        queueReportExport({
          format: exportFormat,
          source: "api",
          path: "/employees",
          filename: `employees-${stamp}`,
          columns: EMPLOYEE_EXPORT_COLUMNS,
          meta: serializeExportMeta({ title: "Employees", subtitle: "Employee export", printedAt: reportPrintedAt() }),
          search_params: exportSearchParams?.() ?? {},
          estimated_row_count: totalCount,
        }),
      {
        label: "Exporting employees",
        message: "Started fetching…",
        downloadOnComplete: true,
        downloadFilename: `employees-${stamp}.${exportFormat === "pdf" ? "pdf" : exportFormat}`,
      },
    ).catch(() => {});
  }

  const countLabel = totalCount ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="theme-panel theme-modal w-full max-w-sm rounded-xl border p-5 shadow-xl">
        <h2 className="text-[15px] font-medium text-slate-900">Export employees</h2>
        <p className="mt-2 text-sm text-slate-500">
          Export all {countLabel.toLocaleString()} employee{countLabel === 1 ? "" : "s"} matching your filters.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" disabled={countLabel === 0} onClick={() => runExport("excel")} className="rounded-lg bg-[#185FA5] py-2.5 text-sm font-medium text-white hover:bg-[#144f8a] disabled:opacity-50">
            Excel spreadsheet (.xlsx)
          </button>
          <button type="button" disabled={countLabel === 0} onClick={() => runExport("csv")} className="rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            CSV (.csv)
          </button>
          <button type="button" disabled={countLabel === 0} onClick={() => runExport("pdf")} className="rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            PDF (print)
          </button>
          <button type="button" onClick={onClose} className="rounded-lg py-2 text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ImportModal({ open, onClose, onImported }) {
  const inputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const { runQueuedTask, overlayNode } = useQueuedTask("Please wait while employees are imported…");
  if (!open) return null;

  function downloadSample(format) {
    const row = SAMPLE_ROW.join(",");
    const csv = `${SAMPLE_HEADERS.join(",")}\n${row}\n`;
    if (format === "csv") {
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "employees-import-sample.csv");
      return;
    }
    void downloadExcelFromRows("employees-import-sample.xlsx", "Sample", [SAMPLE_HEADERS, SAMPLE_ROW]);
  }

  function normalizeRow(row) {
    const body = {
      first_name: String(row.first_name ?? "").trim(),
      last_name: String(row.last_name ?? "").trim(),
    };
    for (const key of SAMPLE_HEADERS) {
      if (key === "first_name" || key === "last_name") continue;
      const val = row[key];
      if (val !== "" && val != null) body[key] = val;
    }
    return body;
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setImporting(true);
    try {
      const rows = await parseSpreadsheet(file);
      const { rows: normalizedRows, failures: prepFailures } = prepareImportRows({
        rows,
        requiredKeys: ["first_name", "last_name"],
        mapRow: (row) => normalizeRow(row),
      });
      if (!normalizedRows.length && !prepFailures.length) {
        throw new Error("The file has no valid employee rows.");
      }

      const res = await runBatchedQueuedImport({
        rows: normalizedRows,
        runQueuedTask,
        importChunk: (chunk) =>
          apiRequest("/employees/import-batch", {
            method: "POST",
            body: { rows: chunk },
          }),
        onBatchProgress: (info) => setImportProgress(formatImportBatchProgress(info)),
      });

      setResult({
        created: Number(res.created ?? 0),
        skipped: Number(res.skipped ?? 0),
        failures: [...prepFailures, ...(Array.isArray(res.failures) ? res.failures : [])],
      });
      if (Number(res.created ?? 0) > 0) onImported?.();
    } catch (err) {
      const failures = err instanceof ApiError && Array.isArray(err.body?.failures) ? err.body.failures : [];
      const failureSummary = summarizeImportFailures(failures);
      const message = resolveImportTaskError(err, "Could not read file");
      setError(failureSummary ? `${message}\n${failureSummary}` : message);
    } finally {
      setImporting(false);
      setImportProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="theme-panel theme-modal w-full max-w-md rounded-xl border p-5 shadow-xl">
            <h2 className="text-[15px] font-medium text-slate-900">Import employees</h2>
            <p className="mt-2 text-sm text-slate-500">Upload CSV or Excel. Employee codes are assigned automatically.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadSample("csv")} className="text-sm font-medium text-[#185FA5] hover:underline">Download sample CSV</button>
              <span className="text-slate-300">·</span>
              <button type="button" onClick={() => downloadSample("xlsx")} className="text-sm font-medium text-[#185FA5] hover:underline">Download sample Excel</button>
            </div>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="mt-4 block w-full text-sm" onChange={handleFile} disabled={importing} />
            {importing ? <ImportProgressLine progress={importProgress} /> : null}
            {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <ImportResultPanel result={result} entityLabel="employee" />
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {overlayNode}
    </>
  );
}

export function EmployeeImportExport({ totalCount, exportSearchParams, onImported }) {
  const { user, organization, capabilities } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const { ImportIcon, ExportIcon } = ImportExportIcons;
  const showImport = canUseAdvancedDataImport({
    user,
    organization,
    capabilities,
    permission: "hr.manage",
  });

  return (
    <>
      {showImport ? (
        <button type="button" onClick={() => setImportOpen(true)} className={`${SECONDARY_BTN_CLASS} gap-2 px-3.5 py-2`}>
          <ImportIcon />
          Import
        </button>
      ) : null}
      <button type="button" onClick={() => setExportOpen(true)} className={`${SECONDARY_BTN_CLASS} gap-2 px-3.5 py-2`}>
        <ExportIcon />
        Export
      </button>
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={onImported} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} totalCount={totalCount} exportSearchParams={exportSearchParams} />
    </>
  );
}
