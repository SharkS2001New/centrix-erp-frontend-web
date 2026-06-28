/**
 * Centrix Print Agent client — silent thermal printing at tills.
 * Config is stored per browser/device (localStorage), not org-wide.
 *
 * Agent API contract: see /print-agent/README.md
 */

const STORAGE_KEY = "centrix_print_agent_v1";
const DEFAULT_BASE_URL = "http://127.0.0.1:9247";
const HEALTH_TIMEOUT_MS = 2500;
const PRINT_TIMEOUT_MS = 30000;

export const PRINT_AGENT_DEFAULTS = {
  enabled: false,
  baseUrl: DEFAULT_BASE_URL,
  printerName: "",
  requireAgent: false,
  fallbackToBrowser: true,
};

export function normalizePrintAgentConfig(raw = {}) {
  return {
    enabled: Boolean(raw.enabled),
    baseUrl: String(raw.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "") || DEFAULT_BASE_URL,
    printerName: String(raw.printerName ?? "").trim(),
    requireAgent: Boolean(raw.requireAgent),
    fallbackToBrowser: raw.fallbackToBrowser !== false,
  };
}

export function getPrintAgentConfig() {
  if (typeof window === "undefined") return normalizePrintAgentConfig();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return normalizePrintAgentConfig();
    return normalizePrintAgentConfig(JSON.parse(stored));
  } catch {
    return normalizePrintAgentConfig();
  }
}

export function savePrintAgentConfig(next) {
  const config = normalizePrintAgentConfig(next);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
  return config;
}

function agentUrl(config, path) {
  return `${config.baseUrl}${path}`;
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
export async function checkPrintAgentHealth(config = getPrintAgentConfig()) {
  if (!config?.baseUrl) return null;
  try {
    const body = await agentFetch(config, "/v1/health", {
      method: "GET",
      timeoutMs: HEALTH_TIMEOUT_MS,
    });
    return {
      ok: Boolean(body.ok),
      version: body.version ?? null,
      platform: body.platform ?? null,
      defaultPrinter: body.default_printer ?? body.defaultPrinter ?? null,
      printers: Array.isArray(body.printers) ? body.printers : [],
    };
  } catch {
    return null;
  }
}

/**
 * Send HTML to the print agent for silent printing.
 * @returns {{ ok: true, jobId?: string }}
 */
export async function printViaAgent({
  html,
  copies = 1,
  jobType = "receipt",
  documentId = null,
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
    body: JSON.stringify({
      html,
      copies: Math.max(1, Number(copies) || 1),
      job_type: jobType,
      document_id: documentId != null ? String(documentId) : null,
      printer: config.printerName || null,
    }),
  });

  return { ok: true, jobId: body.job_id ?? body.jobId ?? null };
}

export function isPrintAgentEnabled() {
  return getPrintAgentConfig().enabled;
}
