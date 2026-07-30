import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import {
  injectPrintDocumentBaseline,
  prepareThermalPrintHtml,
} from "@/lib/print-document-baseline";
import {
  getLocalPrintProvider,
  saveLocalPrintProvider,
} from "@/lib/local-print-provider";
import {
  checkPrintAgentHealth,
  getPrintAgentConfig,
  isPrintAgentEnabled,
  printViaAgent,
  savePrintAgentConfig,
} from "@/lib/print-agent";
import { saveQzTrayConfig, getQzTrayConfig } from "@/lib/qz-tray-print";

function preparePrintHtml(html, jobType = "receipt") {
  if (jobType === "receipt") {
    return prepareThermalPrintHtml(html);
  }
  return injectPrintDocumentBaseline(html);
}

/**
 * Route a print job to Centrix Print Agent or the browser dialog (org settings).
 * Agent falls back to the browser dialog when offline.
 *
 * @returns {Promise<{ mode: "agent" | "browser", ok: boolean, printer?: string, jobId?: string }>}
 */
export async function dispatchPrintJob({
  html,
  copies = 1,
  jobType = "receipt",
  printWindow = null,
  windowFeatures = "width=420,height=720",
  agentConfig = getPrintAgentConfig(),
  provider = getLocalPrintProvider(),
}) {
  if (!html?.trim()) {
    return { mode: "browser", ok: false };
  }

  const preparedHtml = preparePrintHtml(html, jobType);

  if (printWindow) {
    fillPrintWindow(printWindow, preparedHtml, { skipBaseline: true });
    return { mode: "browser", ok: true };
  }

  const activeProvider = provider;

  if (activeProvider === "agent" || (activeProvider === "browser" && isPrintAgentEnabled())) {
    const config = activeProvider === "agent" ? { ...agentConfig, enabled: true } : agentConfig;
    if (config.enabled || activeProvider === "agent") {
      try {
        // Quick ping first — avoid an 8s print timeout when the agent is not running.
        const health = await checkPrintAgentHealth(
          { ...config, enabled: true },
          { quick: true },
        );
        if (health?.ok) {
          const result = await printViaAgent({
            html: preparedHtml,
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
        }
      } catch {
        // Agent missing/offline → browser dialog (fallback always on in org settings)
      }
    }
  }

  for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
    openPrintWindow(preparedHtml, windowFeatures, { skipBaseline: true });
  }

  return { mode: "browser", ok: true };
}

/** Keep in-memory org cache in sync when the admin picks a mode (persist via Save). */
export function applyLocalPrintProviderSelection(provider) {
  const next = saveLocalPrintProvider(provider);

  if (next === "agent") {
    savePrintAgentConfig({ ...getPrintAgentConfig(), enabled: true });
    saveQzTrayConfig({ ...getQzTrayConfig(), enabled: false });
  } else {
    saveQzTrayConfig({ ...getQzTrayConfig(), enabled: false });
    savePrintAgentConfig({ ...getPrintAgentConfig(), enabled: false });
  }

  // Re-assert provider — save*Config must not clobber agent when disabling the other.
  return saveLocalPrintProvider(next);
}
