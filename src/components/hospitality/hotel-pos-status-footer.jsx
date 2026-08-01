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
}) {
  const [now, setNow] = useState(() => new Date());
  const { status: connectionStatus } = useNetworkStatus({ reportOutages: false });

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
          </strong>
        </span>
        <span>
          <span className="hotel-pos-status-footer-label">HELD:</span>{" "}
          <strong className="hotel-pos-status-footer-value">{Number(heldCount) || 0}</strong>
        </span>
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
