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
  failedSyncOrders = [],
  onPrintFailed,
  compact = false,
  className = "",
}) {
  const total = Number(syncProgress?.total ?? 0);
  const current = Number(syncProgress?.current ?? 0);
  const done = Number(syncProgress?.done ?? 0);
  const failed = Number(syncProgress?.failed ?? 0);
  const phase = syncProgress?.phase ?? "idle";
  const showBar =
    syncing && total > 0 && (phase === "start" || phase === "syncing" || phase === "item_done");
  const pct = total > 0 ? Math.min(100, Math.round(((done + failed) / total) * 100)) : 0;

  const hasPending = pendingSync > 0;
  const failedOrders = Array.isArray(failedSyncOrders) ? failedSyncOrders : [];
  const latestFailed = failedOrders[0] ?? null;
  const failedBrowseNum =
    latestFailed?.pos_order_num ??
    latestFailed?.order_num ??
    null;
  const showPrintFailed = failedOrders.length > 0 && !syncing && typeof onPrintFailed === "function";
  const showSyncButton = syncing || hasPending || failedOrders.length > 0;

  if (!showSyncButton && !showPrintFailed && !showBar) {
    return null;
  }

  const label =
    syncProgress?.message ||
    (syncing
      ? total > 0
        ? `Syncing ${Math.max(current, done + failed)} of ${total}…`
        : "Syncing offline orders…"
      : lastSyncMessage ||
        (failedOrders.length > 0
          ? `${failedOrders.length} offline order(s) need a manual sync retry`
          : hasPending
            ? `${pendingSync} offline order(s) waiting to sync`
            : null));

  const disabled = syncing || !canFlush || (!hasPending && failedOrders.length === 0);
  const title = !canFlush
    ? "Reconnect to sync offline orders"
    : syncing
      ? "Sync in progress…"
      : hasPending
        ? `Sync ${pendingSync} pending offline order(s)`
        : failedOrders.length > 0
          ? `Retry sync for ${failedOrders.length} failed offline order(s)`
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
        {showPrintFailed ? (
          <button
            type="button"
            disabled={syncing}
            title={
              failedBrowseNum != null
                ? `Print receipt for failed offline order #${failedBrowseNum}`
                : "Print receipt for the failed offline order"
            }
            onClick={() => void onPrintFailed?.(latestFailed)}
            className={
              compact
                ? "pos-header-action-btn inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                : "shrink-0 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {failedBrowseNum != null
              ? `Print failed #${failedBrowseNum}`
              : "Print failed receipt"}
          </button>
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
            <span className="pos-header-btn-label" data-short={syncing ? "Syncing…" : "Sync"}>
              {syncing
                ? total > 0
                  ? `Syncing ${done + failed}/${total}`
                  : "Syncing…"
                : hasPending
                  ? `Sync offline (${pendingSync})`
                  : failedOrders.length > 0
                    ? `Retry sync (${failedOrders.length})`
                    : "Sync offline"}
            </span>
          </button>
        ) : null}
      </div>
      {compact && label && (syncing || pendingSync > 0 || showPrintFailed) ? (
        <p className="max-w-[14rem] truncate text-[10px] font-medium text-[var(--theme-text-muted)]">
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
