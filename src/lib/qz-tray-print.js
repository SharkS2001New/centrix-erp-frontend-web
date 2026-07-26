/**
 * QZ Tray local print bridge — Windows & macOS (Chrome / Edge / PWA).
 * https://qz.io/docs/getting-started
 *
 * Org settings (provider, printer, signing) live in module_settings.local_printing.
 * Dev/testing: unsigned connect works with QZ trust prompts.
 * Production silent print: set certificate + signing via /api/v1/qz/* (Laravel).
 */

import { apiRequest } from "@/lib/api";
import {
  getCachedLocalPrintingSettings,
  qzConfigFromLocalPrinting,
  setCachedLocalPrintingSettings,
} from "@/lib/local-printing-settings";

export const QZ_TRAY_DEFAULTS = {
  enabled: false,
  printerName: "",
  copies: 1,
  fallbackToBrowser: true,
  requireQz: false,
  /** When true, request signed calls from the API (production silent print). */
  useSigning: false,
};

export function normalizeQzTrayConfig(raw = {}) {
  return {
    enabled: Boolean(raw.enabled),
    printerName: String(raw.printerName ?? "").trim(),
    copies: Math.max(1, Number(raw.copies) || 1),
    fallbackToBrowser: raw.fallbackToBrowser !== false,
    requireQz: Boolean(raw.requireQz),
    useSigning: Boolean(raw.useSigning),
  };
}

export function getQzTrayConfig() {
  return qzConfigFromLocalPrinting(getCachedLocalPrintingSettings());
}

export function saveQzTrayConfig(next) {
  const config = normalizeQzTrayConfig(next);
  const current = getCachedLocalPrintingSettings();
  setCachedLocalPrintingSettings({
    ...current,
    provider: config.enabled ? "qz" : current.provider === "qz" ? "qz" : "browser",
    printer_name: config.printerName,
    copies: config.copies,
    fallback_to_browser: config.fallbackToBrowser,
    require_qz: config.requireQz,
    use_signing: config.useSigning,
  });
  return getQzTrayConfig();
}

export function isQzTrayEnabled() {
  return getQzTrayConfig().enabled;
}

let qzModulePromise = null;
let securityConfigured = false;
/** Shared in-flight connect so parallel Test / health checks don't race. */
let connectInFlight = null;

async function loadQz() {
  if (typeof window === "undefined") {
    throw new Error("QZ Tray is only available in the browser.");
  }
  if (!qzModulePromise) {
    qzModulePromise = import("qz-tray").then((mod) => mod.default ?? mod);
  }
  return qzModulePromise;
}

/**
 * qz.websocket.isActive() is true while CONNECTING — before sendData is attached.
 * API calls (printers.find, print) need a fully opened handshake.
 */
function isQzReadyForApi(qz) {
  const conn = qz?.websocket?.connection;
  return Boolean(conn && typeof conn.sendData === "function" && conn.established);
}

function waitForQzReady(qz, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (isQzReadyForApi(qz)) {
        resolve(qz);
        return;
      }
      if (!qz.websocket.isActive()) {
        reject(new Error("QZ Tray connection closed before it became ready."));
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for QZ Tray to finish connecting."));
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function friendlyQzError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  if (lower.includes("senddata is not a function")) {
    return "QZ Tray was still connecting. Try Test connection again in a moment.";
  }
  if (
    lower.includes("unable to establish connection") ||
    lower.includes("connection closed") ||
    lower.includes("not been established")
  ) {
    return "QZ Tray is not reachable. Install from qz.io, start it, then allow this site when prompted.";
  }
  if (lower.includes("connection attempt has not returned")) {
    return "QZ Tray is still connecting. Wait a second and try again.";
  }
  return message || "QZ Tray is not reachable";
}

/**
 * Optional production signing — Laravel serves the public cert and signs payloads.
 * Without this, QZ Tray shows trust prompts (fine for development).
 */
async function configureQzSecurity(qz, { useSigning = false } = {}) {
  if (!useSigning) {
    securityConfigured = false;
    return;
  }
  if (securityConfigured) return;

  qz.security.setCertificatePromise((resolve, reject) => {
    apiRequest("/qz/certificate", { loading: false, reportIssues: false })
      .then((res) => {
        const cert = typeof res === "string" ? res : res?.certificate ?? res?.data;
        if (!cert) reject(new Error("QZ certificate not configured on the server."));
        else resolve(cert);
      })
      .catch(reject);
  });

  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    apiRequest("/qz/sign", {
      method: "POST",
      body: { to_sign: toSign },
      loading: false,
      reportIssues: false,
    })
      .then((res) => {
        const signature = typeof res === "string" ? res : res?.signature ?? res?.data;
        if (!signature) reject(new Error("QZ signature failed."));
        else resolve(signature);
      })
      .catch(reject);
  });

  securityConfigured = true;
}

