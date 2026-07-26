import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import {
  getLocalPrintProvider,
  saveLocalPrintProvider,
} from "@/lib/local-print-provider";
import {
  getQzTrayConfig,
  isQzTrayEnabled,
  printViaQzTray,
  saveQzTrayConfig,
} from "@/lib/qz-tray-print";

/**
 * Route a print job to QZ Tray or the browser dialog (org settings).
 * If QZ Tray is selected but not installed/reachable, falls back to the browser print dialog.
 *
 * @returns {Promise<{ mode: "qz" | "browser", ok: boolean, printer?: string }>}
 */
export async function dispatchPrintJob({
  html,
  copies = 1,
  jobType = "receipt",
  printWindow = null,
  windowFeatures = "width=420,height=720",
  qzConfig = getQzTrayConfig(),
  provider = getLocalPrintProvider(),
}) {
  if (!html?.trim()) {
    return { mode: "browser", ok: false };
  }

  if (printWindow) {
    fillPrintWindow(printWindow, html);
    return { mode: "browser", ok: true };
  }

  const activeProvider = provider;

  if (activeProvider === "qz" || (activeProvider === "browser" && isQzTrayEnabled())) {
    const config = activeProvider === "qz" ? { ...qzConfig, enabled: true } : qzConfig;
    if (config.enabled || activeProvider === "qz") {
      try {
        const result = await printViaQzTray({
          html,
          copies,
          jobType,
          config: { ...config, enabled: true },
        });
        return { mode: "qz", ok: true, printer: result.printer };
      } catch {
        // QZ Tray missing/offline → browser dialog
      }
    }
  }

  for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
    openPrintWindow(html, windowFeatures);
  }

  return { mode: "browser", ok: true };
}

/** Keep in-memory org cache in sync when the admin picks a mode (persist via Save). */
export function applyLocalPrintProviderSelection(provider) {
  const next = saveLocalPrintProvider(provider);

  if (next === "qz") {
    saveQzTrayConfig({ ...getQzTrayConfig(), enabled: true });
  } else {
    saveQzTrayConfig({ ...getQzTrayConfig(), enabled: false });
  }

  return next;
}
