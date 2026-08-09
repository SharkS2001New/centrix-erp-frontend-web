"use client";

/**
 * Manual offline-order sync control with a progress bar.
 * Hidden when the outbox is empty and idle so sync stays silent until
 * something is waiting, failing, or actively syncing.
 */
export function PosOfflineSyncControls({
  pendingSync = 0,
  syncing = false,
  canFlush = false,
  syncProgress = null,
  lastSyncMessage = null,
  onSync,
  compact = false,
  className = "",
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
  const pct = total > 0 ? Math.min(100, Math.round(((done + failed) / total) * 100)) : 0;

  const hasPending = pendingSync > 0;
  // Never show Sync chrome when the queue is empty — even if syncing flag is sticky.
  const activelySyncingQueue = syncing && hasPending;
  const showSyncButton = hasPending;

  if (!showSyncButton && !showBar) {
    return null;
  }

  const label =
    activelySyncingQueue
      ? syncProgress?.message ||
        (total > 0
          ? `Syncing ${Math.max(current, done + failed)} of ${total}…`
          : "Syncing offline orders…")
      : lastSyncMessage && hasPending
        ? lastSyncMessage
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
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "justify-between"}`}>
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
            <span className="pos-header-btn-label" data-short={activelySyncingQueue ? "Syncing…" : "Sync"}>
              {activelySyncingQueue
                ? total > 0
                  ? `Syncing ${done + failed}/${total}`
                  : "Syncing…"
                : hasPending
                  ? `Sync offline (${pendingSync})`
                  : "Sync offline"}
            </span>
          </button>
        ) : null}
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
