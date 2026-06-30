"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import {
  ImportExportIcons,
  downloadBlob,
  parseSpreadsheet,
} from "@/components/catalog/catalog-import-export-shared";
import { useAuth } from "@/contexts/auth-context";
import { canUseAdvancedDataImport } from "@/lib/advanced-data-import";
import { apiRequest, ApiError } from "@/lib/api";
import { resolveImportTaskError } from "@/lib/background-task-errors";
import {
  formatImportBatchProgress,
  prepareImportRows,
  runBatchedQueuedImport,
  summarizeImportFailures,
} from "@/lib/import-batch";
import { downloadExcelFromRows } from "@/lib/spreadsheet";
import { useQueuedTask } from "@/lib/use-queued-task";
import { ImportProgressLine, ImportResultPanel } from "@/components/catalog/import-feedback";

function ImportModal({
  open,
  onClose,
  title,
  description,
  sampleHeaders,
  sampleRow,
  sampleRows,
  apiPath,
  normalizeRows,
  onImported,
}) {
  const inputRef = useRef(null);
  const { runQueuedTask } = useQueuedTask();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (!open) return null;

  function downloadSample(format) {
    const dataRows = sampleRows?.length ? sampleRows : sampleRow ? [sampleRow] : [];
    const rows = [sampleHeaders, ...dataRows];
    const filenameBase = `${title.toLowerCase().replace(/\s+/g, "-")}-sample`;
    if (format === "xlsx") {
      void downloadExcelFromRows(`${filenameBase}.xlsx`, "Import", rows);
      return;
    }
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }), `${filenameBase}.csv`);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setImportProgress(null);
    setImporting(true);
    try {
      const rows = await parseSpreadsheet(file);
      if (!rows.length) throw new Error("The file has no data rows.");
      const parsed = normalizeRows(rows);
      const normalizedRows = Array.isArray(parsed) ? parsed : parsed.rows ?? [];
      const prepFailures = Array.isArray(parsed) ? [] : parsed.failures ?? [];
      if (!normalizedRows.length && !prepFailures.length) {
        throw new Error("The file has no valid rows.");
      }

      const res = await runBatchedQueuedImport({
        rows: normalizedRows,
        runQueuedTask,
        importChunk: (chunk) =>
          apiRequest(apiPath, {
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="theme-panel theme-modal w-full max-w-md rounded-xl border p-5 shadow-xl">
        <h2 className="text-[15px] font-medium text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
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
        <ImportResultPanel result={result} />
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
  );
}

/**
 * Import button when platform advanced data import is enabled and the user can manage the data.
 */
export function CatalogDataImportButton({
  label = "Import",
  title,
  description,
  sampleHeaders,
  sampleRow,
  sampleRows,
  apiPath,
  normalizeRows,
  onImported,
  permission = "products.manage",
  className = "",
}) {
  const { user, organization, capabilities } = useAuth();
  const [open, setOpen] = useState(false);
  const { ImportIcon } = ImportExportIcons;

  if (!canUseAdvancedDataImport({ user, organization, capabilities, permission })) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${SECONDARY_BTN_CLASS} gap-2 px-3.5 py-2 ${className}`.trim()}
      >
        <ImportIcon />
        {label}
      </button>
      <ImportModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        sampleHeaders={sampleHeaders}
        sampleRow={sampleRow}
        sampleRows={sampleRows}
        apiPath={apiPath}
        normalizeRows={normalizeRows}
        onImported={onImported}
      />
    </>
  );
}

function normalizeImportHeader(header) {
  return String(header ?? "")
    .trim()
    .replace(/^\ufeff/, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** Map spreadsheet headers (labels or aliases) to API field keys. */
export function mapImportHeaders(rows, columnDefs = []) {
  const aliasToKey = new Map();
  for (const col of columnDefs) {
    const { key, label } = col;
    aliasToKey.set(normalizeImportHeader(key), key);
    if (label) {
      aliasToKey.set(normalizeImportHeader(label), key);
    }
    aliasToKey.set(normalizeImportHeader(key.replace(/_/g, " ")), key);
  }

  return (rows ?? []).map((row) => {
    const mapped = {};
    for (const [header, value] of Object.entries(row ?? {})) {
      const targetKey =
        aliasToKey.get(normalizeImportHeader(header))
        ?? String(header ?? "").trim().replace(/^\ufeff/, "");
      mapped[targetKey] = value;
    }
    return mapped;
  });
}

export function filterNonEmptyImportRows(rows, requiredKeys = []) {
  return prepareImportRows({ rows, requiredKeys });
}