export async function ensureQzConnected(config = getQzTrayConfig()) {
  const qz = await loadQz();
  await configureQzSecurity(qz, { useSigning: config.useSigning });

  if (isQzReadyForApi(qz)) {
    return qz;
  }

  if (!connectInFlight) {
    connectInFlight = (async () => {
      try {
        // Another tab/effect may already be mid-handshake (isActive but not ready).
        if (qz.websocket.isActive() && !isQzReadyForApi(qz)) {
          await waitForQzReady(qz);
          return qz;
        }

        if (!isQzReadyForApi(qz)) {
          await qz.websocket.connect({ retries: 5, delay: 1 });
        }

        if (!isQzReadyForApi(qz)) {
          await waitForQzReady(qz);
        }
        return qz;
      } finally {
        connectInFlight = null;
      }
    })();
  }

  return connectInFlight;
}

/** @returns {Promise<{ ok: boolean, printers: string[], version?: string|null, error?: string }>} */
export async function checkQzTrayHealth(config = getQzTrayConfig()) {
  try {
    const qz = await ensureQzConnected(config);
    const printers = await qz.printers.find();
    const list = Array.isArray(printers) ? printers.map(String) : [];
    return {
      ok: true,
      printers: list,
      version: qz.version ?? null,
      defaultPrinter: list[0] ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      printers: [],
      version: null,
      error: friendlyQzError(error),
    };
  }
}

function pageOptionsForJob(jobType) {
  // Approximate widths in inches for QZ HTML pixel rendering.
  if (jobType === "receipt" || jobType === "thermal") {
    return { pageWidth: 2.83 }; // ~72 mm / common 80mm roll content width
  }
  if (jobType === "label") {
    return { pageWidth: 2.25 };
  }
  return { pageWidth: 8.27 }; // A4-ish
}

/**
 * Print HTML via QZ Tray on the user's machine.
 * @returns {Promise<{ ok: true, printer: string }>}
 */
export async function printViaQzTray({
  html,
  copies = 1,
  jobType = "receipt",
  config = getQzTrayConfig(),
}) {
  if (!config.enabled) {
    throw new Error("QZ Tray printing is disabled on this device.");
  }
  if (!html?.trim()) {
    throw new Error("Nothing to print.");
  }

  try {
    const qz = await ensureQzConnected(config);
    const printers = await qz.printers.find();
    const list = Array.isArray(printers) ? printers.map(String) : [];
    const printer =
      (config.printerName && list.includes(config.printerName) && config.printerName) ||
      config.printerName ||
      list[0] ||
      null;

    if (!printer) {
      throw new Error("No printers found. Open QZ Tray and connect a printer.");
    }

    const printConfig = qz.configs.create(printer, {
      copies: Math.max(1, Number(copies) || config.copies || 1),
      scaleContent: true,
      rasterize: true,
    });

    const data = [
      {
        type: "pixel",
        format: "html",
        flavor: "plain",
        data: html,
        options: pageOptionsForJob(jobType),
      },
    ];

    await qz.print(printConfig, data);
    return { ok: true, printer };
  } catch (error) {
    throw new Error(friendlyQzError(error));
  }
}
