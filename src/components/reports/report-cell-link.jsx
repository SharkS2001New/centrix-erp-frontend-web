"use client";

import Link from "next/link";
import { formatReportCell } from "@/lib/reports/format";
import { reportCellHref } from "@/lib/reports/report-entity-links";

/**
 * @param {{
 *   columnKey: string,
 *   row: Record<string, unknown>,
 *   value: unknown,
 *   link?: import("@/lib/reports/report-entity-links").ReportEntityLink,
 * }} props
 */
export function ReportCellLink({ columnKey, row, value, link }) {
  const href = reportCellHref(columnKey, row, link);
  const display = formatReportCell(columnKey, value, undefined, row);

  if (!href || display === "—") {
    return display;
  }

  return (
    <Link href={href} className="font-medium text-[#185FA5] hover:underline">
      {display}
    </Link>
  );
}
