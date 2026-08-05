/**
 * Centrix Print Agent client — silent thermal printing at tills.
 * Org settings (provider, printer) live in module_settings.local_printing.
 *
 * Agent API contract: see /print-agent/README.md
 */

import {
  agentConfigFromLocalPrinting,
  getCachedLocalPrintingSettings,
  setCachedLocalPrintingSettings,
} from "@/lib/local-printing-settings";

const DEFAULT_BASE_URL = "http://127.0.0.1:9247";
const HEALTH_PATH = "/v1/health";
const HEALTH_TIMEOUT_MS = 1200;
const QUICK_HEALTH_TIMEOUT_MS = 500;
/** Async queue returns quickly; sync/test print may still wait for PDF + printer. */
const PRINT_TIMEOUT_MS = 8000;
const PRINT_WAIT_TIMEOUT_MS = 45000;
/** Skip localhost health pings for a short window after a successful check/print. */
const HEALTH_CACHE_TTL_MS = 45_000;

/** @type {Map<string, { ok: boolean, at: number, result?: object|null }>} */
const healthCacheByBaseUrl = new Map();

export const PRINT_AGENT_DEFAULTS = {
  enabled: false,
  baseUrl: DEFAULT_BASE_URL,
  printerName: "",
  requireAgent: false,
  fallbackToBrowser: true,
  copies: 1,
};

export function normalizePrintAgentConfig(raw = {}) {
  return {
    enabled: Boolean(raw.enabled),
    baseUrl: String(raw.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "") || DEFAULT_BASE_URL,
    printerName: String(raw.printerName ?? "").trim(),
    requireAgent: Boolean(raw.requireAgent),
    fallbackToBrowser: raw.fallbackToBrowser !== false,
    copies: Math.max(1, Number(raw.copies) || 1),
  };
}

export function getPrintAgentConfig() {
  return agentConfigFromLocalPrinting(getCachedLocalPrintingSettings());
}

export function savePrintAgentConfig(next) {
  const config = normalizePrintAgentConfig(next);
  const current = getCachedLocalPrintingSettings();
  setCachedLocalPrintingSettings({
    ...current,
    ...(config.enabled ? { provider: "agent" } : {}),
    printer_name: config.printerName,
    copies: config.copies,
    fallback_to_browser: config.fallbackToBrowser,
  });
  return getPrintAgentConfig();
}

function agentUrl(config, path) {
  return `${config.baseUrl}${path}`;
}

export function printAgentHealthUrl(config = getPrintAgentConfig()) {
  const base = String(config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "") || DEFAULT_BASE_URL;
  return `${base}${HEALTH_PATH}`;
}

function healthCacheKey(config) {
  return String(config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "") || DEFAULT_BASE_URL;
}

/** @internal test helper */
export function clearPrintAgentHealthCache() {
  healthCacheByBaseUrl.clear();
}

export function markPrintAgentHealthy(config = getPrintAgentConfig(), result = { ok: true }) {
  healthCacheByBaseUrl.set(healthCacheKey(config), {
    ok: true,
    at: Date.now(),
    result: result ?? { ok: true },
  });
}

export function invalidatePrintAgentHealth(config = getPrintAgentConfig()) {
  healthCacheByBaseUrl.delete(healthCacheKey(config));
}

/** True when the agent answered OK within HEALTH_CACHE_TTL_MS. */
export function isPrintAgentRecentlyHealthy(
  config = getPrintAgentConfig(),
  { ttlMs = HEALTH_CACHE_TTL_MS } = {},
) {
  const cached = healthCacheByBaseUrl.get(healthCacheKey(config));
  if (!cached?.ok) return false;
  return Date.now() - cached.at < ttlMs;
}

async function agentFetch(config, path, init = {}) {
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? PRINT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(agentUrl(config, path), {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = body.message ?? body.error ?? `Print agent error (${res.status})`;
      throw new Error(message);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Ping the local print agent. Returns null when unreachable. */
export async function checkPrintAgentHealth(
  config = getPrintAgentConfig(),
  { quick = false, bypassCache = false } = {},
) {
  if (!config?.baseUrl) return null;

  if (!bypassCache) {
    const cached = healthCacheByBaseUrl.get(healthCacheKey(config));
    if (cached?.ok && Date.now() - cached.at < HEALTH_CACHE_TTL_MS) {
      return cached.result ?? { ok: true };
    }
  }

  try {
    const body = await agentFetch(config, "/v1/health", {
      method: "GET",
      timeoutMs: quick ? QUICK_HEALTH_TIMEOUT_MS : HEALTH_TIMEOUT_MS,
    });
    const result = {
      ok: Boolean(body.ok),
      version: body.version ?? null,
      platform: body.platform ?? null,
      defaultPrinter: body.default_printer ?? body.defaultPrinter ?? null,
      printers: Array.isArray(body.printers) ? body.printers : [],
      sumatraAvailable: Boolean(body.sumatra_available),
      sumatraPath: body.sumatra_path ?? null,
      wkhtmltopdfAvailable: Boolean(body.wkhtmltopdf_available),
      runningAsService: Boolean(body.running_as_service),
      raw: body,
    };
    if (result.ok) {
      markPrintAgentHealthy(config, result);
    } else {
      invalidatePrintAgentHealth(config);
    }
    return result;
  } catch {
    invalidatePrintAgentHealth(config);
    return null;
  }
}

/** Background warm-up so the first POS receipt can skip the health round-trip. */
export async function warmPrintAgentHealth(config = getPrintAgentConfig()) {
  if (!config?.enabled && !isPrintAgentEnabled()) return null;
  return checkPrintAgentHealth({ ...config, enabled: true }, { quick: true, bypassCache: true });
}

/**
 * Send HTML to the print agent for silent printing.
 * By default the agent queues the job and returns immediately (POS feels snappy).
 * Pass `wait: true` for Admin test prints that must confirm success/failure.
 * @returns {{ ok: true, jobId?: string, queued?: boolean }}
 */
export async function printViaAgent({
  html,
  copies = 1,
  jobType = "receipt",
  documentId = null,
  wait = false,
  config = getPrintAgentConfig(),
}) {
  if (!config.enabled) {
    throw new Error("Print agent is disabled on this till.");
  }
  if (!html?.trim()) {
    throw new Error("Nothing to print.");
  }

  const body = await agentFetch(config, "/v1/print", {
    method: "POST",
    timeoutMs: wait ? PRINT_WAIT_TIMEOUT_MS : PRINT_TIMEOUT_MS,
    body: JSON.stringify({
      html,
      copies: Math.max(1, Number(copies) || 1),
      job_type: jobType,
      document_id: documentId != null ? String(documentId) : null,
      printer: config.printerName || null,
      wait: Boolean(wait),
    }),
  });

  markPrintAgentHealthy(config, { ok: true });

  return {
    ok: true,
    jobId: body.job_id ?? body.jobId ?? null,
    queued: body.queued !== false,
  };
}

export function isPrintAgentEnabled() {
  return getPrintAgentConfig().enabled;
}
