"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useBackgroundTasks } from "@/contexts/background-task-context";
import {
  SUPPLIER_CATALOG_EXPORT_COLUMNS,
  queueReportExport,
  serializeExportMeta,
} from "@/lib/report-export-api";
import { downloadExcelFromRows } from "@/lib/spreadsheet";
import { reportPrintedAt } from "@/lib/reports/export";
import { ImportExportIcons, parseSpreadsheet, downloadBlob } from "@/components/catalog/catalog-import-export-shared";

const SAMPLE_HEADERS = [
  "supplier_name",
  "supplier_code",
  "contact_person",
  "phone",
  "alternate_phone",
  "email",
  "town",
  "tax_pin",
  "address",
  "is_active",
];

const SAMPLE_ROW = [
  "Sample Supplies Ltd",
  "",
  "Jane Doe",
  "0712345678",
  "",
  "buyer@example.com",
  "Nairobi",
  "",
  "Industrial Area",
  "true",
];

function ExportModal({ open, onClose, totalCount, exportSearchParams }) {
  const { runBackgroundTask } = useBackgroundTasks();

  if (!open) return null;

  function runCatalogExport(format) {
    const stamp = new Date().toISOString().slice(0, 10);
    const exportFormat = format === "pdf" ? "pdf" : "csv";
    onClose();
    void runBackgroundTask(
      () =>
        queueReportExport({
          format: exportFormat,
          source: "supplier_catalog",
          filename: `suppliers-${stamp}`,
          columns: SUPPLIER_CATALOG_EXPORT_COLUMNS,
          meta: serializeExportMeta({
            title: "Suppliers",
            subtitle: "Supplier export",
            printedAt: reportPrintedAt(),
          }),
          search_params: exportSearchParams?.() ?? {},
        }),
      {
        label: "Exporting suppliers",
        message: "Started fetching…",
        downloadOnComplete: true,
        downloadFilename: `suppliers-${stamp}.${exportFormat === "pdf" ? "pdf" : exportFormat}`,
      },
    ).catch(() => {});
  }

  const countLabel = totalCount ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="theme-panel theme-modal w-full max-w-sm rounded-xl border p-5 shadow-xl">
        <h2 className="text-[15px] font-medium text-slate-900">Export suppliers</h2>
        <p className="mt-2 text-sm text-slate-500">
          Export all {countLabel.toLocaleString()} supplier{countLabel === 1 ? "" : "s"} matching your
          current filters.
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
  const { runQueuedTask, overlayNode } = useQueuedTask("Please wait while suppliers are imported…");

  if (!open) return null;

  function downloadSample(format) {
    const row = SAMPLE_ROW.join(",");
    const csv = `${SAMPLE_HEADERS.join(",")}\n${row}\n`;
    if (format === "csv") {
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "suppliers-import-sample.csv");
      return;
    }
    void downloadExcelFromRows("suppliers-import-sample.xlsx", "Sample", [SAMPLE_HEADERS, SAMPLE_ROW]);
  }

  function normalizeRow(row) {
    const body = {
      supplier_name: String(row.supplier_name ?? "").trim(),
    };
    for (const key of [
      "supplier_code",
      "contact_person",
      "phone",
      "alternate_phone",
      "email",
      "town",
      "tax_pin",
      "address",
    ]) {
      const val = row[key];
      if (val !== "" && val != null) body[key] = String(val).trim();
    }
    const active = String(row.is_active ?? "").toLowerCase();
    if (active === "true" || active === "1" || active === "yes") body.is_active = true;
    if (active === "false" || active === "0" || active === "no") body.is_active = false;
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
      const rows = await parseSpreadsheet(file);
      if (!rows.length) throw new Error("The file has no data rows.");

      const normalizedRows = [];
      for (const row of rows) {
        if (!row.supplier_name) continue;
        const body = normalizeRow(row);
        if (!body.supplier_name) throw new Error("Each row must include a supplier name.");
        normalizedRows.push(body);
      }
      if (!normalizedRows.length) throw new Error("The file has no valid supplier rows.");

      const res = await runQueuedTask(
        () =>
          apiRequest("/suppliers/import-batch", {
            method: "POST",
            body: { rows: normalizedRows },
          }),
        {
          message: `Please wait while ${normalizedRows.length} supplier(s) are imported…`,
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

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="theme-panel theme-modal w-full max-w-md rounded-xl border p-5 shadow-xl">
            <h2 className="text-[15px] font-medium text-slate-900">Import suppliers</h2>
            <p className="mt-2 text-sm text-slate-500">
              Upload a CSV or Excel file. Supplier codes are assigned automatically when omitted.
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
            {importing && importProgress != null ? (
              <p className="mt-3 text-sm text-slate-600">Importing… {importProgress}%</p>
            ) : null}
            {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {result ? (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p>
                  {result.created} supplier{result.created === 1 ? "" : "s"} imported.
                </p>
                {result.failures.length > 0 ? (
                  <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-red-700">
                    {result.failures.slice(0, 8).map((f, idx) => (
                      <li key={`${f.code ?? "row"}-${idx}`}>
                        {f.code ?? `Row ${f.row ?? idx + 1}`}: {f.message}
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
      )}
      {overlayNode}
    </>
  );
}

export function SupplierImportExport({ totalCount, exportSearchParams, onImported }) {
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const { ImportIcon, ExportIcon } = ImportExportIcons;

  return (
    <>
      <button type="button" onClick={() => setImportOpen(true)} className={`${SECONDARY_BTN_CLASS} gap-2 px-3.5 py-2`}>
        <ImportIcon />
        Import
      </button>
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
      />
    </>
  );
}
