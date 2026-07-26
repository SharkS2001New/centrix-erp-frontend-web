import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import {
  getLocalPrintProvider,
  saveLocalPrintProvider,
} from "@/lib/local-print-provider";
import {
  getPrintAgentConfig,
  isPrintAgentEnabled,
  printViaAgent,
  savePrintAgentConfig,
} from "@/lib/print-agent";
import {
  getQzTrayConfig,
  isQzTrayEnabled,
  printViaQzTray,
  saveQzTrayConfig,
} from "@/lib/qz-tray-print";

/**
 * Route a print job to Centrix Print Agent, QZ Tray, or the browser dialog (org settings).
 * Silent providers fall back to the browser dialog when offline.
 *
 * @returns {Promise<{ mode: "agent" | "qz" | "browser", ok: boolean, printer?: string, jobId?: string }>}
 */
export async function dispatchPrintJob({
  html,
  copies = 1,
  jobType = "receipt",
  printWindow = null,
  windowFeatures = "width=420,height=720",
  qzConfig = getQzTrayConfig(),
  agentConfig = getPrintAgentConfig(),
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

  if (activeProvider === "agent" || (activeProvider === "browser" && isPrintAgentEnabled())) {
    const config = activeProvider === "agent" ? { ...agentConfig, enabled: true } : agentConfig;
    if (config.enabled || activeProvider === "agent") {
      try {
        const result = await printViaAgent({
          html,
          copies,
          jobType,
          config: { ...config, enabled: true },
        });
        return {
          mode: "agent",
          ok: true,
          printer: config.printerName || undefined,
          jobId: result.jobId ?? undefined,
        };
      } catch {
        // Agent missing/offline → browser dialog (fallback always on in org settings)
      }
    }
  }

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
    savePrintAgentConfig({ ...getPrintAgentConfig(), enabled: false });
  } else if (next === "agent") {
    savePrintAgentConfig({ ...getPrintAgentConfig(), enabled: true });
    saveQzTrayConfig({ ...getQzTrayConfig(), enabled: false });
  } else {
    saveQzTrayConfig({ ...getQzTrayConfig(), enabled: false });
    savePrintAgentConfig({ ...getPrintAgentConfig(), enabled: false });
  }

  // Re-assert provider — save*Config must not clobber agent/qz when disabling the other.
  return saveLocalPrintProvider(next);
}
