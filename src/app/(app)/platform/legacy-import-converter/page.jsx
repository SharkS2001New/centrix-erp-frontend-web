"use client";

import { useRef, useState } from "react";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { apiUploadFilesForBlob, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";

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

export default function LegacyImportConverterPage() {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [converting, setConverting] = useState(false);

  async function handleConvert() {
    if (!files.length) {
      notifyError("Select at least one LightStores SQL dump file.");
      return;
    }

    setConverting(true);
    try {
      const blob = await apiUploadFilesForBlob("/admin/legacy-import-converter/convert", files);
      downloadBlob(blob, "centrix-import-csv.zip");
      notifySuccess("Centrix import CSVs downloaded.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
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
          Upload one or more table dumps from the old LightStores system (e.g.{" "}
          <code className="rounded bg-slate-100 px-1">superdb_product.sql</code>). The converter
          parses <code className="rounded bg-slate-100 px-1">INSERT INTO</code> rows and produces a ZIP
          with VAT, category, UOM, route, supplier, customer, product, and retail package CSVs matching
          Centrix advanced import templates.
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Typical dump files</p>
          <ul className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
            {EXPECTED_FILES.map((name) => (
              <li key={name} className="font-mono text-xs">{name}</li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <label className="block text-sm font-medium text-slate-700">SQL dump files</label>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".sql,text/plain"
            className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            disabled={converting}
          />
          {files.length > 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              {files.length} file{files.length === 1 ? "" : "s"} selected:{" "}
              {files.map((f) => f.name).join(", ")}
            </p>
          ) : null}
        </div>

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

        <div className="mt-5 flex flex-wrap gap-2">
          <PrimaryButton type="button" onClick={handleConvert} disabled={converting || !files.length}>
            {converting ? "Converting…" : "Convert and download ZIP"}
          </PrimaryButton>
          {files.length > 0 ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setFiles([]);
                if (inputRef.current) inputRef.current.value = "";
              }}
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
