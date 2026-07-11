/**
 * Split client RTT into server processing vs estimated network time.
 *
 * @param {{ clientRttMs: number, serverMs?: number | null }} input
 * @returns {{
 *   client_rtt_ms: number,
 *   server_ms: number | null,
 *   network_estimate_ms: number | null,
 *   likely: 'network' | 'api' | 'unknown',
 * }}
 */
export function classifyLatency({ clientRttMs, serverMs }) {
  const client = Math.max(0, Math.round(Number(clientRttMs) || 0));
  const serverRaw = serverMs == null || serverMs === "" ? null : Number(serverMs);
  const server = Number.isFinite(serverRaw) ? Math.max(0, Math.round(serverRaw)) : null;
  const network = server == null ? null : Math.max(0, client - server);

  let likely = "unknown";
  if (server != null && client > 0) {
    // Dominant server work → API; otherwise (or tiny server time) → user/network.
    if (server >= 1000 && server >= client * 0.4) {
      likely = "api";
    } else if (server < 250 || (network != null && network >= client * 0.7)) {
      likely = "network";
    } else if (server >= client * 0.5) {
      likely = "api";
    } else {
      likely = "network";
    }
  }

  return {
    client_rtt_ms: client,
    server_ms: server,
    network_estimate_ms: network,
    likely,
  };
}

/**
 * @param {{
 *   mode?: 'ping' | 'request',
 *   clientRttMs: number,
 *   serverMs?: number | null,
 * }} input
 */
export function formatSlowLatencyMessage({ mode = "request", clientRttMs, serverMs }) {
  const split = classifyLatency({ clientRttMs, serverMs });
  const secs = Math.max(1, Math.round(split.client_rtt_ms / 1000));

  if (split.likely === "network" && split.server_ms != null) {
    return `Likely user network (${secs}s RTT; server ${split.server_ms}ms, network ~${split.network_estimate_ms}ms)`;
  }
  if (split.likely === "api" && split.server_ms != null) {
    return `Likely API slow (${secs}s RTT; server ${split.server_ms}ms)`;
  }

  return mode === "ping"
    ? `Slow connection (${secs}s to reach API)`
    : `Slow response (${secs}s)`;
}

/** Parse X-Response-Time ("12ms") or Server-Timing ("app;dur=12.5"). */
export function parseServerDurationMs(res, body = null) {
  if (body && typeof body === "object" && body.server_ms != null) {
    const fromBody = Number(body.server_ms);
    if (Number.isFinite(fromBody) && fromBody >= 0) {
      return Math.round(fromBody);
    }
  }

  if (!res || typeof res.headers?.get !== "function") {
    return null;
  }

  const xResponseTime = res.headers.get("X-Response-Time") || res.headers.get("x-response-time");
  if (xResponseTime) {
    const match = String(xResponseTime).match(/([\d.]+)/);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 0) return Math.round(value);
    }
  }

  const serverTiming = res.headers.get("Server-Timing") || res.headers.get("server-timing");
  if (serverTiming) {
    const match = String(serverTiming).match(/dur\s*=\s*([\d.]+)/i);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 0) return Math.round(value);
    }
  }

  return null;
}
