"use client";

import { formatElapsedDuration } from "@/lib/format-elapsed";
import { useLiveElapsedMs } from "@/hooks/use-live-elapsed-ms";

/**
 * Manual offline-order sync control with a progress bar.
 * Hidden when the outbox is empty and idle so sync stays silent until
 * something is waiting, failing, or actively syncing.
 */

/** @param {{ total?: number, done?: number, failed?: number, current?: number, phase?: string } | null} progress */
export function syncProgressPercent(progress) {
  const total = Number(progress?.total ?? 0);
  if (!(total > 0)) return 0;
  const done = Math.max(0, Number(progress?.done ?? 0));
  const failed = Math.max(0, Number(progress?.failed ?? 0));
  const current = Math.max(0, Number(progress?.current ?? 0));
  const phase = progress?.phase ?? "idle";
  const completed = done + failed;
  // Credit half an item while one is uploading so % moves before the last finishes.
  const inFlight =
    (phase === "start" || phase === "syncing") && current > completed ? 0.5 : 0;
  return Math.min(100, Math.round(((completed + inFlight) / total) * 100));
}

/** Live "Offline 12m 05s" label — far right of the pending-sync row. */
export function OfflineSellingDurationLabel({
  sinceMs = null,
  show = true,
  className = "",
}) {
  const elapsed = useLiveElapsedMs(show ? sinceMs : null);
  if (!show || !sinceMs) return null;
  return (
    <span
      className={`shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums ${className}`.trim()}
      title="Time selling offline with orders queued for sync"
    >
      Offline {formatElapsedDuration(elapsed)}
    </span>
  );
}

export function PosOfflineSyncControls({
  pendingSync = 0,
  syncing = false,
  canFlush = false,
  syncProgress = null,
  lastSyncMessage = null,
  onSync,
  compact = false,
  className = "",
  offlineMode = false,
  offlineSellingSinceMs = null,
}) {
  const total = Number(syncProgress?.total ?? 0);
  const current = Number(syncProgress?.current ?? 0);
  const done = Number(syncProgress?.done ?? 0);
  const failed = Number(syncProgress?.failed ?? 0);
  const phase = syncProgress?.phase ?? "idle";
  const showBar =
    syncing &&
    pendingSync > 0 &&
    total > 0 &&
    (phase === "start" || phase === "syncing" || phase === "item_done");
  const pct = syncProgressPercent(syncProgress);
  const finishedCount = done + failed;
  const positionLabel =
    total > 0 ? `${Math.max(current, finishedCount)}/${total}` : null;

  const hasPending = pendingSync > 0;
  const showOfflineDuration =
    offlineMode && offlineSellingSinceMs != null && hasPending;
  // Never show Sync chrome when the queue is empty — even if syncing flag is sticky.
  const activelySyncingQueue = syncing && hasPending;
  const showSyncButton = hasPending;
  // A prior empty flush can leave this message stuck while editing rows still show.
  const usefulLastMessage =
    lastSyncMessage &&
    !(hasPending && /no offline orders waiting to sync/i.test(String(lastSyncMessage)))
      ? lastSyncMessage
      : null;

  if (!showSyncButton && !showBar) {
    return null;
  }

  const label =
    activelySyncingQueue
      ? syncProgress?.message
        ? total > 0
          ? `${syncProgress.message.replace(/\s*…\s*$/, "")} · ${pct}%`
          : syncProgress.message
        : total > 0
          ? `Syncing ${positionLabel} · ${pct}%…`
          : "Syncing offline orders…"
      : usefulLastMessage && hasPending
        ? usefulLastMessage
        : hasPending
          ? `${pendingSync} offline order(s) waiting to sync`
          : null;

  const disabled = syncing || !canFlush || !hasPending;
  const title = !canFlush
    ? "Reconnect to sync offline orders"
    : syncing
      ? "Sync in progress…"
      : hasPending
        ? `Sync ${pendingSync} pending offline order(s)`
        : "No offline orders waiting to sync";

  return (
    <div
      className={`flex flex-col gap-1.5 ${compact ? "" : "w-full"} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "justify-between w-full"}`}>
        {!compact && label ? (
          <p className="min-w-0 flex-1 text-xs font-medium leading-snug">{label}</p>
        ) : null}
        {showSyncButton ? (
          <button
            type="button"
            disabled={disabled}
            title={title}
            onClick={() => void onSync?.()}
            className={
              compact
                ? "pos-header-action-btn inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-50"
                : "shrink-0 rounded-md border border-sky-400 bg-white px-2.5 py-1 text-xs font-semibold text-sky-950 shadow-sm hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            }
            aria-busy={syncing}
          >
            <span
              className="pos-header-btn-label"
              data-short={
                activelySyncingQueue
                  ? total > 0
                    ? `${positionLabel} · ${pct}%`
                    : "Syncing…"
                  : "Sync"
              }
            >
              {activelySyncingQueue
                ? total > 0
                  ? `Syncing ${positionLabel} · ${pct}%`
                  : "Syncing…"
                : hasPending
                  ? `Sync offline (${pendingSync})`
                  : "Sync offline"}
            </span>
          </button>
        ) : null}
        <OfflineSellingDurationLabel
          sinceMs={offlineSellingSinceMs}
          show={showOfflineDuration}
          className={compact ? "opacity-90" : "text-sky-900"}
        />
      </div>
      {compact && label && (activelySyncingQueue || pendingSync > 0) ? (
        <p className="max-w-[16rem] truncate text-[10px] font-medium leading-tight opacity-90">
          {label}
        </p>
      ) : null}
      {showBar ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-sky-200/80"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          role="progressbar"
          aria-label="Offline order sync progress"
        >
          <div
            className="h-full rounded-full bg-sky-600 transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
