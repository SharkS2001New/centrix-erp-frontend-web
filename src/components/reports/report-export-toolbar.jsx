"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { FILTER_RESET_BTN_CLASS } from "@/components/catalog/catalog-shared";
import {
  buildReportMeta,
  downloadReportCsv,
  downloadReportExcel,
  normalizeExportColumns,
  printReportTable,
  reportPrintedAt,
  slugifyReportFilename,
} from "@/lib/reports/export";

/**
 * @param {object} props
 * @param {string} props.filename
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {Array<{ key?: string, label: string, accessor?: Function, align?: string }>} props.columns
 * @param {() => Promise<object[]> | object[]} props.getRows
 * @param {object} [props.meta]
 * @param {object} [props.footerRow]
 * @param {boolean} [props.disabled]
 * @param {(rows: object[], meta: object) => void | Promise<void>} [props.onPrint]
 */
export function ReportExportToolbar({
  filename,
  title,
  subtitle = "",
  columns,
  getRows,
  meta = {},
  footerRow = null,
  disabled = false,
  onPrint = null,
}) {
  const { organization } = useAuth();
  const [busy, setBusy] = useState(false);

  const organizationName =
    organization?.org_name ?? organization?.name ?? meta.organizationName ?? "";

  async function runExport(kind) {
    if (!columns?.length) return;
    setBusy(true);
    try {
      const rows = await getRows();
      const normalized = normalizeExportColumns(columns);
      const fullMeta = buildReportMeta({
        organizationName,
        title,
        subtitle,
        printedAt: reportPrintedAt(),
        ...meta,
      });
      const baseName = slugifyReportFilename(filename || title);

      if (kind === "print") {
        if (onPrint) {
          await onPrint(rows, fullMeta);
        } else {
          printReportTable({ meta: fullMeta, columns: normalized, rows, footerRow });
        }
        return;
      }
      if (kind === "excel") {
        await downloadReportExcel(`${baseName}.xlsx`, title, fullMeta, normalized, rows);
        return;
      }
      downloadReportCsv(`${baseName}.csv`, fullMeta, normalized, rows);
    } finally {
      setBusy(false);
    }
  }

  const blocked = disabled || busy || !columns?.length;

  return (
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
  );
}
