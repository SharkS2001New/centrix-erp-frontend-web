"use client";

import { useNetworkStatus } from "@/hooks/use-network-status";

/**
 * Sticky banner when the browser or API is unreachable, or latency is high.
 * @param {{ className?: string, reportOutages?: boolean }} props
 */
export function NetworkStatusBanner({ className = "", reportOutages = true }) {
  const { status, latencyMs, refresh } = useNetworkStatus({ reportOutages });

  if (status === "online" || status === "checking") {
    return null;
  }

  const isOffline = status === "offline";
  const message = isOffline
    ? "No internet or server unreachable. Changes may not save until you are back online."
    : `Slow connection${latencyMs ? ` (${(latencyMs / 1000).toFixed(1)}s)` : ""}. Some actions may take longer.`;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm ${
        isOffline
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <p className="font-medium">{message}</p>
      <button
        type="button"
        onClick={() => void refresh()}
        className="shrink-0 rounded-md border border-current/20 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
      >
        Retry
      </button>
    </div>
  );
}
