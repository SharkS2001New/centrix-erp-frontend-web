"use client";

import { useEffect, useState } from "react";
import { formatOrgCurrency } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";

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
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const userLabel = String(user?.full_name ?? user?.username ?? "—").toUpperCase();

  return (
    <footer className="classic-pos-footer">
      <div className="classic-pos-footer-totals">
        <span className="classic-pos-footer-total">
          Totals: <strong>{formatOrgCurrency(totals, currencySettings)}</strong>
        </span>
      </div>
      <div className="classic-pos-footer-meta">
        <span>
          CURRENT USER: <strong className="classic-pos-accent">{userLabel}</strong>
        </span>
        <span>
          HELD: <strong>{Number(heldCount) || 0}</strong>
        </span>
        <span>
          RUN DATE: <strong>{formatRunDate(now)}</strong>
        </span>
        <span>
          TIME: <strong>{formatClock(now)}</strong>
        </span>
        <span>
          VERSION: <strong>{version}</strong>
        </span>
      </div>
    </footer>
  );
}
