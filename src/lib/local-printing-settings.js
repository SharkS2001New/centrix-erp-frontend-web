/**
 * Organization-level local printing settings (Admin → Local printing).
 * Stored in organizations.module_settings.local_printing.
 */

import { apiRequest } from "@/lib/api";

export const LOCAL_PRINTING_DEFAULTS = {
  provider: "browser",
  printer_name: "",
  kitchen_printer_name: "",
  copies: 1,
  fallback_to_browser: true,
  require_qz: false,
  use_signing: false,
};

const PRINT_AGENT_DEFAULT_BASE_URL = "http://127.0.0.1:9247";

/** @type {Map<number, ReturnType<typeof normalizeLocalPrintingSettings>>} */
const cachedSettingsByOrg = new Map();
let cachedSettingsOrgId = 0;
let cachedSettings = null;

function resolveLocalPrintingOrgId(capabilities = null) {
  return (
    Number(capabilities?.organization_id ?? 0) ||
    Number(capabilities?.organization?.id ?? 0) ||
    cachedSettingsOrgId ||
    0
  );
}
let cachedSettingsOrganizationId = null;

export function normalizeLocalPrintProviderKey(value) {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "agent" || key === "print-agent" || key === "print_agent") return "agent";
  // Legacy QZ Tray settings map to browser (Print Agent is the silent path now).
  return "browser";
}

function parseOptionalBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const key = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(key)) return true;
  if (["0", "false", "no", "off"].includes(key)) return false;
  return fallback;
}

export function normalizeLocalPrintingSettings(raw = {}) {
  const provider = normalizeLocalPrintProviderKey(raw.provider);
  const kitchen_printer_name = String(raw.kitchen_printer_name ?? raw.kitchenPrinterName ?? "").trim();
  const hasSecondCopyFlag =
    (Object.prototype.hasOwnProperty.call(raw, "second_copy_enabled") &&
      raw.second_copy_enabled !== undefined) ||
    (Object.prototype.hasOwnProperty.call(raw, "secondCopyEnabled") &&
      raw.secondCopyEnabled !== undefined);

  return {
    provider,
    printer_name: String(raw.printer_name ?? raw.printerName ?? "").trim(),
    kitchen_printer_name,
    // Legacy: a saved kitchen/second printer implies the extra copy was in use.
    second_copy_enabled: hasSecondCopyFlag
      ? parseOptionalBool(raw.second_copy_enabled ?? raw.secondCopyEnabled, false)
      : kitchen_printer_name !== "",
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
  const orgId = resolveLocalPrintingOrgId(capabilities);
  cachedSettings = mergeLocalPrintingSettings(capabilities?.module_settings);
  cachedSettingsOrgId = orgId;
  if (orgId > 0) {
    cachedSettingsByOrg.set(orgId, cachedSettings);
  }
  clearLegacyLocalPrintStorage();
  return cachedSettings;
}

export function getCachedLocalPrintingSettings() {
  if (cachedSettings) return cachedSettings;
  if (cachedSettingsOrgId > 0 && cachedSettingsByOrg.has(cachedSettingsOrgId)) {
    return cachedSettingsByOrg.get(cachedSettingsOrgId);
  }
  return normalizeLocalPrintingSettings(LOCAL_PRINTING_DEFAULTS);
}

export function setCachedLocalPrintingSettings(next) {
  cachedSettings = normalizeLocalPrintingSettings(next);
  if (cachedSettingsOrgId > 0) {
    cachedSettingsByOrg.set(cachedSettingsOrgId, cachedSettings);
  }
  return cachedSettings;
}

/** Drop in-memory print settings when switching organizations. */
export function clearLocalPrintingSettingsCache() {
  cachedSettings = null;
  cachedSettingsOrgId = 0;
  cachedSettingsByOrg.clear();
}

/** QZ client config shape used by qz-tray-print.js */
export function qzConfigFromLocalPrinting(settings = getCachedLocalPrintingSettings()) {
  const s = normalizeLocalPrintingSettings(settings);
  return {
    enabled: s.provider === "qz",
    printerName: s.printer_name,
    kitchenPrinterName: s.kitchen_printer_name,
    secondCopyEnabled: s.second_copy_enabled,
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
    kitchenPrinterName: s.kitchen_printer_name,
    secondCopyEnabled: s.second_copy_enabled,
    copies: s.copies,
    fallbackToBrowser: s.fallback_to_browser,
    requireAgent: false,
  };
}

/**
 * Extra till-receipt destination, or empty when the second copy is off / unset / same as preferred.
 */
export function resolveSecondCopyPrinterName(settings = getCachedLocalPrintingSettings()) {
  const s = normalizeLocalPrintingSettings(settings);
  if (!s.second_copy_enabled) return "";
  if (!s.kitchen_printer_name || s.kitchen_printer_name === s.printer_name) return "";
  return s.kitchen_printer_name;
}

/** @deprecated Use {@link resolveSecondCopyPrinterName} */
export function resolveHotelKitchenPrinterName(settings = getCachedLocalPrintingSettings()) {
  return resolveSecondCopyPrinterName(settings);
}

export function localPrintingFromProviderForm(provider, form = {}) {
  return normalizeLocalPrintingSettings({
    provider,
    printer_name: form.printerName,
    kitchen_printer_name: form.kitchenPrinterName,
    second_copy_enabled: form.secondCopyEnabled,
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
