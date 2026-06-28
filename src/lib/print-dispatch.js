import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import {
  getPrintAgentConfig,
  isPrintAgentEnabled,
  printViaAgent,
} from "@/lib/print-agent";

/**
 * Route a print job to the local print agent (silent) or browser print dialog.
 *
 * @returns {Promise<{ mode: "agent" | "browser", ok: boolean }>}
 */
export async function dispatchPrintJob({
  html,
  copies = 1,
  jobType = "receipt",
  documentId = null,
  printWindow = null,
  windowFeatures = "width=420,height=720",
  config = getPrintAgentConfig(),
}) {
  if (!html?.trim()) {
    return { mode: "browser", ok: false };
  }

  if (printWindow) {
    fillPrintWindow(printWindow, html);
    return { mode: "browser", ok: true };
  }

  if (isPrintAgentEnabled()) {
    try {
      await printViaAgent({
        html,
        copies,
        jobType,
        documentId,
        config,
      });
      return { mode: "agent", ok: true };
    } catch (error) {
      if (config.requireAgent || config.fallbackToBrowser === false) {
        throw error;
      }
      // Fall through to browser print when agent fails but fallback is allowed.
    }
  }

  for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
    openPrintWindow(html, windowFeatures);
  }

  return { mode: "browser", ok: true };
}
