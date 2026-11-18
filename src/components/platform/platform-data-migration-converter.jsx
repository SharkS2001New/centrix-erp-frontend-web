"use client";

import { useMemo, useState } from "react";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { downloadBlob, parseSpreadsheet } from "@/components/catalog/catalog-import-export-shared";
import {
  autoMapColumns,
  convertMigrationRows,
  parseMigrationDelimitedText,
  serializeImportCsv,
} from "@/lib/data-migration-converter";
import {
  DATA_MIGRATION_FORMAT_OPTIONS,
  DATA_MIGRATION_FORMATS,
} from "@/lib/data-migration-formats";

function isEntirelyEmptyRow(row) {
  return !Object.values(row ?? {}).some((value) => String(value ?? "").trim());
}

function isRequiredField(format, key) {
  return format.requiredKeys?.includes(key)
    || format.requiredAlternatives?.some((keys) => keys.includes(key));
}

export function PlatformDataMigrationConverter() {
  const [formatKey, setFormatKey] = useState("retail_products");
  const [pastedText, setPastedText] = useState("");
  const [sourceRows, setSourceRows] = useState([]);
  const [sourceHeaders, setSourceHeaders] = useState([]);
  const [sourceName, setSourceName] = useState("");
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  const format = DATA_MIGRATION_FORMATS[formatKey];
  const columns = format.columns;
  const convertedRows = useMemo(
    () => convertMigrationRows(sourceRows, formatKey, mapping),
    [formatKey, mapping, sourceRows],
  );
  const readyRows = useMemo(
    () => convertedRows.filter((row) => row.errors.length === 0),
    [convertedRows],
  );

  function loadRows(rows, name) {
    const nonEmptyRows = rows.filter((row) => !isEntirelyEmptyRow(row));
    if (!nonEmptyRows.length) {
      throw new Error("No data rows were found. Include a header row followed by data.");
    }

    const headers = Object.keys(nonEmptyRows[0] ?? {});
    if (!headers.length) {
      throw new Error("No column headings were found in the selected data.");
    }

    setSourceRows(nonEmptyRows);
    setSourceHeaders(headers);
    setSourceName(name);
    setMapping(autoMapColumns(headers, columns));
    setError("");
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setReading(true);
    setError("");
    try {
      const rows = file.name.toLowerCase().endsWith(".csv")
        ? parseMigrationDelimitedText(await file.text())
        : await parseSpreadsheet(file);
      loadRows(rows, file.name);
      setPastedText("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not read the selected file.");
    } finally {
      setReading(false);
      event.target.value = "";
    }
  }

  function handlePasteData() {
    try {
      loadRows(parseMigrationDelimitedText(pastedText), "Pasted data");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not read the pasted data.");
    }
  }

  function handleFormatChange(event) {
    const nextFormatKey = event.target.value;
    setFormatKey(nextFormatKey);
    if (sourceHeaders.length) {
      setMapping(autoMapColumns(sourceHeaders, DATA_MIGRATION_FORMATS[nextFormatKey].columns));
    }
  }

  function handleClear() {
    setPastedText("");
    setSourceRows([]);
    setSourceHeaders([]);
    setSourceName("");
    setMapping({});
    setError("");
  }

  function handleDownload() {
    const csv = `\ufeff${serializeImportCsv(
      readyRows.map((row) => row.values),
      columns,
    )}\r\n`;
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), format.fileName);
  }

  function handleDownloadTemplate() {
    const csv = `\ufeff${serializeImportCsv(
      [Object.fromEntries(columns.map(({ key }) => [key, ""]))],
      columns,
    )}\r\n`;
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), format.fileName.replace(".csv", "-template.csv"));
  }

  return (
    <CatalogPageShell
      title="Data migration converter"
      subtitle="Map spreadsheets from an old system to Centrix import formats and download ready-to-import CSV files."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Data migration converter" }]} />

      <div className="space-y-5">
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="block min-w-64 max-w-md flex-1 text-sm font-medium">
              <span className="theme-heading">Centrix data type</span>
              <select
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={formatKey}
                onChange={handleFormatChange}
              >
                {DATA_MIGRATION_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={handleDownloadTemplate}
            >
              Download Centrix template
            </button>
          </div>
          <p className="theme-subtext mt-3 text-sm">{format.description}</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="theme-heading text-base font-medium">Upload a spreadsheet</h2>
            <p className="theme-subtext mt-1 text-sm">Upload an .xlsx or .csv file with column headings in the first row.</p>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-4 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
              onChange={(event) => void handleFileChange(event)}
              disabled={reading}
            />
            {reading ? <p className="theme-subtext mt-2 text-sm">Reading spreadsheet…</p> : null}
          </section>

          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="theme-heading text-base font-medium">Paste data rows</h2>
            <p className="theme-subtext mt-1 text-sm">Copy cells from Excel or another spreadsheet, including the header row.</p>
            <textarea
              className="mt-3 min-h-32 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              placeholder={"Name\tPhone\tEmail\nSample name\t0712345678\tsample@example.com"}
            />
            <button
              type="button"
              className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={handlePasteData}
              disabled={!pastedText.trim() || reading}
            >
              Use pasted data
            </button>
          </section>
        </div>

        {error ? (
          <p role="alert" className="whitespace-pre-wrap rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        {sourceRows.length > 0 ? (
          <>
            <section className="theme-panel rounded-xl border p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="theme-heading text-base font-medium">Match source columns</h2>
                  <p className="theme-subtext mt-1 text-sm">
                    {sourceName} · {sourceRows.length.toLocaleString()} rows · {sourceHeaders.length} columns
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={handleClear}
                >
                  Clear data
                </button>
              </div>
              <p className="theme-subtext mt-3 text-sm">
                We match familiar headings automatically. Review the matches and choose a source column wherever needed.
                Required fields are marked; rows with missing or invalid values are excluded from the CSV.
              </p>
              <p className="theme-subtext mt-2 text-sm">
                Legacy-system IDs are not matched automatically. Prefer names for linked records, and map an ID only
                when it is already a valid Centrix ID.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {columns.map((column) => (
                  <label key={column.key} className="block rounded-lg border border-slate-200 p-3 text-sm">
                    <span className="theme-heading flex items-center justify-between gap-2 font-medium">
                      {column.label}
                      {isRequiredField(format, column.key) ? (
                        <span className="theme-subtext text-[11px] font-normal">
                          {format.requiredKeys?.includes(column.key) ? "required" : "required / alternative"}
                        </span>
                      ) : null}
                    </span>
                    <select
                      className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      value={mapping[column.key] ?? ""}
                      onChange={(event) =>
                        setMapping((current) => ({ ...current, [column.key]: event.target.value }))
                      }
                    >
                      <option value="">Not mapped</option>
                      {sourceHeaders.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="theme-panel overflow-hidden rounded-xl border shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                <div>
                  <h2 className="theme-heading text-base font-medium">Conversion preview</h2>
                  <p className="theme-subtext mt-1 text-sm">
                    {readyRows.length.toLocaleString()} ready · {(convertedRows.length - readyRows.length).toLocaleString()} rows needing fixes excluded
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleDownload}
                  disabled={!readyRows.length}
                >
                  Convert and download CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="theme-subtext bg-slate-50 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">Source row</th>
                      {format.previewFields.map(([key, label]) => <th key={key} className="px-4 py-3">{label}</th>)}
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convertedRows.slice(0, 10).map((row) => (
                      <tr key={row.rowNumber} className="border-t border-slate-100">
                        <td className="px-4 py-3">{row.rowNumber}</td>
                        {format.previewFields.map(([key]) => (
                          <td key={key} className="max-w-56 truncate px-4 py-3">{row.values[key] || "—"}</td>
                        ))}
                        <td className="px-4 py-3">
                          {row.errors.length ? (
                            <span className="text-xs text-amber-700">Check: {row.errors.join(", ")}</span>
                          ) : (
                            <span className="text-xs font-medium text-green-700">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {convertedRows.length > 10 ? (
                <p className="theme-subtext border-t border-slate-100 px-4 py-3 text-xs">
                  Showing the first 10 of {convertedRows.length.toLocaleString()} rows.
                </p>
              ) : null}
              {readyRows.length < convertedRows.length ? (
                <p className="theme-subtext border-t border-slate-100 px-4 py-3 text-xs">
                  Rows needing fixes are left out of the downloaded file. Fix their source data and convert again if needed.
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </CatalogPageShell>
  );
}
