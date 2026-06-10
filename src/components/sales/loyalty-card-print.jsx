"use client";

export function printLoyaltyCard(card, organizationName = "POS / ERP") {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Loyalty card ${card.card_number}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
    .card {
      width: 340px; border: 2px solid #185FA5; border-radius: 16px;
      padding: 20px; background: linear-gradient(135deg, #E6F1FB 0%, #fff 60%);
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
    }
    .org { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #0C447C; }
    h1 { margin: 8px 0 4px; font-size: 18px; color: #0C447C; }
    .num { font-family: ui-monospace, monospace; font-size: 22px; font-weight: 700; color: #185FA5; }
    .meta { margin-top: 16px; font-size: 13px; color: #334155; line-height: 1.5; }
    .pts { margin-top: 12px; font-size: 28px; font-weight: 700; color: #185FA5; }
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
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=420,height=320");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
