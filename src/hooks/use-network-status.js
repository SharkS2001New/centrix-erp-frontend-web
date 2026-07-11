"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NETWORK_DEGRADED_PING_INTERVAL_MS,
  NETWORK_OUTAGE_REPORT_MIN_MS,
  NETWORK_PING_INTERVAL_MS,
  NETWORK_SLOW_THRESHOLD_MS,
  pingApiHealth,
  resolveNetworkStatus,
} from "@/lib/network-status";
import { submitSystemIssueReport } from "@/lib/system-issue-reports";
import { classifyLatency, formatSlowLatencyMessage } from "@/lib/latency-split";

/**
 * Tracks browser online state + API reachability (latency via /health).
 * @returns {{
 *   status: 'online' | 'offline' | 'slow',
 *   browserOnline: boolean,
 *   apiOnline: boolean,
 *   latencyMs: number | null,
 *   checking: boolean,
 *   refresh: () => Promise<void>,
 * }}
 */
export function useNetworkStatus({ enabled = true, reportOutages = true } = {}) {
  const [browserOnline, setBrowserOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [apiOnline, setApiOnline] = useState(true);
  const [latencyMs, setLatencyMs] = useState(null);
  const [checking, setChecking] = useState(false);
  /** null = healthy; otherwise banner stays visible until the next successful probe. */
  const [connectionIssue, setConnectionIssue] = useState(null);

  const offlineSinceRef = useRef(null);
  const slowReportedRef = useRef(false);
  const connectionIssueRef = useRef(null);
  const probeInFlightRef = useRef(false);

  useEffect(() => {
    connectionIssueRef.current = connectionIssue;
  }, [connectionIssue]);

  const applyProbeResult = useCallback(
    (result, browserReportsOnline) => {
      const browserOk = browserReportsOnline;
      setBrowserOnline(browserOk);
      setApiOnline(result.ok);
      setLatencyMs(result.latencyMs);

      const issue = resolveNetworkStatus(browserOk, result.ok, result.latencyMs);

      if (issue === "online") {
        if (offlineSinceRef.current && reportOutages) {
          const durationMs = Date.now() - offlineSinceRef.current;
          if (durationMs >= NETWORK_OUTAGE_REPORT_MIN_MS) {
            void submitSystemIssueReport({
              kind: "error",
              message: `Connection lost for ${Math.round(durationMs / 1000)}s (browser or API unreachable)`,
              api_path: "/health",
              http_method: "GET",
              duration_ms: durationMs,
              context: { connectivity: "outage", recovered: true },
            });
          }
        }
        offlineSinceRef.current = null;
        slowReportedRef.current = false;
        setConnectionIssue(null);
        return;
      }

      setConnectionIssue(issue);

      if (!result.ok || !browserOk) {
        if (!offlineSinceRef.current) {
          offlineSinceRef.current = Date.now();
        }
        slowReportedRef.current = false;
        return;
      }

      offlineSinceRef.current = null;

      if (
        reportOutages
        && result.latencyMs >= NETWORK_SLOW_THRESHOLD_MS
        && !slowReportedRef.current
      ) {
        slowReportedRef.current = true;
        const split = classifyLatency({
          clientRttMs: result.latencyMs,
          serverMs: result.serverMs,
        });
        void submitSystemIssueReport({
          kind: "slow",
          message: formatSlowLatencyMessage({
            mode: "ping",
            clientRttMs: result.latencyMs,
            serverMs: result.serverMs,
          }),
          api_path: "/health",
          http_method: "GET",
          duration_ms: result.latencyMs,
          context: {
            connectivity: "slow_ping",
            ...split,
          },
        });
      }
    },
    [reportOutages],
  );

  const probe = useCallback(
    async ({ force = false } = {}) => {
      if (probeInFlightRef.current) {
        return;
      }

      const browserReportsOnline =
        typeof navigator === "undefined" ? true : navigator.onLine;

      if (!force && !browserReportsOnline) {
        setBrowserOnline(false);
        setApiOnline(false);
        setLatencyMs(null);
        setConnectionIssue("offline");
        if (!offlineSinceRef.current) {
          offlineSinceRef.current = Date.now();
        }
        return;
      }

      probeInFlightRef.current = true;
      setChecking(true);
      try {
        const result = await pingApiHealth();
        // A successful fetch means connectivity works even if navigator.onLine is stale.
        const browserOk = result.ok ? true : browserReportsOnline;
        applyProbeResult(result, browserOk);
      } finally {
        probeInFlightRef.current = false;
        setChecking(false);
      }
    },
    [applyProbeResult],
  );

  useEffect(() => {
    if (!enabled) return undefined;

    function onOnline() {
      setBrowserOnline(true);
      void probe({ force: true });
    }
    function onOffline() {
      setBrowserOnline(false);
      setApiOnline(false);
      setLatencyMs(null);
      setConnectionIssue("offline");
      if (!offlineSinceRef.current) {
        offlineSinceRef.current = Date.now();
      }
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled, probe]);

  useEffect(() => {
    if (!enabled) return undefined;

    void probe();

    let timerId = null;

    function scheduleNext() {
      const interval = connectionIssueRef.current
        ? NETWORK_DEGRADED_PING_INTERVAL_MS
        : NETWORK_PING_INTERVAL_MS;

      timerId = window.setTimeout(() => {
        if (typeof document !== "undefined" && document.hidden) {
          scheduleNext();
          return;
        }
        void probe({ force: Boolean(connectionIssueRef.current) }).finally(scheduleNext);
      }, interval);
    }

    scheduleNext();

    function onVisibilityChange() {
      if (!document.hidden) {
        void probe({ force: Boolean(connectionIssueRef.current) });
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timerId != null) {
        window.clearTimeout(timerId);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, probe, connectionIssue]);

  const status = connectionIssue ?? "online";

  return {
    status,
    browserOnline,
    apiOnline,
    latencyMs,
    checking,
    refresh: () => probe({ force: true }),
  };
}
