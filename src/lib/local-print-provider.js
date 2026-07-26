/**
 * Unified local printing preference for this browser/device.
 * Providers:
 * - browser — normal print dialog
 * - qz — QZ Tray (Windows / macOS websocket bridge)
 * - centrix — Centrix Print Agent (local service on 127.0.0.1)
 */

const STORAGE_KEY = "centrix_local_print_provider_v1";

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
      "Install QZ Tray on Windows or macOS for local silent printing from the PWA (Chrome / Edge).",
  },
  {
    id: "centrix",
    label: "Centrix Print Agent",
    description:
      "Install Centrix Print Agent on Windows for local silent printing from the PWA (Chrome / Edge).",
  },
];

export function normalizeLocalPrintProvider(value) {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "qz" || key === "qz-tray" || key === "qz_tray") return "qz";
  if (key === "centrix" || key === "agent" || key === "print-agent") return "centrix";
  return "browser";
}

export function getLocalPrintProvider() {
  if (typeof window === "undefined") return "browser";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeLocalPrintProvider(stored);
  } catch {
    // ignore
  }
  // Migrate: if Centrix agent was already enabled, keep using it.
  try {
    const agent = window.localStorage.getItem("centrix_print_agent_v1");
    if (agent) {
      const parsed = JSON.parse(agent);
      if (parsed?.enabled) return "centrix";
    }
  } catch {
    // ignore
  }
  try {
    const qz = window.localStorage.getItem("centrix_qz_tray_v1");
    if (qz) {
      const parsed = JSON.parse(qz);
      if (parsed?.enabled) return "qz";
    }
  } catch {
    // ignore
  }
  return "browser";
}

export function saveLocalPrintProvider(provider) {
  const next = normalizeLocalPrintProvider(provider);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  return next;
}
