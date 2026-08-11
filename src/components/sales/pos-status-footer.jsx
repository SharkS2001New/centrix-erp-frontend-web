"use client";

import { useEffect, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { formatOrgCurrency } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";

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
  organization: _organization,
  totals = null,
  heldCount = null,
  pendingSync = null,
  statusMessage = null,
  connectionStatus = null,
  currencySettings = GENERAL_DEFAULTS,
}) {
  const [now, setNow] = useState(() => new Date());
  // Same recovery path as the shell banner: ping immediately on `online`,
  // and poll faster while offline so status flips back without waiting ~2 min.
  const { status } = useNetworkStatus({ reportOutages: false });
  const liveStatus = connectionStatus ?? status;
  const systemOnline = liveStatus === "online" || liveStatus === "slow";

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const username = user?.username?.trim() || user?.full_name?.trim() || "";
  const loginLabel = username ? `Logged in User: ${username}` : "Logged in User: —";
  const showOpsMeta =
    totals != null || heldCount != null || pendingSync != null || statusMessage;

  return (
    <footer className="grid shrink-0 grid-cols-1 gap-2 border-t border-[var(--theme-border)] bg-[var(--theme-surface)] px-5 py-3 text-sm text-[var(--theme-text-muted)] sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0 space-y-1">
        <span
          className="block truncate text-base font-medium text-[var(--theme-text)]"
          title={loginLabel}
        >
          {loginLabel}
        </span>
        {statusMessage ? (
          <p className="truncate text-xs text-[var(--theme-accent-text)]" title={statusMessage}>
            {statusMessage}
          </p>
        ) : null}
        {showOpsMeta ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {totals != null ? (
              <span>
                Total:{" "}
                <strong className="tabular-nums text-[var(--theme-text)]">
                  {formatOrgCurrency(totals, currencySettings)}
                </strong>
              </span>
            ) : null}
            {heldCount != null ? (
              <span>
                Held: <strong className="text-[var(--theme-text)]">{Number(heldCount) || 0}</strong>
              </span>
            ) : null}
            {pendingSync != null ? (
              <span>
                Pending sync:{" "}
                <strong className="text-[var(--theme-text)]">{Number(pendingSync) || 0}</strong>
              </span>
            ) : null}
          </div>
        ) : null}
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
          {liveStatus === "slow" ? "Slow" : systemOnline ? "Online" : "Offline"}
        </span>
      </div>
    </footer>
  );
}
