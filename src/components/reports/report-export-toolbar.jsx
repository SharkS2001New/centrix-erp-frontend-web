"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useBackgroundTasks } from "@/contexts/background-task-context";
import { FILTER_RESET_BTN_CLASS } from "@/components/catalog/catalog-shared";
import {
  buildReportMeta,
  normalizeExportColumns,
  reportPrintedAt,
  slugifyReportFilename,
} from "@/lib/reports/export";
import { resolveReportBranding } from "@/lib/reports/report-branding";
import { buildReportExportRequest, queueReportExport } from "@/lib/report-export-api";
import { EXPORT_EMPTY_ROWS_MESSAGE } from "@/lib/background-task-errors";
import { canExportPdf, PDF_EXPORT_MAX_ROWS } from "@/lib/report-export-limits";

/**
 * @param {object} props
 * @param {string} props.filename
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {Array<{ key?: string, label: string, accessor?: Function, align?: string }>} props.columns
 * @param {() => Promise<object[]> | object[]} [props.getRows]
 * @param {{
 *   source?: string,
 *   path?: string,
 *   searchParams?: Record<string, unknown>,
 * }} [props.exportSource]
 * @param {object} [props.meta]
 * @param {object} [props.footerRow]
 * @param {number} [props.estimatedRowCount]
 * @param {boolean} [props.disabled]
 */
export function ReportExportToolbar({
  filename,
  title,
  subtitle = "",
  columns,
  getRows,
  exportSource = null,
  meta = {},
  footerRow = null,
  estimatedRowCount = null,
  disabled = false,
}) {
  const { organization, generalSettings } = useAuth();
  const { runBackgroundTask, busy: backgroundBusy } = useBackgroundTasks();
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState(null);

  const pdfAllowed = canExportPdf(estimatedRowCount);

  const organizationName =
    organization?.org_name ?? organization?.name ?? meta.organizationName ?? "";
  const branding = resolveReportBranding({ organization, generalSettings: generalSettings() });

  async function runExport(kind) {
    if (!columns?.length) return;
    const exportFormat = kind === "print" ? "pdf" : kind;
    if ((exportFormat === "pdf" || kind === "print") && !pdfAllowed) {
      setExportError(
        `PDF is limited to ${PDF_EXPORT_MAX_ROWS.toLocaleString()} rows. Use CSV for this report.`,
      );
      return;
    }
    setBusy(true);
    setExportError(null);
    const label =
      exportFormat === "pdf"
        ? `Preparing PDF for ${title}`
        : `Preparing CSV for ${title}`;

    try {
      const fullMeta = buildReportMeta({
        organizationName: branding.organizationName || organizationName,
        title,
        subtitle,
        printedAt: reportPrintedAt(),
        ...meta,
      });

      if (!exportSource && getRows) {
        const previewRows = await getRows();
        if (!Array.isArray(previewRows) || previewRows.length === 0) {
          setExportError(EXPORT_EMPTY_ROWS_MESSAGE);
          return;
        }
      }

      const body = buildReportExportRequest({
        format: exportFormat,
        filename: slugifyReportFilename(filename || title),
        title,
        columns: normalizeExportColumns(columns).map((col) => ({
          key: col.key,
          label: col.label,
          align: columns.find((c) => (c.key ?? c.label) === col.key)?.align,
          ...(col.printAsRow ? { print_as_row: true } : {}),
        })),
        meta: fullMeta,
        footerRow,
        organizationName: branding.organizationName || organizationName,
        exportSource: exportSource
          ? { ...exportSource, estimatedRowCount }
          : null,
        getRows: exportSource ? null : getRows,
      });

      await runBackgroundTask(
        () => queueReportExport(body, exportSource ? null : getRows),
        {
          label,
          message: "Started fetching…",
          timeoutMs: 1_800_000,
          downloadOnComplete: true,
          downloadFilename: `${slugifyReportFilename(filename || title)}.${exportFormat === "pdf" ? "pdf" : "csv"}`,
        },
      );
    } catch {
      /* Global background-task notice handles errors and success */
    } finally {
      setBusy(false);
    }
  }

  const blocked = disabled || busy || backgroundBusy || !columns?.length;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={blocked || !pdfAllowed}
          title={
            !pdfAllowed
              ? `PDF supports up to ${PDF_EXPORT_MAX_ROWS.toLocaleString()} rows`
              : undefined
          }
          onClick={() => void runExport("print")}
          className={`${FILTER_RESET_BTN_CLASS} shadow-sm disabled:opacity-50`}
        >
          {busy ? "Preparing…" : "Print / PDF"}
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() => void runExport("csv")}
          className={`${FILTER_RESET_BTN_CLASS} shadow-sm`}
        >
          CSV
        </button>
      </div>
      {exportError ? <p className="max-w-xs text-right text-xs text-amber-800">{exportError}</p> : null}
      {!pdfAllowed && estimatedRowCount ? (
        <p className="max-w-xs text-right text-xs text-slate-500">
          ~{Number(estimatedRowCount).toLocaleString()} rows — use CSV for full export.
        </p>
      ) : null}
    </div>
  );
}
