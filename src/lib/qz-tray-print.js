/**
 * QZ Tray local print bridge — Windows & macOS (Chrome / Edge / PWA).
 * https://qz.io/docs/getting-started
 *
 * Dev/testing: unsigned connect works with QZ trust prompts.
 * Production silent print: set certificate + signing via /api/v1/qz/* (Laravel).
 */

import { apiRequest } from "@/lib/api";

const STORAGE_KEY = "centrix_qz_tray_v1";

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
  if (typeof window === "undefined") return normalizeQzTrayConfig();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return normalizeQzTrayConfig();
    return normalizeQzTrayConfig(JSON.parse(stored));
  } catch {
    return normalizeQzTrayConfig();
  }
}

export function saveQzTrayConfig(next) {
  const config = normalizeQzTrayConfig(next);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
  return config;
}

export function isQzTrayEnabled() {
  return getQzTrayConfig().enabled;
}

let qzModulePromise = null;
let securityConfigured = false;

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

  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 3, delay: 1 });
  }
  return qz;
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
      error: error instanceof Error ? error.message : "QZ Tray is not reachable",
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
}
