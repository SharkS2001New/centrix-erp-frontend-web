"use client";

import { useMemo } from "react";
import { buildLoadingListHtml } from "@/components/fulfillment/loading-list-print";
import { resolveLoadingSheetFooterLines } from "@/lib/loading-sheet-print-settings";

/**
 * On-screen preview of the loading list print layout (same HTML as print).
 */
export function LoadingListDocumentPreview({
  loadingList,
  organization = null,
  generalSettings = null,
  organizationName,
  printSettings = null,
  documentFooterText = null,
  trip = null,
  financialSummary = null,
  printedBy = "Preview",
  distributionEnabled = false,
  className = "h-[34rem] w-full rounded-lg border border-[var(--theme-border)] bg-white shadow-inner",
}) {
  const html = useMemo(
    () =>
      buildLoadingListHtml({
        organization,
        generalSettings,
        organizationName,
        loadingList,
        trip,
        financialSummary,
        printSettings,
        documentFooterText,
        footerLines: resolveLoadingSheetFooterLines(printSettings ?? {}),
        printedBy,
        distributionEnabled,
      }),
    [
      distributionEnabled,
      documentFooterText,
      financialSummary,
      generalSettings,
      loadingList,
      organization,
      organizationName,
      printSettings,
      printedBy,
      trip,
    ],
  );

  if (!loadingList) return null;

  return (
    <iframe
      title="Loading list preview"
      srcDoc={html}
      className={className}
    />
  );
}
