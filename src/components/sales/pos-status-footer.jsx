"use client";

import { useEffect, useState } from "react";
import { NETWORK_PING_INTERVAL_MS, pingApiHealth } from "@/lib/network-status";

function formatClock(date) {
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PosStatusFooter({
  user,
  organization,
}) {
  const [now, setNow] = useState(() => new Date());
  const [browserOnline, setBrowserOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine,
  );
  const [apiOnline, setApiOnline] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function onOnline() {
      setBrowserOnline(true);
    }
    function onOffline() {
      setBrowserOnline(false);
      setApiOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (!navigator.onLine) {
        if (!cancelled) setApiOnline(false);
        return;
      }
      try {
        const result = await pingApiHealth();
        if (!cancelled) setApiOnline(result.ok);
      } catch {
        if (!cancelled) setApiOnline(false);
      }
    }

    ping();
    const timer = setInterval(ping, NETWORK_PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const systemOnline = browserOnline && apiOnline;
  const loginLabel = [
    organization?.company_code,
    user?.full_name ?? user?.username,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <footer className="grid shrink-0 grid-cols-1 gap-3 border-t border-[var(--theme-border)] bg-[var(--theme-surface)] px-5 py-4 text-sm text-[var(--theme-text-muted)] sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <span
          className="block truncate text-base font-medium text-[var(--theme-text)]"
          title={loginLabel}
        >
          {loginLabel || "Signed in"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:justify-end">
        <span className="text-sm tabular-nums">{formatClock(now)}</span>
        <span
          className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
            systemOnline ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              systemOnline ? "bg-emerald-500" : "bg-red-500"
            }`}
            aria-hidden
          />
          {systemOnline ? "Online" : "Offline"}
        </span>
      </div>
    </footer>
  );
}
