"use client";

import { useEffect, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";

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
}) {
  const [now, setNow] = useState(() => new Date());
  // Same recovery path as the shell banner: ping immediately on `online`,
  // and poll faster while offline so status flips back without waiting ~2 min.
  const { status } = useNetworkStatus({ reportOutages: false });
  const systemOnline = status === "online" || status === "slow";

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const username = user?.username?.trim() || user?.full_name?.trim() || "";
  const loginLabel = username ? `Logged in User: ${username}` : "Logged in User: —";

  return (
    <footer className="grid shrink-0 grid-cols-1 gap-3 border-t border-[var(--theme-border)] bg-[var(--theme-surface)] px-5 py-4 text-sm text-[var(--theme-text-muted)] sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <span
          className="block truncate text-base font-medium text-[var(--theme-text)]"
          title={loginLabel}
        >
          {loginLabel}
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
