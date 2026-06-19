"use client";

import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { openPrintWindow } from "@/lib/open-print-window";
export function printLoyaltyCard(card, organizationName = DEFAULT_PRINT_ORG_NAME) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Loyalty card ${card.card_number}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
    .card {
      width: 340px; border: 2px solid var(--theme-primary); border-radius: 16px;
      padding: 20px; background: linear-gradient(135deg, var(--theme-primary-muted) 0%, #fff 60%);
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
    }
    .org { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: var(--theme-accent-text); }
    h1 { margin: 8px 0 4px; font-size: 18px; color: var(--theme-accent-text); }
    .num { font-family: ui-monospace, monospace; font-size: 22px; font-weight: 700; color: var(--theme-primary); }
    .meta { margin-top: 16px; font-size: 13px; color: #334155; line-height: 1.5; }
    .pts { margin-top: 12px; font-size: 28px; font-weight: 700; color: var(--theme-primary); }
  </style>
</head>
<body>
  <div class="card">
    <div class="org">${organizationName}</div>
    <h1>Loyalty card</h1>
    <div class="num">${card.card_number}</div>
    <div class="meta">
      <div><strong>${card.customer_name ?? "Customer"}</strong></div>
      <div>${card.phone_number ?? ""}</div>
      <div>Issued ${card.issued_at ? String(card.issued_at).slice(0, 10) : "—"}</div>
    </div>
    <div class="pts">${Number(card.points_balance ?? 0).toLocaleString()} pts</div>
  </div>
</body>
</html>`;

  openPrintWindow(html, "width=420,height=320");
}
