import { escapeHtml } from "@/lib/sale-document-print-shared";
import { calculateInvoiceTotals, normalizeInvoiceOptions, normalizeSeller } from "@/lib/platform-invoices";

function formatMoney(amount, currency = "KES") {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  return `${currency} ${value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function activeLines(lineItems) {
  return (lineItems ?? []).filter((row) => row.included !== false);
}

function lineRowsHtml(lineItems, currency, { compact = false, showQuantity = true } = {}) {
  const rows = activeLines(lineItems);
  if (!rows.length) {
    const colspan = showQuantity ? 4 : 3;
    return `<tr><td colspan="${colspan}" class="empty">No line items</td></tr>`;
  }
  return rows
    .map((row, index) => {
      const qty = Number(row.quantity ?? 1);
      const unit = Number(row.unit_price ?? 0);
      const amount = row.amount != null ? Number(row.amount) : qty * unit;
      const qtyCell = showQuantity
        ? `<td class="qty">${escapeHtml(String(qty))}</td>`
        : "";
      return `<tr>
        <td class="num">${index + 1}</td>
        <td class="desc">${escapeHtml(row.description ?? "")}</td>
        ${qtyCell}
        <td class="amt">${escapeHtml(formatMoney(amount, currency))}</td>
      </tr>`;
    })
    .join("");
}

function partyBlock(title, party) {
  if (!party) return "";
  const lines = [
    party.name,
    party.company_code ? `Code: ${party.company_code}` : null,
    party.address,
    party.email,
    party.phone,
    party.tax_pin ? `PIN: ${party.tax_pin}` : null,
  ].filter(Boolean);
  return `<div class="party">
    <p class="party-label">${escapeHtml(title)}</p>
    ${lines.map((line) => `<p class="party-line">${escapeHtml(line)}</p>`).join("")}
  </div>`;
}

function totalsBlock(totals, currency, taxRate) {
  return `<div class="totals">
    <div class="total-row"><span>Subtotal</span><span>${escapeHtml(formatMoney(totals.subtotal, currency))}</span></div>
    <div class="total-row"><span>VAT (${escapeHtml(String(taxRate))}%)</span><span>${escapeHtml(formatMoney(totals.tax_amount, currency))}</span></div>
    <div class="total-row grand"><span>Total due</span><span>${escapeHtml(formatMoney(totals.total, currency))}</span></div>
  </div>`;
}

function brandHeaderHtml(options) {
  const brandName = options.brand_name || "CentrixERP";
  const showLogo = options.brand_mode === "logo" || options.brand_mode === "both";
  const showName = options.brand_mode === "name" || options.brand_mode === "both" || !showLogo;
  const logoUrl = options.brand_logo_url?.trim();

  const logo = showLogo && logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" class="brand-logo" />`
    : "";
  const name = showName
    ? `<p class="brand-name">${escapeHtml(brandName)}</p>`
    : "";

  return `<div class="brand">${logo}${name}</div>`;
}

function watermarkHtml(options) {
  if (!options.watermark_enabled) return "";

  const mode = options.watermark_mode || "name";
  const text = options.watermark_text || options.brand_name || "CentrixERP";
  const logoUrl = options.watermark_logo_url?.trim() || options.brand_logo_url?.trim();

  if (mode === "logo" && logoUrl) {
    return `<div class="watermark watermark-logo" style="background-image:url('${escapeHtml(logoUrl)}')"></div>`;
  }

  const label = mode === "text" ? text : text;
  return `<div class="watermark watermark-text" aria-hidden="true">${escapeHtml(label)}</div>`;
}

