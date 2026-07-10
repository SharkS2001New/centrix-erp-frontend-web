"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { resolveImportTaskError } from "@/lib/background-task-errors";
import { formatImportBatchProgress, prepareImportRows, runBatchedQueuedImport, summarizeImportFailures } from "@/lib/import-batch";
import { useQueuedTask } from "@/lib/use-queued-task";
import { ImportProgressLine, ImportResultPanel } from "@/components/catalog/import-feedback";
import { useBackgroundTasks } from "@/contexts/background-task-context";
import {
  CUSTOMER_CATALOG_EXPORT_COLUMNS,
  queueReportExport,
  serializeExportMeta,
} from "@/lib/report-export-api";
import { downloadExcelFromRows, readExcelFile } from "@/lib/spreadsheet";
import { reportPrintedAt } from "@/lib/reports/export";
import { ImportExportIcons, parseSpreadsheet, downloadBlob } from "@/components/catalog/catalog-import-export-shared";
import { mapImportHeaders } from "@/components/catalog/catalog-data-import";
import { canUseAdvancedDataImport } from "@/lib/advanced-data-import";
import { useAuth } from "@/contexts/auth-context";

/** Centrix customer import columns (name-based linking; IDs also accepted). */
const CUSTOMER_IMPORT_COLUMNS = [
  { key: "customer_name", label: "Name" },
  { key: "customer_type", label: "Type" },
  { key: "phone_number", label: "Phone" },
  { key: "additional_phone", label: "Alt. phone" },
  { key: "town", label: "Town" },
  { key: "route_name", label: "Route" },
  { key: "route_id", label: "Route ID" },
  { key: "branch_id", label: "Branch ID" },
  { key: "branch_name", label: "Branch" },
  { key: "kra_pin", label: "KRA PIN" },
  { key: "terms_of_payment", label: "Payment terms" },
  { key: "credit_limit", label: "Credit limit" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
];

const SAMPLE_HEADERS = [
  "customer_name",
  "customer_type",
  "phone_number",
  "additional_phone",
  "town",
  "route_name",
  "branch_id",
  "kra_pin",
  "terms_of_payment",
  "credit_limit",
  "latitude",
  "longitude",
];

const SAMPLE_ROW = [
  "Sample Customer Ltd",
  "debtor",
  "0712345678",
  "",
  "Nairobi",
  "",
  "",
  "",
  "Net 30",
  "50000",
  "",
  "",
];

function ExportModal({ open, onClose, totalCount, exportSearchParams, exportColumns }) {
  const { runBackgroundTask } = useBackgroundTasks();
  const columns = exportColumns?.length ? exportColumns : CUSTOMER_CATALOG_EXPORT_COLUMNS;

  if (!open) return null;

  function runCatalogExport(format) {
    const stamp = new Date().toISOString().slice(0, 10);
    const exportFormat = format === "pdf" ? "pdf" : "csv";
    onClose();
    void runBackgroundTask(
      () =>
        queueReportExport({
          format: exportFormat,
          source: "customer_catalog",
          filename: `customers-${stamp}`,
          columns,
          meta: serializeExportMeta({
            title: "Customers",
            subtitle: "Customer export",
            printedAt: reportPrintedAt(),
          }),
          search_params: exportSearchParams?.() ?? {},
        }),
      {
        label: "Exporting customers",
        message: "Started fetching…",
        downloadOnComplete: true,
        downloadFilename: `customers-${stamp}.${exportFormat === "pdf" ? "pdf" : exportFormat}`,
      },
    ).catch(() => {});
  }

  const countLabel = totalCount ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="theme-panel theme-modal w-full max-w-sm rounded-xl border p-5 shadow-xl">
        <h2 className="text-[15px] font-medium text-slate-900">Export customers</h2>
        <p className="mt-2 text-sm text-slate-500">
          Export all {countLabel.toLocaleString()} customer{countLabel === 1 ? "" : "s"} matching your
          current filters. PDF and CSV use your visible table columns.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={countLabel === 0}
            onClick={() => runCatalogExport("csv")}
            className="rounded-lg bg-[#185FA5] py-2.5 text-sm font-medium text-white hover:bg-[#144f8a] disabled:opacity-50"
          >
            CSV (.csv)
          </button>
          <button
            type="button"
            disabled={countLabel === 0}
            onClick={() => runCatalogExport("pdf")}
            className="rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
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
  const { runQueuedTask, overlayNode } = useQueuedTask("Please wait while customers are imported…");

  if (!open) return null;

  function downloadSample(format) {
    const row = SAMPLE_ROW.join(",");
    const csv = `${SAMPLE_HEADERS.join(",")}\n${row}\n`;
    if (format === "csv") {
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "customers-import-sample.csv");
      return;
    }
    void downloadExcelFromRows("customers-import-sample.xlsx", "Sample", [SAMPLE_HEADERS, SAMPLE_ROW]);
  }

  function normalizeRow(row) {
    const body = {
      customer_name: String(row.customer_name ?? "").trim(),
      customer_type: String(row.customer_type ?? "debtor").trim().toLowerCase() || "debtor",
    };
    for (const key of [
      "phone_number",
      "additional_phone",
      "town",
      "route_name",
      "kra_pin",
      "terms_of_payment",
      "latitude",
      "longitude",
    ]) {
      const val = row[key];
      if (val !== "" && val != null) body[key] = String(val).trim();
    }
    for (const key of ["route_id", "branch_id", "credit_limit"]) {
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
    setImportProgress(null);
    setImporting(true);
    try {
      const rows = mapImportHeaders(await parseSpreadsheet(file), CUSTOMER_IMPORT_COLUMNS);
      if (!rows.length) throw new Error("The file has no data rows.");

      const { rows: normalizedRows, failures: prepFailures } = prepareImportRows({
        rows,
        requiredKeys: ["customer_name"],
        mapRow: (row) => normalizeRow(row),
      });
      if (!normalizedRows.length) {
        const failureSummary = summarizeImportFailures(prepFailures);
        if (prepFailures.length) {
          throw new Error(
            failureSummary
              ? `No rows could be imported.\n${failureSummary}`
              : "No rows could be imported.",
          );
        }
        throw new Error("The file has no valid customer rows.");
      }

      const res = await runBatchedQueuedImport({
        rows: normalizedRows,
        runQueuedTask,
        importChunk: (chunk) =>
          apiRequest("/customers/import-batch", {
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
            <h2 className="text-[15px] font-medium text-slate-900">Import customers</h2>
            <p className="mt-2 text-sm text-slate-500">
              Upload a CSV or Excel file. Customer numbers are assigned automatically unless you provide one.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadSample("csv")} className="text-sm font-medium text-[#185FA5] hover:underline">
                Download sample CSV
              </button>
              <span className="text-slate-300">·</span>
              <button type="button" onClick={() => downloadSample("xlsx")} className="text-sm font-medium text-[#185FA5] hover:underline">
                Download sample Excel
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-4 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
              onChange={handleFile}
              disabled={importing}
            />
            {importing ? <ImportProgressLine progress={importProgress} /> : null}
            {error ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
            <ImportResultPanel result={result} entityLabel="customer" />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {overlayNode}
    </>
  );
}

export function CustomerImportExport({ totalCount, exportSearchParams, exportColumns, onImported }) {
  const { user, organization, capabilities } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const { ImportIcon, ExportIcon } = ImportExportIcons;
  const showImport = canUseAdvancedDataImport({
    user,
    organization,
    capabilities,
    permission: "customers.manage",
    page: "customers",
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
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        totalCount={totalCount}
        exportSearchParams={exportSearchParams}
        exportColumns={exportColumns}
      />
    </>
  );
}
