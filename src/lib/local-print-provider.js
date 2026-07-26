/**
 * Local print provider helpers — backed by organization settings.
 */

import {
  getCachedLocalPrintingSettings,
  normalizeLocalPrintingSettings,
  setCachedLocalPrintingSettings,
} from "@/lib/local-printing-settings";

export const LOCAL_PRINT_PROVIDERS = [
  {
    id: "browser",
    label: "Browser print dialog",
    description: "Uses the normal system print dialog. No extra software.",
  },
  {
    id: "qz",
    label: "QZ Tray",
    description:
      "Install QZ Tray on Windows or macOS for silent printing. Falls back to the browser print dialog if QZ Tray is not available.",
  },
];

export function normalizeLocalPrintProvider(value) {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "qz" || key === "qz-tray" || key === "qz_tray") return "qz";
  return "browser";
}

export function getLocalPrintProvider() {
  return getCachedLocalPrintingSettings().provider;
}

export function saveLocalPrintProvider(provider) {
  const next = normalizeLocalPrintProvider(provider);
  setCachedLocalPrintingSettings({
    ...getCachedLocalPrintingSettings(),
    provider: next,
  });
  return next;
}

export { normalizeLocalPrintingSettings };
