import {
  buildBrandedA4DocumentHtml,
  escapeHtml,
  formatDocAmount,
  formatDocDate,
  resolveDocumentBranding,
} from "@/lib/branded-document-print";
import { brandingWithDocumentLogo } from "@/lib/document-logo-settings";
import { printHtmlDocument } from "@/lib/print-dispatch";

function money(value) {
  const n = Number(value) || 0;
  const formatted = formatDocAmount(Math.abs(n));
  return n < 0 ? `-${formatted}` : formatted;
}

function customerAddress(customer) {
  return [customer?.town, customer?.phone_number].filter(Boolean).join(", ") || "—";
}

/**
 * Ledger-style customer statement print (DATE / DESCRIPTION / AMOUNT / BALANCE)
 * matching printed AR statements: invoices, credit notes, payments, aging footer.
 */
export function buildCustomerStatementPrintHtml({
  customer,
  lines,
  summary,
  aging,
  organization = null,
  generalSettings = null,
} = {}) {
  const branding = brandingWithDocumentLogo(
    resolveDocumentBranding({ organization, generalSettings }),
    generalSettings,
    "invoice",
  );
  const statementNo = summary?.statement_no ?? customer?.customer_num ?? "—";
  const statementDate = formatDocDate(summary?.to_date || new Date().toISOString().slice(0, 10));
  const amountDue = Number(summary?.amount_due ?? summary?.outstanding_balance ?? 0);
  const totalPaid = Number(summary?.total_paid ?? 0);
  const totalCredits = Number(summary?.total_credits ?? 0);

  const rowHtml = (lines ?? [])
    .map((row) => {
      const amount = Number(row.amount) || 0;
      const amountCell = row.hideAmount || (amount === 0 && row.type === "forward") ? "" : money(amount);
      return `<tr>
        <td>${escapeHtml(formatDocDate(row.date))}</td>
        <td>${escapeHtml(row.description)}</td>
        <td class="num">${escapeHtml(amountCell)}</td>
        <td class="num">${escapeHtml(money(row.balance))}</td>
      </tr>`;
    })
    .join("");

  const agingRow = aging
    ? `<table class="doc-items aging-table">
        <thead>
          <tr>
            <th>Current Due</th>
            <th class="num">1-30 Days Past Due</th>
            <th class="num">31-60 Days Past Due</th>
            <th class="num">61-90 Days Past Due</th>
            <th class="num">90+ Days Past Due</th>
            <th class="num">Amount Due</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="num">${escapeHtml(money(aging.current))}</td>
            <td class="num">${escapeHtml(money(aging.days_1_30))}</td>
            <td class="num">${escapeHtml(money(aging.days_31_60))}</td>
            <td class="num">${escapeHtml(money(aging.days_61_90))}</td>
            <td class="num">${escapeHtml(money(aging.days_90_plus))}</td>
            <td class="num"><strong>Ksh${escapeHtml(formatDocAmount(aging.amount_due ?? amountDue))}</strong></td>
          </tr>
        </tbody>
      </table>`
    : "";

  const bodyHtml = `
    <div class="statement-head">
      <div>
        <p><span class="meta-label">TO:</span> ${escapeHtml(customer?.customer_name ?? "—")}</p>
        <p>${escapeHtml(customerAddress(customer))}</p>
      </div>
      <div class="statement-meta">
        <p><span class="meta-label">STATEMENT NO.:</span> ${escapeHtml(String(statementNo))}</p>
        <p><span class="meta-label">DATE:</span> ${escapeHtml(statementDate)}</p>
        <p><span class="meta-label">TOTAL DUE:</span> Ksh${escapeHtml(formatDocAmount(amountDue))}</p>
      </div>
    </div>
    <table class="doc-items">
      <thead>
        <tr>
          <th>DATE</th>
          <th>DESCRIPTION</th>
          <th class="num">AMOUNT</th>
          <th class="num">BALANCE</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml || `<tr><td colspan="4">No transactions in this period.</td></tr>`}
      </tbody>
    </table>
    <div class="totals-row">
      <div class="totals-box">
        <p><strong>Amount:</strong> Ksh${escapeHtml(formatDocAmount(amountDue + totalPaid))}</p>
        <p><strong>Paid:</strong> (${escapeHtml(formatDocAmount(totalPaid))})</p>
        ${totalCredits ? `<p><strong>Credit notes:</strong> (${escapeHtml(formatDocAmount(totalCredits))})</p>` : ""}
        <p><strong>Balance:</strong> Ksh${escapeHtml(formatDocAmount(amountDue))}</p>
      </div>
    </div>
    ${agingRow}
  `;

  const html = buildBrandedA4DocumentHtml({
    title: "Statement",
    branding,
    organization,
    generalSettings,
    bodyHtml,
    printedBy: null,
  });

  return html.replace(
    "</style>",
    `
    .statement-head { display:flex; justify-content:space-between; gap:24px; margin-bottom:12px; align-items:flex-start; }
    .statement-meta { text-align:right; }
    .statement-meta p, .statement-head p { margin:2px 0; }
    table.aging-table { margin-top:16px; }
    .doc-title { text-align:left; font-size:22px; letter-spacing:0.04em; }
    </style>`,
  );
}

export function printCustomerStatement(payload) {
  const html = buildCustomerStatementPrintHtml(payload);
  return printHtmlDocument(html, { jobType: "document" });
}
