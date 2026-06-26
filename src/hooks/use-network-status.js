"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NETWORK_OUTAGE_REPORT_MIN_MS,
  NETWORK_PING_INTERVAL_MS,
  NETWORK_SLOW_THRESHOLD_MS,
  pingApiHealth,
  resolveNetworkStatus,
} from "@/lib/network-status";
import { submitSystemIssueReport } from "@/lib/system-issue-reports";

/**
 * Tracks browser online state + API reachability (latency via /health).
 * @returns {{
 *   status: 'online' | 'offline' | 'slow' | 'checking',
 *   browserOnline: boolean,
 *   apiOnline: boolean,
 *   latencyMs: number | null,
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

  const offlineSinceRef = useRef(null);
  const slowReportedRef = useRef(false);

  const probe = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setApiOnline(false);
      setLatencyMs(null);
      if (!offlineSinceRef.current) {
        offlineSinceRef.current = Date.now();
      }
      return;
    }

    setChecking(true);
    try {
      const result = await pingApiHealth();
      setApiOnline(result.ok);
      setLatencyMs(result.latencyMs);

      if (!result.ok) {
        if (!offlineSinceRef.current) {
          offlineSinceRef.current = Date.now();
        }
        slowReportedRef.current = false;
        return;
      }

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

      if (
        reportOutages
        && result.latencyMs >= NETWORK_SLOW_THRESHOLD_MS
        && !slowReportedRef.current
      ) {
        slowReportedRef.current = true;
        void submitSystemIssueReport({
          kind: "slow",
          message: `Slow connection (${Math.round(result.latencyMs / 1000)}s to reach API)`,
          api_path: "/health",
          http_method: "GET",
          duration_ms: result.latencyMs,
          context: { connectivity: "slow_ping" },
        });
      }
      if (result.latencyMs < NETWORK_SLOW_THRESHOLD_MS) {
        slowReportedRef.current = false;
      }
    } finally {
      setChecking(false);
    }
  }, [reportOutages]);

  useEffect(() => {
    if (!enabled) return undefined;

    function onOnline() {
      setBrowserOnline(true);
      void probe();
    }
    function onOffline() {
      setBrowserOnline(false);
      setApiOnline(false);
      setLatencyMs(null);
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
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      void probe();
    }, NETWORK_PING_INTERVAL_MS);

    function onVisibilityChange() {
      if (!document.hidden) {
        void probe();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, probe]);

  const status = checking && latencyMs === null && browserOnline
    ? "checking"
    : resolveNetworkStatus(browserOnline, apiOnline, latencyMs ?? 0);

  return {
    status,
    browserOnline,
    apiOnline,
    latencyMs,
    refresh: probe,
  };
}
