import {
  fillPrintWindow,
  openBlankPrintWindow,
  printWindowFeatures,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";
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
  invalidatePrintAgentHealth,
  isPrintAgentEnabled,
  isPrintAgentRecentlyHealthy,
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
 * Prefer Centrix Print Agent for every ERP document when the agent is enabled.
 * Browser print dialog is only the offline / popup fallback.
 */
export function shouldUsePrintAgentForDocument(documentType = "receipt") {
  if (!isPrintAgentEnabled()) return false;
  // "both" means dual print (receipt + invoice) — each half decides separately.
  if (documentType == null || documentType === "both") return false;
  return true;
}

/**
 * Pre-open a blank browser print window only when needed (popup-blocker safe).
 * Returns null when Centrix Print Agent will handle the job — passing a
 * printWindow into dispatchPrintJob forces browser printing and skips the agent.
 */
export function openSaleOrderPrintWindow(documentType) {
  if (documentType === "both" || documentType == null) return null;
  if (shouldUsePrintAgentForDocument(documentType)) return null;
  return openBlankPrintWindow(printWindowFeatures(documentType));
}

/** True when a missing printWindow means the browser blocked the popup (not agent path). */
export function isSaleOrderBrowserPrintWindowRequired(documentType) {
  if (documentType === "both" || documentType == null) return false;
  return !shouldUsePrintAgentForDocument(documentType);
}

function resolveAllowBrowserFallback(allowBrowserFallback, agentConfig) {
  // Org setting is always true today; never hard-fail print when the agent is missing.
  if (allowBrowserFallback === false && agentConfig?.fallbackToBrowser === false) {
    return false;
  }
  // Default and org policy: agent offline → browser dialog.
  return true;
}

/**
 * Print prepared HTML through Centrix Print Agent when available, otherwise the browser dialog.
 * Use this for picking lists, LPOs, invoices, and other ERP documents — not admin live preview.
 * Always falls back to the browser when the agent is offline or unreachable.
 */
export async function printHtmlDocument(html, options = {}) {
  const {
    jobType = "document",
    copies = 1,
    documentId = null,
    printWindow = null,
    windowFeatures = "width=900,height=800",
  } = options;
  return dispatchPrintJob({
    html,
    copies,
    jobType,
    documentId,
    printWindow,
    windowFeatures,
    // Documents must never fail silently when the agent is down.
    allowBrowserFallback: true,
  });
}

async function tryAgentPrint({ preparedHtml, copies, jobType, documentId = null, config, wait = false }) {
  const result = await printViaAgent({
    html: preparedHtml,
    copies,
    jobType,
    documentId,
    wait,
    config: { ...config, enabled: true },
  });
  return {
    mode: "agent",
    ok: true,
    printer: config.printerName || undefined,
    jobId: result.jobId ?? undefined,
  };
}

async function printViaBrowserFallback({
  preparedHtml,
  copies,
  windowFeatures,
  settleTimeoutMs,
  agentError = null,
}) {
  let opened = 0;
  for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
    const win = openBlankPrintWindow(windowFeatures);
    if (win) {
      await fillPrintWindow(win, preparedHtml, { skipBaseline: true, settleTimeoutMs });
      opened += 1;
    }
  }

  if (opened === 0) {
    return {
      mode: "browser",
      ok: false,
      error: agentError
        ? `Print agent unavailable (${agentError}). ${PRINT_BLOCKED_MESSAGE}`
        : PRINT_BLOCKED_MESSAGE,
    };
  }

  return {
    mode: "browser",
    ok: true,
    ...(agentError ? { agentFallback: true, agentError } : {}),
  };
}

/**
 * Route a print job to Centrix Print Agent or the browser dialog (org settings).
 * When the agent is offline, missing, or errors, falls back to the browser dialog
 * (unless allowBrowserFallback is false and org fallback is also disabled).
 *
 * @returns {Promise<{ mode: "agent" | "browser", ok: boolean, error?: string, printer?: string, jobId?: string }>}
 */
export async function dispatchPrintJob({
  html,
  copies = 1,
  jobType = "receipt",
  documentId = null,
  printWindow = null,
  windowFeatures = "width=420,height=720",
  agentConfig = getPrintAgentConfig(),
  provider = getLocalPrintProvider(),
  /** When false with org fallback disabled, batch thermal may stay agent-only. */
  allowBrowserFallback = true,
  /** Hotel POS receipts wait so shared-printer failures are not swallowed by the background queue. */
  wait = false,
}) {
  if (!html?.trim()) {
    return { mode: "browser", ok: false, error: "Nothing to print." };
  }

  const preparedHtml = preparePrintHtml(html, jobType);

  // Receipts/Z settle quickly — never block the till UI for minutes on missing afterprint.
  const settleTimeoutMs = jobType === "receipt" ? 5_000 : 20_000;

  if (printWindow) {
    await fillPrintWindow(printWindow, preparedHtml, { skipBaseline: true, settleTimeoutMs });
    return { mode: "browser", ok: true };
  }

  const activeProvider = provider;
  const canFallbackToBrowser = resolveAllowBrowserFallback(allowBrowserFallback, agentConfig);
  let agentError = null;

  if (activeProvider === "agent" || (activeProvider === "browser" && isPrintAgentEnabled())) {
    const config = activeProvider === "agent" ? { ...agentConfig, enabled: true } : agentConfig;
    if (config.enabled || activeProvider === "agent") {
      try {
        // Warm path: skip /v1/health when the agent answered recently (POS after first ping).
        if (isPrintAgentRecentlyHealthy({ ...config, enabled: true })) {
          try {
            return await tryAgentPrint({ preparedHtml, copies, jobType, documentId, config, wait });
          } catch (err) {
            invalidatePrintAgentHealth({ ...config, enabled: true });
            agentError = err instanceof Error ? err.message : "Print agent failed.";
          }
        }

        let health = await checkPrintAgentHealth(
          { ...config, enabled: true },
          { quick: true },
        );
        // Quick ping can time out on a cold agent — retry once with the full timeout
        // before falling back to the browser (common on backoffice first print).
        if (!health?.ok) {
          health = await checkPrintAgentHealth(
            { ...config, enabled: true },
            { quick: false, bypassCache: true },
          );
        }
        if (health?.ok) {
          try {
            return await tryAgentPrint({ preparedHtml, copies, jobType, documentId, config, wait });
          } catch (err) {
            invalidatePrintAgentHealth({ ...config, enabled: true });
            agentError = err instanceof Error ? err.message : "Print agent failed.";
            // One retry after a failed warm/hot print (agent briefly busy).
            try {
              await new Promise((resolve) => setTimeout(resolve, 250));
              return await tryAgentPrint({ preparedHtml, copies, jobType, documentId, config, wait });
            } catch (retryErr) {
              agentError =
                retryErr instanceof Error ? retryErr.message : agentError;
            }
          }
        } else {
          agentError = agentError || "Print agent is offline or not found.";
        }
      } catch (err) {
        agentError = err instanceof Error ? err.message : "Print agent unreachable.";
      }
    }
  }

  if (!canFallbackToBrowser && activeProvider !== "browser") {
    return {
      mode: "agent",
      ok: false,
      error: agentError
        ? `Print agent failed (${agentError}).`
        : "Print agent is offline. Start Centrix Print Agent and try again.",
    };
  }

  return printViaBrowserFallback({
    preparedHtml,
    copies,
    windowFeatures,
    settleTimeoutMs,
    agentError,
  });
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
