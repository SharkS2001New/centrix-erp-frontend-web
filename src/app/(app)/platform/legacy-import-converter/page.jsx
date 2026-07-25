"use client";

import { useRef, useState } from "react";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { apiUploadFilesForBlob, apiFetchBlob, ApiError } from "@/lib/api";
import { waitForBackgroundTask, backgroundTaskErrorMessage } from "@/lib/background-task";
import { resolveImportTaskError } from "@/lib/background-task-errors";
import { notifyError, notifySuccess } from "@/lib/notify";
import { unzipTextFiles } from "@/lib/unzip-text";

const EXPECTED_FILES = [
  "superdb_vat_status.sql",
  "superdb_category.sql",
  "superdb_sub_category.sql",
  "superdb_uom.sql",
  "superdb_routes.sql",
  "superdb_suppliers.sql",
  "superdb_customer.sql",
  "superdb_product.sql",
  "superdb_retail_package_setting.sql",
];

const EXPECTED_SET = new Set(EXPECTED_FILES.map((n) => n.toLowerCase()));

const IMPORT_CSV_ORDER = [
  "vats-import.csv",
  "categories-import.csv",
  "subcategories-import.csv",
  "uoms-import.csv",
  "routes-import.csv",
  "suppliers-import.csv",
  "customers-import.csv",
  "products-import.csv",
  "retail-packages-import.csv",
];

function basename(path) {
  const parts = String(path || "").replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "";
}

