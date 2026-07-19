"use client";

import { useEffect, useState } from "react";
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

export function ClassicPosStatusFooter({
  user,
  totals = 0,
  heldCount = 0,
  version = "1.0.0",
  currencySettings = GENERAL_DEFAULTS,
  actions = null,
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const userLabel = String(user?.full_name ?? user?.username ?? "—").toUpperCase();

  return (
    <footer className="classic-pos-footer">
      <div className="classic-pos-footer-bar">
        {actions ? <div className="classic-pos-footer-actions">{actions}</div> : null}
        <div className="classic-pos-footer-total">
          Totals: <strong>{formatOrgCurrency(totals, currencySettings)}</strong>
        </div>
      </div>
      <div className="classic-pos-footer-meta">
        <span>
          <span className="classic-pos-footer-label">CURRENT USER:</span>{" "}
          <strong className="classic-pos-footer-value">{userLabel}</strong>
        </span>
        <span>
          <span className="classic-pos-footer-label">HELD:</span>{" "}
          <strong className="classic-pos-footer-value">{Number(heldCount) || 0}</strong>
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
