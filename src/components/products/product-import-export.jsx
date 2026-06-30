"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { resolveImportTaskError } from "@/lib/background-task-errors";
import { formatImportBatchProgress, prepareImportRows, runBatchedQueuedImport, summarizeImportFailures } from "@/lib/import-batch";
import { canUseAdvancedDataImport } from "@/lib/advanced-data-import";
import { ImportProgressLine, ImportResultPanel } from "@/components/catalog/import-feedback";
import { useAuth } from "@/contexts/auth-context";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useBackgroundTasks } from "@/contexts/background-task-context";
import {
  PRODUCT_CATALOG_EXPORT_COLUMNS,
  queueReportExport,
  serializeExportMeta,
} from "@/lib/report-export-api";
import { downloadExcelFromRows } from "@/lib/spreadsheet";
import { reportPrintedAt } from "@/lib/reports/export";
import { downloadBlob, parseSpreadsheet } from "@/components/catalog/catalog-import-export-shared";
import { mapImportHeaders } from "@/components/catalog/catalog-data-import";

/** Centrix product import columns (name-based linking; IDs also accepted). */
const PRODUCT_IMPORT_COLUMNS = [
  { key: "product_code", label: "Product code" },
  { key: "product_name", label: "Product name" },
  { key: "category_name", label: "Category" },
  { key: "subcategory_name", label: "Subcategory" },
  { key: "subcategory_id", label: "Subcategory ID" },
  { key: "measure_name", label: "Unit" },
  { key: "unit_id", label: "Unit ID" },
  { key: "uom_label", label: "Unit of measure" },
  { key: "unit_price", label: "Unit price" },
  { key: "last_cost_price", label: "Cost price" },
  { key: "discount_type", label: "Discount type" },
  { key: "discount_percentage", label: "Discount percentage" },
  { key: "discount_value", label: "Discount value" },
  { key: "product_weight", label: "Product weight" },
  { key: "stock_in_shop", label: "Shop stock" },
  { key: "stock_in_store", label: "Store stock" },
  { key: "reorder_point", label: "Reorder point" },
  { key: "supplier_name", label: "Supplier" },
  { key: "supplier_id", label: "Supplier ID" },
  { key: "vat_code", label: "VAT code" },
  { key: "vat_id", label: "VAT ID" },
  { key: "sell_on_retail", label: "Sell on retail" },
];

const SAMPLE_HEADERS = [
  "product_code",
  "product_name",
  "category_name",
  "subcategory_name",
  "measure_name",
  "unit_price",
  "last_cost_price",
  "discount_type",
  "discount_percentage",
  "discount_value",
  "product_weight",
  "stock_in_shop",
  "stock_in_store",
  "reorder_point",
  "supplier_name",
  "vat_code",
  "sell_on_retail",
];

const SAMPLE_ROW = [
  "SKU-001",
  "Sample product",
  "GROCERY",
  "FLOUR",
  "CARTON",
  "100",
  "80",
  "percentage",
  "0",
  "0",
  "",
  "0",
  "0",
  "0",
  "Sample Supplier Ltd",
  "A",
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

function ExportModal({ open, onClose, totalCount, exportSearchParams }) {
  const { runBackgroundTask } = useBackgroundTasks();
  const [error, setError] = useState(null);

  if (!open) return null;

  function runCatalogExport(format) {
    setError(null);
    const stamp = new Date().toISOString().slice(0, 10);
    const exportFormat = format === "pdf" ? "pdf" : "csv";
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
        downloadFilename: `products-${stamp}.${exportFormat === "pdf" ? "pdf" : exportFormat}`,
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
      unit_price: Number(row.unit_price ?? 0),
    };

    const subcategoryId = Number(row.subcategory_id);
    if (Number.isFinite(subcategoryId) && subcategoryId > 0) {
      body.subcategory_id = subcategoryId;
    } else {
      const subcategoryName = String(row.subcategory_name ?? "").trim();
      if (subcategoryName) body.subcategory_name = subcategoryName;
      const categoryName = String(row.category_name ?? "").trim();
      if (categoryName) body.category_name = categoryName;
    }

    const unitId = Number(row.unit_id);
    if (Number.isFinite(unitId) && unitId > 0) {
      body.unit_id = unitId;
    } else {
      const measureName = String(row.measure_name ?? row.uom_label ?? "").trim();
      if (measureName) body.measure_name = measureName;
    }

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
      "supplier_name",
      "vat_code",
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

  function hasResolvedSubcategory(body) {
    return (Number(body.subcategory_id) > 0) || Boolean(body.subcategory_name);
  }

  function hasResolvedUnit(body) {
    return (Number(body.unit_id) > 0) || Boolean(body.measure_name);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setImportProgress(null);
    setImporting(true);
    try {
      const rows = mapImportHeaders(await parseSpreadsheet(file), PRODUCT_IMPORT_COLUMNS);
      if (!rows.length) throw new Error("The file has no data rows.");

      const { rows: normalizedRows, failures: prepFailures } = prepareImportRows({
        rows,
        mapRow: (row) => {
          if (!row.product_code && !row.product_name) return null;
          const body = normalizeRow(row);
          if (!body.product_name || !hasResolvedSubcategory(body) || !hasResolvedUnit(body)) {
            throw new Error(
              `Row "${row.product_code || row.product_name}" is missing required fields (product name, subcategory, unit).`,
            );
          }
          return body;
        },
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
        throw new Error("The file has no valid product rows.");
      }

      const res = await runBatchedQueuedImport({
        rows: normalizedRows,
        runQueuedTask,
        importChunk: (chunk) =>
          apiRequest("/products/import-batch", {
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
        {importing ? <ImportProgressLine progress={importProgress} /> : null}
        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <ImportResultPanel result={result} entityLabel="product" />
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
  const { user, organization, capabilities } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const showImport = canUseAdvancedDataImport({
    user,
    organization,
    capabilities,
    permission: "products.manage",
    page: "products",
  });

  return (
    <>
      {showImport ? (
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className={`${SECONDARY_BTN_CLASS} gap-2 px-3.5 py-2`}
        >
          <ImportIcon />
          Import
        </button>
      ) : null}
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
