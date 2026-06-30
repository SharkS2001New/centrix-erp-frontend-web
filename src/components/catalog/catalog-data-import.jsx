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
import { downloadExcelFromRows } from "@/lib/spreadsheet";
import { useQueuedTask } from "@/lib/use-queued-task";

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
      const normalizedRows = normalizeRows(rows);
      if (!normalizedRows.length) throw new Error("The file has no valid rows.");

      const res = await runQueuedTask(
        () =>
          apiRequest(apiPath, {
            method: "POST",
            body: { rows: normalizedRows },
          }),
        {
          message: `Please wait while ${normalizedRows.length} row(s) are imported…`,
          onProgress: (task) => setImportProgress(Number(task.progress ?? 0)),
        },
      );

      setResult({
        created: Number(res.created ?? 0),
        failures: Array.isArray(res.failures) ? res.failures : [],
      });
      if (Number(res.created ?? 0) > 0) onImported?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not read file");
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
        {importing && importProgress != null ? (
          <p className="mt-3 text-sm text-slate-600">Importing… {importProgress}%</p>
        ) : null}
        {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {result ? (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <p>
              Imported <strong>{result.created}</strong> row(s).
              {result.failures.length ? ` ${result.failures.length} row(s) failed.` : ""}
            </p>
            {result.failures.length ? (
              <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-4 text-xs">
                {result.failures.slice(0, 10).map((failure) => (
                  <li key={`${failure.row}-${failure.message}`}>
                    Row {failure.row}: {failure.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
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
  const normalized = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const hasAny = Object.values(row).some((value) => String(value ?? "").trim() !== "");
    if (!hasAny) continue;
    const missing = requiredKeys.filter((key) => !String(row[key] ?? "").trim());
    if (missing.length) {
      throw new Error(`A row is missing required field(s): ${missing.join(", ")}`);
    }
    normalized.push(
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
      ),
    );
  }
  return normalized;
}
