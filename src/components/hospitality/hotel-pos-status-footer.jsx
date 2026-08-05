"use client";

import { useEffect, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";

function formatRunDate(date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatClock(date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Classic-style status strip under the Hotel POS catalogue. */
export function HotelPosStatusFooter({
  user,
  heldCount = 0,
  version = "1.0.0",
  connectionStatus: connectionStatusProp = null,
  pendingSync = 0,
  failedSyncCount = 0,
  checkNumbersLeft = null,
  syncing = false,
  offlineMode = false,
  onSync = null,
  onReprintFailed = null,
}) {
  const [now, setNow] = useState(() => new Date());
  const network = useNetworkStatus({
    enabled: connectionStatusProp == null,
    reportOutages: false,
  });
  const connectionStatus = connectionStatusProp ?? network.status;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const userLabel = String(user?.full_name ?? user?.username ?? "—").toUpperCase();
  const connectionLabel =
    connectionStatus === "offline"
      ? "OFFLINE"
      : connectionStatus === "slow"
        ? "SLOW"
        : "ONLINE";
  const failed = Number(failedSyncCount) || 0;

  return (
    <footer className="hotel-pos-status-footer shrink-0">
      <div className="hotel-pos-status-footer-meta">
        <span>
          <span className="hotel-pos-status-footer-label">CURRENT USER:</span>{" "}
          <strong className="hotel-pos-status-footer-value">{userLabel}</strong>
        </span>
        <span>
          <span className="hotel-pos-status-footer-label">LINK:</span>{" "}
          <strong
            className={`hotel-pos-status-footer-value hotel-pos-status-footer-link hotel-pos-status-footer-link--${
              connectionStatus === "online" ? "ok" : connectionStatus === "slow" ? "slow" : "down"
            }`}
          >
            {connectionLabel}
            {offlineMode ? " · LOCAL" : ""}
          </strong>
        </span>
        <span>
          <span className="hotel-pos-status-footer-label">HELD:</span>{" "}
          <strong className="hotel-pos-status-footer-value">{Number(heldCount) || 0}</strong>
        </span>
        <span>
          <span className="hotel-pos-status-footer-label">PENDING SYNC:</span>{" "}
          <strong className="hotel-pos-status-footer-value">{Number(pendingSync) || 0}</strong>
          {typeof onSync === "function" ? (
            <button
              type="button"
              disabled={syncing}
              onClick={() => void onSync()}
              className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-accent)] underline-offset-2 hover:underline disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync"}
            </button>
          ) : null}
        </span>
        {failed > 0 ? (
          <span>
            <span className="hotel-pos-status-footer-label">SYNC FAILED:</span>{" "}
            <strong className="hotel-pos-status-footer-value text-red-600">{failed}</strong>
            {typeof onReprintFailed === "function" ? (
              <button
                type="button"
                onClick={() => void onReprintFailed()}
                className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 underline-offset-2 hover:underline"
              >
                Reprint
              </button>
            ) : null}
          </span>
        ) : null}
        {checkNumbersLeft != null ? (
          <span>
            <span className="hotel-pos-status-footer-label"># LEFT:</span>{" "}
            <strong className="hotel-pos-status-footer-value">{Number(checkNumbersLeft) || 0}</strong>
          </span>
        ) : null}
        <span>
          <span className="hotel-pos-status-footer-label">RUN DATE:</span>{" "}
          <strong className="hotel-pos-status-footer-value">{formatRunDate(now)}</strong>
        </span>
        <span>
          <span className="hotel-pos-status-footer-label">TIME:</span>{" "}
          <strong className="hotel-pos-status-footer-value">{formatClock(now)}</strong>
        </span>
        <span>
          <span className="hotel-pos-status-footer-label">VERSION:</span>{" "}
          <strong className="hotel-pos-status-footer-value">{version}</strong>
        </span>
      </div>
    </footer>
  );
}