function baseStyles(templateId) {
  const themes = {
    modern: { accent: "#2563eb", bg: "#f8fafc", font: "system-ui, sans-serif" },
    classic: { accent: "#1e293b", bg: "#ffffff", font: "Georgia, serif" },
    minimal: { accent: "#64748b", bg: "#ffffff", font: "system-ui, sans-serif" },
    corporate: { accent: "#0f172a", bg: "#ffffff", font: "system-ui, sans-serif" },
    bold: { accent: "#dc2626", bg: "#ffffff", font: "system-ui, sans-serif" },
    elegant: { accent: "#78350f", bg: "#fffbeb", font: "Georgia, 'Times New Roman', serif" },
    stripe: { accent: "#635bff", bg: "#ffffff", font: "system-ui, sans-serif" },
    compact: { accent: "#334155", bg: "#ffffff", font: "system-ui, sans-serif" },
  };
  const t = themes[templateId] ?? themes.modern;
  const compact = templateId === "compact";
  return `
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; font-family: ${t.font}; color: #0f172a; background: ${t.bg}; font-size: ${compact ? "11px" : "13px"}; line-height: 1.45; }
    .sheet { position: relative; max-width: 800px; margin: 0 auto; background: #fff; border-radius: ${templateId === "minimal" ? "0" : "8px"}; overflow: hidden; box-shadow: ${templateId === "minimal" ? "none" : "0 1px 3px rgba(0,0,0,.08)"}; border: ${templateId === "classic" ? "1px solid #cbd5e1" : "none"}; }
    .sheet-body { position: relative; z-index: 1; }
    .watermark { position: absolute; inset: 0; z-index: 0; pointer-events: none; user-select: none; }
    .watermark-text { display: flex; align-items: center; justify-content: center; font-size: 72px; font-weight: 800; letter-spacing: 0.08em; color: rgba(15, 23, 42, 0.06); transform: rotate(-28deg); text-transform: uppercase; white-space: nowrap; }
    .watermark-logo { background-repeat: no-repeat; background-position: center; background-size: 45%; opacity: 0.07; }
    .header { padding: ${compact ? "16px 20px" : "24px 28px"}; background: ${templateId === "corporate" || templateId === "bold" ? t.accent : templateId === "stripe" ? "#f6f9fc" : "#fff"}; color: ${templateId === "corporate" || templateId === "bold" ? "#fff" : "#0f172a"}; ${templateId === "modern" ? `border-top: 4px solid ${t.accent};` : ""} ${templateId === "stripe" ? `border-left: 6px solid ${t.accent};` : ""} }
    .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .brand-logo { max-height: 42px; max-width: 180px; object-fit: contain; }
    .brand-name { margin: 0; font-size: ${compact ? "14px" : "16px"}; font-weight: 700; letter-spacing: 0.02em; }
    .header h1 { margin: 0; font-size: ${templateId === "bold" ? "32px" : templateId === "elegant" ? "28px" : "22px"}; font-weight: 700; letter-spacing: ${templateId === "elegant" ? "0.02em" : "0"}; }
    .header .meta { margin-top: 8px; opacity: ${templateId === "corporate" || templateId === "bold" ? "0.9" : "1"}; font-size: ${compact ? "10px" : "12px"}; }
    .body { padding: ${compact ? "16px 20px 20px" : "24px 28px 28px"}; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .party-label { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 600; }
    .party-line { margin: 0 0 3px; }
    table.lines { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.lines th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; padding: 8px 10px; border-bottom: 2px solid ${t.accent}; }
    table.lines td { padding: ${compact ? "6px 8px" : "10px"}; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    table.lines .num { width: 36px; color: #94a3b8; }
    table.lines .qty { width: 64px; text-align: right; }
    table.lines .amt { width: 120px; text-align: right; font-weight: 600; white-space: nowrap; }
    table.lines .empty { text-align: center; color: #94a3b8; padding: 24px; }
    .totals { margin-left: auto; width: min(100%, 280px); }
    .total-row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
    .total-row.grand { font-size: ${templateId === "bold" ? "18px" : "15px"}; font-weight: 700; color: ${t.accent}; border-bottom: none; padding-top: 10px; margin-top: 4px; }
    .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: ${compact ? "10px" : "12px"}; color: #475569; }
    .footer h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    .footer p { margin: 0 0 12px; white-space: pre-wrap; }
    .etims { margin-top: 16px; padding: 10px 12px; border-radius: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-size: 12px; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; background: rgba(255,255,255,.2); }
    @media print { body { padding: 0; background: #fff; } .sheet { box-shadow: none; border: none; } }
  `;
}

/**
 * Build printable HTML for a platform invoice.
 * @param {object} invoice form or API record shape
 */
export function buildPlatformInvoiceHtml(invoice) {
  const templateId = invoice.template_id ?? "modern";
  const currency = invoice.currency ?? "KES";
  const taxRate = Number(invoice.tax_rate ?? 0);
  const totals = calculateInvoiceTotals(invoice.line_items, taxRate);
  const options = normalizeInvoiceOptions(invoice.invoice_options);
  const seller = normalizeSeller(invoice.seller);
  const billTo = {
    name: invoice.bill_to_name,
    email: invoice.bill_to_email,
    phone: invoice.bill_to_phone,
    address: invoice.bill_to_address,
    tax_pin: invoice.bill_to_tax_pin,
    company_code: invoice.bill_to_company_code,
  };
  const invoiceNo = invoice.invoice_number || "DRAFT";
  const status = (invoice.status ?? "draft").toUpperCase();
  const showQuantity = options.show_quantity !== false;
  const qtyHeader = showQuantity
    ? `<th style="text-align:right">Qty</th>`
    : "";

  const etimsBlock = options.show_etims_invoice_no && options.etims_invoice_no
    ? `<div class="etims"><strong>eTIMS KRA invoice no.</strong> ${escapeHtml(options.etims_invoice_no)}</div>`
    : "";

  const paymentBlock = options.show_payment_details && options.payment_details
    ? `<div><h3>Payment details</h3><p>${escapeHtml(options.payment_details)}</p></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(invoiceNo)}</title>
  <style>${baseStyles(templateId)}</style>
</head>
<body>
  <div class="sheet">
    ${watermarkHtml(options)}
    <div class="sheet-body">
      <div class="header">
        ${brandHeaderHtml(options)}
        <h1>INVOICE</h1>
        <div class="meta">
          Invoice No: <strong>#${escapeHtml(invoiceNo)}</strong>
          · ${escapeHtml(formatDate(invoice.issue_date))}
          ${invoice.due_date ? ` · Due ${escapeHtml(formatDate(invoice.due_date))}` : ""}
          · <span class="status">${escapeHtml(status)}</span>
        </div>
      </div>
      <div class="body">
        <div class="parties">
          ${partyBlock("Bill from", seller)}
          ${partyBlock("Bill to", billTo)}
        </div>
        ${etimsBlock}
        <table class="lines">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              ${qtyHeader}
              <th style="text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineRowsHtml(invoice.line_items, currency, { compact: templateId === "compact", showQuantity })}
          </tbody>
        </table>
        ${totalsBlock(totals, currency, taxRate)}
        <div class="footer">
          ${paymentBlock}
          ${invoice.notes ? `<div><h3>Notes</h3><p>${escapeHtml(invoice.notes)}</p></div>` : ""}
          ${invoice.terms ? `<div><h3>Terms</h3><p>${escapeHtml(invoice.terms)}</p></div>` : ""}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printPlatformInvoice(invoice) {
  if (typeof window === "undefined") return;
  const html = buildPlatformInvoiceHtml(invoice);
  const win = window.open("", "_blank", "width=860,height=960");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}
