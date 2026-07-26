import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import {
  getPrintAgentConfig,
  isPrintAgentEnabled,
  printViaAgent,
  savePrintAgentConfig,
} from "@/lib/print-agent";
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
 * Route a print job to QZ Tray, Centrix Print Agent, or the browser dialog.
 *
 * @returns {Promise<{ mode: "qz" | "agent" | "browser", ok: boolean, printer?: string }>}
 */
export async function dispatchPrintJob({
  html,
  copies = 1,
  jobType = "receipt",
  documentId = null,
  printWindow = null,
  windowFeatures = "width=420,height=720",
  agentConfig = getPrintAgentConfig(),
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
      } catch (error) {
        if (config.requireQz || config.fallbackToBrowser === false) {
          throw error;
        }
      }
    }
  }

  if (
    activeProvider === "centrix" ||
    (activeProvider === "browser" && isPrintAgentEnabled())
  ) {
    const config =
      activeProvider === "centrix" ? { ...agentConfig, enabled: true } : agentConfig;
    if (config.enabled || activeProvider === "centrix") {
      try {
        await printViaAgent({
          html,
          copies,
          jobType,
          documentId,
          config: { ...config, enabled: true },
        });
        return { mode: "agent", ok: true };
      } catch (error) {
        if (config.requireAgent || config.fallbackToBrowser === false) {
          throw error;
        }
      }
    }
  }

  for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
    openPrintWindow(html, windowFeatures);
  }

  return { mode: "browser", ok: true };
}

/** Keep provider + backend enabled flags in sync when the user picks a mode. */
export function applyLocalPrintProviderSelection(provider) {
  const next = saveLocalPrintProvider(provider);

  if (next === "qz") {
    saveQzTrayConfig({ ...getQzTrayConfig(), enabled: true });
    savePrintAgentConfig({ ...getPrintAgentConfig(), enabled: false });
  } else if (next === "centrix") {
    savePrintAgentConfig({ ...getPrintAgentConfig(), enabled: true });
    saveQzTrayConfig({ ...getQzTrayConfig(), enabled: false });
  } else {
    saveQzTrayConfig({ ...getQzTrayConfig(), enabled: false });
    savePrintAgentConfig({ ...getPrintAgentConfig(), enabled: false });
  }

  return next;
}
