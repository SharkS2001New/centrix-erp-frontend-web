"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatOrgCurrency } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";

/** Status strip from Light Stores panelControl1 — navy labels, maroon values. */
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
    hour12: false,
  });
}

/**
 * Pin Total so it lines up with the cart Amount column.
 */
function useAlignTotalsToAmountColumn(barRef, totalsRef, syncKey) {
  useLayoutEffect(() => {
    const bar = barRef.current;
    const totals = totalsRef.current;
    if (!bar || !totals) return undefined;

    function sync() {
      const amountCell =
        document.querySelector(".classic-pos-cart-table thead th.classic-pos-col-amt") ||
        document.querySelector(".classic-pos-cart-table td.classic-pos-col-amt");
      const wallGap = 0.75 * 16;

      if (!amountCell) {
        totals.style.marginRight = `${wallGap}px`;
        totals.style.width = "";
        return;
      }

      const barRect = bar.getBoundingClientRect();
      const amtRect = amountCell.getBoundingClientRect();
      const marginRight = Math.max(wallGap, barRect.right - amtRect.right);
      const width = Math.max(amtRect.width + 4 * 16, 7 * 16);
      totals.style.marginRight = `${marginRight}px`;
      totals.style.width = `${width}px`;
    }

    sync();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(bar);
    const table = document.querySelector(".classic-pos-cart-table");
    if (table) ro?.observe(table);
    window.addEventListener("resize", sync);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [barRef, totalsRef, syncKey]);
}

export function ClassicPosStatusFooter({
  user,
  totals = 0,
  heldCount = 0,
  pendingSync = 0,
  version = "1.0.0",
  currencySettings = GENERAL_DEFAULTS,
  statusMessage = null,
  connectionStatus = "online",
}) {
  const [now, setNow] = useState(() => new Date());
  const barRef = useRef(null);
  const totalsRef = useRef(null);
  useAlignTotalsToAmountColumn(barRef, totalsRef, `${totals}|${statusMessage ?? ""}`);


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
  const pendingCount = Math.max(0, Number(pendingSync) || 0);

  return (
    <footer className="classic-pos-footer">
      <div className="classic-pos-footer-bar" ref={barRef}>
        {statusMessage ? (
          <div className="classic-pos-footer-status" title={statusMessage}>
            {statusMessage}
          </div>
        ) : (
          <div className="classic-pos-footer-status classic-pos-footer-status--empty" />
        )}
        <div className="classic-pos-footer-totals" ref={totalsRef}>
          <div className="classic-pos-footer-total">
            Total: <strong>{formatOrgCurrency(totals, currencySettings)}</strong>
          </div>
        </div>
      </div>
      <div className="classic-pos-footer-meta">
        <span>
          <span className="classic-pos-footer-label">CURRENT USER:</span>{" "}
          <strong className="classic-pos-footer-value">{userLabel}</strong>
        </span>
        <span>
          <span className="classic-pos-footer-label">LINK:</span>{" "}
          <strong
            className={`classic-pos-footer-value classic-pos-footer-link classic-pos-footer-link--${
              connectionStatus === "online" ? "ok" : connectionStatus === "slow" ? "slow" : "down"
            }`}
          >
            {connectionLabel}
          </strong>
        </span>
        <span>
          <span className="classic-pos-footer-label">HELD:</span>{" "}
          <strong className="classic-pos-footer-value">{Number(heldCount) || 0}</strong>
        </span>
        <span>
          <span className="classic-pos-footer-label">PENDING SYNC:</span>{" "}
          <strong className="classic-pos-footer-value">{pendingCount}</strong>
        </span>
        <span>
          <span className="classic-pos-footer-label">RUN DATE:</span>{" "}
          <strong className="classic-pos-footer-value">{formatRunDate(now)}</strong>
        </span>
        <span>
          <span className="classic-pos-footer-label">TIME:</span>{" "}
          <strong className="classic-pos-footer-value">{formatClock(now)}</strong>
        </span>
        <span>
          <span className="classic-pos-footer-label">VERSION:</span>{" "}
          <strong className="classic-pos-footer-value">{version}</strong>
        </span>
      </div>
    </footer>
  );
}
