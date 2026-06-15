import { accountOptionLabel, formatAccountingAmount, journalStatusLabel } from "@/lib/accounting-shared";
import { formatShortDate } from "@/components/catalog/catalog-shared";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printJournalEntry(entry, { organizationName = "POS / ERP" } = {}) {
  if (!entry) return;

  const lines = entry.lines ?? [];
  const lineRows = lines
    .map((line) => {
      const account = line.account ?? {};
      const label = accountOptionLabel(account);
      const debit = Number(line.debit ?? 0) > 0 ? formatAccountingAmount(line.debit) : "—";
      const credit = Number(line.credit ?? 0) > 0 ? formatAccountingAmount(line.credit) : "—";
      return `<tr>
        <td>${escapeHtml(label)}</td>
        <td class="num">${escapeHtml(debit)}</td>
        <td class="num">${escapeHtml(credit)}</td>
      </tr>`;
    })
    .join("");

  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Journal Entry ${escapeHtml(entry.entry_number)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111827; }
    .wrap { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #475569; font-size: 14px; margin-bottom: 20px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; text-align: left; }
    th { background: #f8fafc; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
    td.num { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; border-top: 2px solid #cbd5e1; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div style="text-align:center;margin-bottom:16px;font-weight:700;">${escapeHtml(organizationName)}</div>
    <h1>Journal Entry ${escapeHtml(entry.entry_number)}</h1>
    <div class="meta">
      <div>Date: ${escapeHtml(formatShortDate(entry.entry_date))}</div>
      <div>Description: ${escapeHtml(entry.description ?? "—")}</div>
      <div>Status: ${escapeHtml(journalStatusLabel(entry.status).toUpperCase())}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th class="num">Debit</th>
          <th class="num">Credit</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
      <tfoot>
        <tr>
          <td>TOTAL</td>
          <td class="num">${escapeHtml(formatAccountingAmount(totalDebit))}</td>
          <td class="num">${escapeHtml(formatAccountingAmount(totalCredit))}</td>
        </tr>
      </tfoot>
    </table>
  </div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=820,height=720");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
