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
    id: "agent",
    label: "Centrix Print Agent (Windows)",
    description:
      "Recommended on Windows: Centrix Print Agent for silent Hotel POS and retail receipts, plus all ERP documents. Falls back to the browser print dialog if offline.",
  },
];

export function normalizeLocalPrintProvider(value) {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "agent" || key === "print-agent" || key === "print_agent") return "agent";
  // Legacy QZ Tray orgs → browser until an admin selects Print Agent.
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
