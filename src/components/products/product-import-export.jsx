"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useBackgroundTasks } from "@/contexts/background-task-context";
import {
  PRODUCT_CATALOG_EXPORT_COLUMNS,
  queueReportExport,
  serializeExportMeta,
} from "@/lib/report-export-api";
import { downloadExcelFromRows, readExcelFile } from "@/lib/spreadsheet";
import { reportPrintedAt } from "@/lib/reports/export";

const SAMPLE_HEADERS = [
  "product_code",
  "product_name",
  "subcategory_id",
  "unit_id",
  "unit_price",
  "last_cost_price",
  "discount_type",
  "discount_percentage",
  "discount_value",
  "product_weight",
  "stock_in_shop",
  "stock_in_store",
  "reorder_point",
  "supplier_id",
  "vat_id",
  "sell_on_retail",
];

const SAMPLE_ROW = [
  "SKU-001",
  "Sample product",
  "1",
  "1",
  "100",
  "80",
  "percentage",
  "0",
  "0",
  "",
  "0",
  "0",
  "0",
  "",
  "1",
  "false",
];

function ImportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.match(/("([^"]|"")*"|[^,]*)/g) ?? [];
    const row = {};
    headers.forEach((header, i) => {
      let val = (values[i] ?? "").trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      row[header] = val;
    });
    return row;
  });
}

async function parseSpreadsheet(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return parseCsv(text);
  }
  return readExcelFile(file);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportModal({ open, onClose, totalCount, exportSearchParams }) {
  const { runBackgroundTask } = useBackgroundTasks();
  const [error, setError] = useState(null);

  if (!open) return null;

  function runCatalogExport(format) {
    setError(null);
    const stamp = new Date().toISOString().slice(0, 10);
    const exportFormat = format === "pdf" ? "pdf" : "xlsx";
    onClose();
    void runBackgroundTask(
      () =>
        queueReportExport({
          format: exportFormat,
          source: "product_catalog",
          filename: `products-${stamp}`,
          columns: PRODUCT_CATALOG_EXPORT_COLUMNS,
          meta: serializeExportMeta({
            title: "Products",
            subtitle: "Product catalogue export",
            printedAt: reportPrintedAt(),
          }),
          search_params: exportSearchParams?.() ?? {},
        }),
      {
        label: "Exporting products",
        message: "Started fetching…",
        downloadOnComplete: true,
        downloadFilename: `products-${stamp}.${exportFormat === "pdf" ? "pdf" : "xlsx"}`,
      },
    ).catch(() => {
      /* Global background-task notice handles errors and success */
    });
  }

  const countLabel = totalCount ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="theme-panel theme-modal w-full max-w-sm rounded-xl border p-5 shadow-xl">
        <h2 className="text-[15px] font-medium text-slate-900">Export products</h2>
        <p className="mt-2 text-sm text-slate-500">
          Export all {countLabel.toLocaleString()} product{countLabel === 1 ? "" : "s"} matching your
          current filters.
        </p>
        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={countLabel === 0}
            onClick={() => runCatalogExport("excel")}
            className="rounded-lg bg-[#185FA5] py-2.5 text-sm font-medium text-white hover:bg-[#144f8a] disabled:opacity-50"
          >
            Excel spreadsheet (.xlsx)
          </button>
          <button
            type="button"
            disabled={countLabel === 0}
            onClick={() => runCatalogExport("pdf")}
            className="rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            PDF (print)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg py-2 text-sm text-slate-500 hover:text-slate-700"
          >
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
  const { runQueuedTask, overlayNode } = useQueuedTask("Please wait while products are imported…");

  if (!open) return null;

  function downloadSample(format) {
    const row = SAMPLE_ROW.join(",");
    const csv = `${SAMPLE_HEADERS.join(",")}\n${row}\n`;
    if (format === "csv") {
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "products-import-sample.csv");
      return;
    }
    void downloadExcelFromRows("products-import-sample.xlsx", "Sample", [SAMPLE_HEADERS, SAMPLE_ROW]);
  }

  function normalizeRow(row) {
    const body = {
      product_code: String(row.product_code ?? "").trim(),
      product_name: String(row.product_name ?? "").trim(),
      subcategory_id: Number(row.subcategory_id),
      unit_id: Number(row.unit_id),
      unit_price: Number(row.unit_price),
    };
    const optional = [
      "last_cost_price",
      "discount_type",
      "discount_percentage",
      "discount_value",
      "product_weight",
      "stock_in_shop",
      "stock_in_store",
      "reorder_point",
      "supplier_id",
      "vat_id",
    ];
    for (const key of optional) {
      const val = row[key];
      if (val !== "" && val != null) body[key] = val;
    }
    const sell = String(row.sell_on_retail ?? "").toLowerCase();
    if (sell === "true" || sell === "1" || sell === "yes") body.sell_on_retail = true;
    if (sell === "false" || sell === "0" || sell === "no") body.sell_on_retail = false;
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
        if (!row.product_code && !row.product_name) continue;
        const body = normalizeRow(row);
        if (!body.product_code || !body.product_name || !body.subcategory_id || !body.unit_id) {
          throw new Error(`Row "${row.product_code || row.product_name}" is missing required fields.`);
        }
        normalizedRows.push(body);
      }
      if (!normalizedRows.length) throw new Error("The file has no valid product rows.");

      const res = await runQueuedTask(
        () =>
          apiRequest("/products/import-batch", {
            method: "POST",
            body: { rows: normalizedRows },
          }),
        {
          message: `Please wait while ${normalizedRows.length} product(s) are imported…`,
          onProgress: (task) => {
            setImportProgress(Number(task.progress ?? 0));
          },
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
            <h2 className="text-[15px] font-medium text-slate-900">Import products</h2>
        <p className="mt-2 text-sm text-slate-500">
          Upload a CSV or Excel file. Stock columns are in base pieces (same as the database).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadSample("csv")}
            className="text-sm font-medium text-[#185FA5] hover:underline"
          >
            Download sample CSV
          </button>
          <span className="text-slate-300">·</span>
          <button
            type="button"
            onClick={() => downloadSample("xlsx")}
            className="text-sm font-medium text-[#185FA5] hover:underline"
          >
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
        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {result ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p>{result.created} product{result.created === 1 ? "" : "s"} imported.</p>
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

export function ProductImportExport({ totalCount, exportSearchParams, onImported }) {
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setImportOpen(true)}
        className={`${SECONDARY_BTN_CLASS} gap-2 px-3.5 py-2`}
      >
        <ImportIcon />
        Import
      </button>
      <button
        type="button"
        onClick={() => setExportOpen(true)}
        className={`${SECONDARY_BTN_CLASS} gap-2 px-3.5 py-2`}
      >
        <ExportIcon />
        Export
      </button>
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={onImported}
      />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        totalCount={totalCount}
        exportSearchParams={exportSearchParams}
      />
    </>
  );
}