function pickExpectedSqlFiles(fileList) {
  const all = Array.from(fileList ?? []);
  const byName = new Map();
  for (const file of all) {
    const name = basename(file.name).toLowerCase();
    if (!EXPECTED_SET.has(name)) continue;
    if (!byName.has(name)) byName.set(name, file);
  }
  const picked = EXPECTED_FILES.map((n) => byName.get(n.toLowerCase())).filter(Boolean);
  if (picked.length) return picked;

  // One full dump (or any .sql) — converter indexes every INSERT table inside the file.
  return all.filter((f) => basename(f.name).toLowerCase().endsWith(".sql"));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(content, filename) {
  downloadBlob(new Blob([content], { type: "text/csv;charset=utf-8" }), filename);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveConvertZip(files, onStatus) {
  onStatus?.("Uploading and converting…");
  const result = await apiUploadFilesForBlob(
    "/admin/legacy-import-converter/convert",
    files,
    "files",
    { sync: "1" },
  );

  if (result instanceof Blob) {
    return result;
  }

  if (result?.queued && result.task_id) {
    onStatus?.("Conversion queued — waiting for ZIP…");
    const task = await waitForBackgroundTask(String(result.task_id), {
      intervalMs: 1500,
      timeoutMs: 1_800_000,
      onProgress: (t) => {
        if (t?.status === "running") onStatus?.("Converting dumps…");
      },
    });

    if (task.status === "failed") {
      const message = resolveImportTaskError(
        { body: task, message: backgroundTaskErrorMessage(task) },
        backgroundTaskErrorMessage(task) || "Conversion failed.",
      );
      throw new ApiError(message, 422, task);
    }
    if (task.status === "cancelled") {
      throw new ApiError("Conversion was cancelled.", 422, task);
    }

    onStatus?.("Downloading ZIP…");
    try {
      return await apiFetchBlob(`/admin/legacy-import-converter/tasks/${result.task_id}/download`);
    } catch {
      return await apiFetchBlob(`/background-tasks/${result.task_id}/download`);
    }
  }

  throw new ApiError("Unexpected converter response.", 500, result);
}

export default function LegacyImportConverterPage() {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [converting, setConverting] = useState(false);
  const [status, setStatus] = useState("");
  const [skippedFolderCount, setSkippedFolderCount] = useState(0);

  function applyFileSelection(selected, { fromFolder = false } = {}) {
    if (fromFolder) {
      const picked = pickExpectedSqlFiles(selected);
      const skipped = Math.max(0, (selected?.length ?? 0) - picked.length);
      setSkippedFolderCount(skipped);
      setFiles(picked);
      if (!picked.length) {
        notifyError(
          "No SQL dump files found in that folder. Use a full LightStores .sql dump, or files named like superdb_product.sql.",
        );
      }
      return;
    }
    setSkippedFolderCount(0);
    setFiles(Array.from(selected ?? []));
  }

  async function runConvert({ downloadCsvs }) {
    if (!files.length) {
      notifyError("Select at least one LightStores SQL dump file (or a dump folder).");
      return;
    }

    setConverting(true);
    setStatus("");
    try {
      const zipBlob = await resolveConvertZip(files, setStatus);

      if (downloadCsvs) {
        setStatus("Extracting import CSVs…");
        const entries = await unzipTextFiles(zipBlob);
        const importFiles = IMPORT_CSV_ORDER.filter((name) => entries[name]);
        if (!importFiles.length) {
          throw new ApiError("ZIP did not contain Centrix import CSV files.", 422, null);
        }
        for (const name of importFiles) {
          downloadTextFile(entries[name], name);
          // Stagger downloads so the browser does not collapse them into one save.
          await sleep(180);
        }
        notifySuccess(`Downloaded ${importFiles.length} Centrix import CSV file(s).`);
      } else {
        downloadBlob(zipBlob, "centrix-import-csv.zip");
        notifySuccess("Centrix import CSV ZIP downloaded.");
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
      setStatus("");
    }
  }

  function clearSelection() {
    setFiles([]);
    setSkippedFolderCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }

  return (
    <CatalogPageShell
      title="Legacy data converter"
      subtitle="Upload LightStores MySQL dump files and download Centrix-ready import CSVs for tenant migration."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Legacy data converter" },
        ]}
      />

      <div className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Convert SQL dumps to import files</h2>
        <p className="mt-2 text-sm text-slate-600">
          Upload a <strong>single LightStores SQL dump</strong> (one file can contain many tables), or
          separate table dumps such as{" "}
          <code className="rounded bg-slate-100 px-1">superdb_product.sql</code>. The converter reads{" "}
          <code className="rounded bg-slate-100 px-1">INSERT INTO</code> rows and builds one Centrix
          import CSV per entity (VAT, categories, UOM, routes, suppliers, customers, products, retail
          packages). Catalog pages still import <strong>one CSV at a time</strong>.
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Optional per-table dump names (folder mode)
          </p>
          <ul className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
            {EXPECTED_FILES.map((name) => {
              const selected = files.some((f) => basename(f.name).toLowerCase() === name.toLowerCase());
              return (
                <li
                  key={name}
                  className={`font-mono text-xs ${selected ? "text-emerald-700" : "text-slate-700"}`}
                >
                  {selected ? "✓ " : ""}
                  {name}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">SQL dump file(s)</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".sql,text/plain"
              className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
              onChange={(e) => applyFileSelection(e.target.files)}
              disabled={converting}
            />
            <p className="mt-1 text-xs text-slate-500">
              Prefer one full database dump. Multiple table dumps also work.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Or import a dump folder</label>
            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
              onChange={(e) => applyFileSelection(e.target.files, { fromFolder: true })}
              disabled={converting}
            />
            <p className="mt-1 text-xs text-slate-500">
              Prefers <code>superdb_*.sql</code> when present; otherwise uses any <code>.sql</code>{" "}
              files in the folder.
            </p>
          </div>
        </div>

        {files.length > 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {files.length} dump file{files.length === 1 ? "" : "s"} ready:{" "}
            {files.map((f) => basename(f.name)).join(", ")}
            {skippedFolderCount > 0
              ? ` (${skippedFolderCount} other file${skippedFolderCount === 1 ? "" : "s"} in folder ignored)`
              : ""}
          </p>
        ) : null}

        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Recommended import order in Centrix</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>VAT rates</li>
            <li>Categories → Subcategories</li>
            <li>Units of measure</li>
            <li>Routes</li>
            <li>Suppliers</li>
            <li>Customers</li>
            <li>Products</li>
            <li>Retail package settings</li>
          </ol>
          <p className="mt-2 text-amber-800">
            Enable <strong>Advanced data import</strong> on the tenant organization before importing.
          </p>
        </div>

        {status ? <p className="mt-4 text-sm text-slate-600">{status}</p> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <PrimaryButton
            type="button"
            onClick={() => void runConvert({ downloadCsvs: false })}
            disabled={converting || !files.length}
          >
            {converting ? "Converting…" : "Convert and download ZIP"}
          </PrimaryButton>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            onClick={() => void runConvert({ downloadCsvs: true })}
            disabled={converting || !files.length}
          >
            {converting ? "Converting…" : "Convert and download CSVs"}
          </button>
          {files.length > 0 ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={clearSelection}
              disabled={converting}
            >
              Clear selection
            </button>
          ) : null}
        </div>
      </div>
    </CatalogPageShell>
  );
}
