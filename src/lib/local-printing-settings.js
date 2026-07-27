/**
 * Organization-level local printing settings (Admin → Local printing).
 * Stored in organizations.module_settings.local_printing.
 */

import { apiRequest } from "@/lib/api";

export const LOCAL_PRINTING_DEFAULTS = {
  provider: "browser",
  printer_name: "",
  copies: 1,
  fallback_to_browser: true,
  require_qz: false,
  use_signing: false,
};

const PRINT_AGENT_DEFAULT_BASE_URL = "http://127.0.0.1:9247";

let cachedSettings = null;

export function normalizeLocalPrintProviderKey(value) {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "agent" || key === "print-agent" || key === "print_agent") return "agent";
  // Legacy QZ Tray settings map to browser (Print Agent is the silent path now).
  return "browser";
}

export function normalizeLocalPrintingSettings(raw = {}) {
  const provider = normalizeLocalPrintProviderKey(raw.provider);

  return {
    provider,
    printer_name: String(raw.printer_name ?? raw.printerName ?? "").trim(),
    copies: Math.max(1, Math.min(10, Number(raw.copies) || 1)),
    // Always fall back to the browser dialog when the silent provider is missing/offline.
    fallback_to_browser: true,
    require_qz: false,
    use_signing: Boolean(raw.use_signing ?? raw.useSigning),
  };
}

export function mergeLocalPrintingSettings(moduleSettings) {
  const section =
    moduleSettings?.local_printing && typeof moduleSettings.local_printing === "object"
      ? moduleSettings.local_printing
      : moduleSettings && typeof moduleSettings === "object" && "provider" in moduleSettings
        ? moduleSettings
        : {};

  return normalizeLocalPrintingSettings({
    ...LOCAL_PRINTING_DEFAULTS,
    ...section,
  });
}

export function syncLocalPrintingFromCapabilities(capabilities) {
  cachedSettings = mergeLocalPrintingSettings(capabilities?.module_settings);
  clearLegacyLocalPrintStorage();
  return cachedSettings;
}

export function getCachedLocalPrintingSettings() {
  return cachedSettings ?? normalizeLocalPrintingSettings(LOCAL_PRINTING_DEFAULTS);
}

export function setCachedLocalPrintingSettings(next) {
  cachedSettings = normalizeLocalPrintingSettings(next);
  return cachedSettings;
}

/** QZ client config shape used by qz-tray-print.js */
export function qzConfigFromLocalPrinting(settings = getCachedLocalPrintingSettings()) {
  const s = normalizeLocalPrintingSettings(settings);
  return {
    enabled: s.provider === "qz",
    printerName: s.printer_name,
    copies: s.copies,
    fallbackToBrowser: s.fallback_to_browser,
    requireQz: s.require_qz,
    useSigning: s.use_signing,
  };
}

/** Centrix Print Agent client config shape used by print-agent.js */
export function agentConfigFromLocalPrinting(settings = getCachedLocalPrintingSettings()) {
  const s = normalizeLocalPrintingSettings(settings);
  return {
    enabled: s.provider === "agent",
    baseUrl: PRINT_AGENT_DEFAULT_BASE_URL,
    printerName: s.printer_name,
    copies: s.copies,
    fallbackToBrowser: s.fallback_to_browser,
    requireAgent: false,
  };
}

export function localPrintingFromProviderForm(provider, form = {}) {
  return normalizeLocalPrintingSettings({
    provider,
    printer_name: form.printerName,
    copies: form.copies,
    use_signing: form.useSigning,
  });
}

/** @deprecated Prefer {@link localPrintingFromProviderForm} */
export function localPrintingFromQzForm(provider, qzForm) {
  return localPrintingFromProviderForm(provider, qzForm);
}

export async function fetchLocalPrintingSettings() {
  const res = await apiRequest("/erp/settings/local-printing", {
    loading: false,
    reportIssues: false,
  });
  const next = normalizeLocalPrintingSettings(res?.local_printing ?? res);
  setCachedLocalPrintingSettings(next);
  clearLegacyLocalPrintStorage();
  return next;
}

export async function saveLocalPrintingSettings(patch) {
  const body = normalizeLocalPrintingSettings({
    ...getCachedLocalPrintingSettings(),
    ...patch,
  });
  const res = await apiRequest("/erp/settings/local-printing", {
    method: "PATCH",
    body,
  });
  const next = normalizeLocalPrintingSettings(res?.local_printing ?? res);
  setCachedLocalPrintingSettings(next);
  clearLegacyLocalPrintStorage();
  return next;
}

function clearLegacyLocalPrintStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("centrix_local_print_provider_v1");
    window.localStorage.removeItem("centrix_qz_tray_v1");
    window.localStorage.removeItem("centrix_print_agent_v1");
  } catch {
    // ignore
  }
}
