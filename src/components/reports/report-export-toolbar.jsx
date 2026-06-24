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
import { buildReportExportRequest, queueReportExport } from "@/lib/report-export-api";

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
 *   legacyMerge?: boolean,
 * }} [props.exportSource]
 * @param {object} [props.meta]
 * @param {object} [props.footerRow]
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
  disabled = false,
}) {
  const { organization } = useAuth();
  const { runBackgroundTask, busy: backgroundBusy } = useBackgroundTasks();
  const [busy, setBusy] = useState(false);

  const organizationName =
    organization?.org_name ?? organization?.name ?? meta.organizationName ?? "";

  async function runExport(kind) {
    if (!columns?.length) return;
    setBusy(true);

    const exportFormat = kind === "print" ? "pdf" : kind;
    const label =
      exportFormat === "pdf"
        ? `Preparing PDF for ${title}`
        : exportFormat === "csv"
          ? `Preparing CSV for ${title}`
          : `Preparing Excel for ${title}`;

    try {
      const fullMeta = buildReportMeta({
        organizationName,
        title,
        subtitle,
        printedAt: reportPrintedAt(),
        ...meta,
      });

      const body = buildReportExportRequest({
        format: exportFormat,
        filename: slugifyReportFilename(filename || title),
        title,
        columns: normalizeExportColumns(columns).map((col) => ({
          key: col.key,
          label: col.label,
          align: columns.find((c) => (c.key ?? c.label) === col.key)?.align,
        })),
        meta: fullMeta,
        footerRow,
        organizationName,
        exportSource,
        getRows: exportSource ? null : getRows,
      });

      await runBackgroundTask(
        () => queueReportExport(body, exportSource ? null : getRows),
        {
          label,
          message: "Started fetching…",
          timeoutMs: 1_800_000,
          downloadOnComplete: true,
          downloadFilename: `${slugifyReportFilename(filename || title)}.${exportFormat === "pdf" ? "pdf" : exportFormat === "csv" ? "csv" : "xlsx"}`,
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
          disabled={blocked}
          onClick={() => void runExport("print")}
          className={`${FILTER_RESET_BTN_CLASS} shadow-sm`}
        >
          {busy ? "Preparing…" : "Print / PDF"}
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() => void runExport("excel")}
          className={`${FILTER_RESET_BTN_CLASS} shadow-sm`}
        >
          Excel
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
    </div>
  );
}
