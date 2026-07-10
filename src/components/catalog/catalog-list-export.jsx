"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { useBackgroundTasks } from "@/contexts/background-task-context";
import { queueReportExport, serializeExportMeta, buildReportExportRequest } from "@/lib/report-export-api";
import { reportPrintedAt } from "@/lib/reports/export";
import { ImportExportIcons } from "@/components/catalog/catalog-import-export-shared";

/**
 * Export-only toolbar button for paginated list pages (CSV, PDF).
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.filename]
 * @param {string} [props.apiPath]
 * @param {Array<{ key: string, label: string, align?: string }>} props.columns
 * @param {() => Record<string, unknown>} [props.getSearchParams]
 * @param {() => Promise<object[]>} [props.getInlineRows]
 * @param {number} [props.totalCount]
 * @param {boolean} [props.disabled]
 */
export function CatalogListExport({
  title,
  filename,
  apiPath,
  columns,
  getSearchParams,
  getInlineRows,
  totalCount = 0,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const { runBackgroundTask } = useBackgroundTasks();
  const { ExportIcon } = ImportExportIcons;

  function runExport(format) {
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = filename || title || "export";
    const exportFormat = format === "pdf" ? "pdf" : "csv";
    setOpen(false);
    void runBackgroundTask(
      () => {
        if (getInlineRows) {
          const body = buildReportExportRequest({
            format: exportFormat,
            filename: `${slug}-${stamp}`,
            title,
            columns,
            meta: {
              title,
              subtitle: `${title} export`,
              printedAt: reportPrintedAt(),
            },
            getRows: getInlineRows,
          });
          return queueReportExport(body, getInlineRows);
        }

        return queueReportExport({
          format: exportFormat,
          source: "api",
          path: apiPath,
          filename: `${slug}-${stamp}`,
          columns,
          meta: serializeExportMeta({
            title,
            subtitle: `${title} export`,
            printedAt: reportPrintedAt(),
          }),
          search_params: getSearchParams?.() ?? {},
          estimated_row_count: totalCount,
        });
      },
      {
        label: `Exporting ${title}`,
        message: "Started fetching…",
        downloadOnComplete: true,
        downloadFilename: `${slug}-${stamp}.${exportFormat === "pdf" ? "pdf" : exportFormat}`,
      },
    ).catch(() => {});
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || totalCount === 0}
        onClick={() => setOpen(true)}
        className={`${SECONDARY_BTN_CLASS} gap-2 px-3.5 py-2 disabled:opacity-50`}
      >
        <ExportIcon />
        Export
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="theme-panel theme-modal w-full max-w-sm rounded-xl border p-5 shadow-xl">
                <h2 className="text-[15px] font-medium text-slate-900">Export {title}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Export {Number(totalCount).toLocaleString()} record{totalCount === 1 ? "" : "s"} matching your
                  current filters.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => runExport("csv")}
                    className="rounded-lg bg-[#185FA5] py-2.5 text-sm font-medium text-white hover:bg-[#144f8a]"
                  >
                    CSV (.csv)
                  </button>
                  <button
                    type="button"
                    onClick={() => runExport("pdf")}
                    className="rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    PDF (print)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg py-2 text-sm text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
