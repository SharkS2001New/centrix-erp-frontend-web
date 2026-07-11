import { escapeHtml } from "@/lib/sale-document-print-shared";
import {
  calculateInvoiceTotals,
  invoiceFontFamilyCss,
  invoiceFontScale,
  invoiceSpacing,
  normalizeInvoiceOptions,
  normalizeSeller,
} from "@/lib/platform-invoices";
import { fillPrintWindow, openBlankPrintWindow, printWindowFeatures } from "@/lib/open-print-window";

function stripUrlsFromPrintText(text) {
  if (!text) return "";
  return String(text)
    .replace(/https?:\/\/[^\s<>)"]+/gi, "")
    .replace(/\bwww\.[^\s<>)"]+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function printTextBlock(text) {
  return escapeHtml(stripUrlsFromPrintText(text));
}

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
  if (options.show_branding === false) return "";

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

  if (!logo && !name) return "";
  return `<div class="brand">${logo}${name}</div>`;
}

function watermarkHtml(options) {
  if (options.watermark_enabled !== true) return "";

  const mode = options.watermark_mode || "name";
  const text = options.watermark_text || options.brand_name || "CentrixERP";
  const logoUrl = options.watermark_logo_url?.trim() || options.brand_logo_url?.trim();

  if (mode === "logo" && logoUrl) {
    return `<div class="watermark watermark-logo" style="background-image:url('${escapeHtml(logoUrl)}')"></div>`;
  }

  const label = mode === "text" ? text : text;
  return `<div class="watermark watermark-text" aria-hidden="true">${escapeHtml(label)}</div>`;
}

function baseStyles(templateId, options = {}) {
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
  const compactTemplate = templateId === "compact";
  const fontFamily = invoiceFontFamilyCss(options.print_font_family, t.font);
  const scale = invoiceFontScale(options.print_font_scale);
  const space = invoiceSpacing(options.print_spacing);
  const p = space.print;
  const bodySize = `${scale.screenPx - (compactTemplate ? 1 : 0)}px`;
  const printBodySize = `${scale.printPx}px`;
  const metaSize = `${Math.max(scale.screenPx - 1, 12)}px`;
  const printMetaSize = `${Math.max(scale.printPx - 1, 13)}px`;
  const labelSize = `${Math.max(scale.screenPx - 3, 11)}px`;
  const printLabelSize = `${Math.max(scale.printPx - 3, 12)}px`;
  const footerSize = `${Math.max(scale.screenPx - 1, 12)}px`;
  const printFooterSize = `${Math.max(scale.printPx - 2, 13)}px`;
  const h1Size = templateId === "bold"
    ? space.h1Size.bold
    : templateId === "elegant"
      ? space.h1Size.elegant
      : space.h1Size.default;
  const printH1Size = `${scale.printPx + space.printH1Extra}px`;
  const grandTotalSize = templateId === "bold" ? space.grandSize.bold : space.grandSize.default;
  const printGrandTotalSize = `${scale.printPx + space.printGrandExtra}px`;
  const brandNameSize = compactTemplate ? space.brandNameSizeCompact : space.brandNameSize;
  const printBrandNameSize = `${scale.printPx + space.printBrandExtra}px`;
  const headerPad = compactTemplate ? space.headerPadCompact : space.headerPad;
  const bodyInnerPad = compactTemplate ? space.bodyInnerPadCompact : space.bodyInnerPad;
  const tdPad = compactTemplate ? space.tdPadCompact : space.tdPad;

  return `
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: ${space.bodyPad}; font-family: ${fontFamily}; color: #0f172a; background: ${t.bg}; font-size: ${bodySize}; line-height: ${space.lineHeight}; }
    a, a:visited { color: inherit; text-decoration: none; }
    .sheet { position: relative; max-width: 800px; margin: 0 auto; background: #fff; border-radius: ${templateId === "minimal" ? "0" : "8px"}; overflow: hidden; box-shadow: ${templateId === "minimal" ? "none" : "0 1px 3px rgba(0,0,0,.08)"}; border: ${templateId === "classic" ? "1px solid #cbd5e1" : "none"}; }
    .sheet-body { position: relative; z-index: 1; }
    .watermark { position: absolute; inset: 0; z-index: 0; pointer-events: none; user-select: none; }
    .watermark-text { display: flex; align-items: center; justify-content: center; font-size: ${space.watermarkText}; font-weight: 800; letter-spacing: 0.08em; color: rgba(15, 23, 42, 0.06); transform: rotate(-28deg); text-transform: uppercase; white-space: nowrap; }
    .watermark-logo { background-repeat: no-repeat; background-position: center; background-size: 40%; opacity: 0.07; }
    .header { padding: ${headerPad}; background: ${templateId === "corporate" || templateId === "bold" ? t.accent : templateId === "stripe" ? "#f6f9fc" : "#fff"}; color: ${templateId === "corporate" || templateId === "bold" ? "#fff" : "#0f172a"}; ${templateId === "modern" ? `border-top: 3px solid ${t.accent};` : ""} ${templateId === "stripe" ? `border-left: 5px solid ${t.accent};` : ""} }
    .brand { display: flex; align-items: center; gap: ${space.brandGap}; margin-bottom: ${space.brandMarginBottom}; }
    .brand-logo { max-height: ${space.brandLogoMax}; max-width: 180px; object-fit: contain; }
    .brand-name { margin: 0; font-size: ${brandNameSize}; font-weight: 700; letter-spacing: 0.02em; }
    .header h1 { margin: 0; font-size: ${h1Size}; font-weight: 700; letter-spacing: ${templateId === "elegant" ? "0.02em" : "0"}; line-height: 1.15; }
    .header .meta { margin-top: ${space.metaMarginTop}; opacity: ${templateId === "corporate" || templateId === "bold" ? "0.92" : "1"}; font-size: ${metaSize}; line-height: ${space.partyLineHeight}; }
    .body { padding: ${bodyInnerPad}; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: ${space.partiesGap}; margin-bottom: ${space.partiesMarginBottom}; }
    .party-label { margin: 0 0 ${space.partyLabelMargin}; font-size: ${labelSize}; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 700; }
    .party-line { margin: 0 0 ${space.partyLineMargin}; font-size: inherit; line-height: ${space.partyLineHeight}; }
    table.lines { width: 100%; border-collapse: collapse; margin-bottom: ${space.tableMarginBottom}; font-size: inherit; }
    table.lines th { text-align: left; font-size: ${labelSize}; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; padding: ${space.thPad}; border-bottom: 2px solid ${t.accent}; font-weight: 700; }
    table.lines td { padding: ${tdPad}; border-bottom: 1px solid #e2e8f0; vertical-align: top; font-size: inherit; line-height: ${space.partyLineHeight}; }
    table.lines .num { width: 36px; color: #64748b; font-weight: 600; }
    table.lines .desc { font-size: inherit; }
    table.lines .qty { width: 64px; text-align: right; font-weight: 600; }
    table.lines .amt { width: 120px; text-align: right; font-weight: 700; white-space: nowrap; }
    table.lines .empty { text-align: center; color: #94a3b8; padding: ${space.emptyPad}; }
    .totals { margin-left: auto; width: min(100%, ${space.totalsWidth}); font-size: inherit; }
    .total-row { display: flex; justify-content: space-between; gap: ${space.totalRowGap}; padding: ${space.totalRowPad}; border-bottom: 1px solid #f1f5f9; font-size: inherit; }
    .total-row.grand { font-size: ${grandTotalSize}; font-weight: 800; color: ${t.accent}; border-bottom: none; padding-top: ${space.grandPadTop}; margin-top: ${space.grandMarginTop}; }
    .footer { margin-top: ${space.footerMarginTop}; padding-top: ${space.footerPadTop}; border-top: 1px solid #e2e8f0; font-size: ${footerSize}; color: #334155; line-height: ${space.footerLineHeight}; }
    .footer h3 { margin: 0 0 ${space.footerH3Margin}; font-size: ${labelSize}; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 700; }
    .footer p { margin: 0 0 ${space.footerPMargin}; white-space: pre-wrap; font-size: inherit; }
    .etims { margin: ${space.etimsMargin}; padding: ${space.etimsPad}; border-radius: 6px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-size: ${metaSize}; line-height: ${space.partyLineHeight}; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: ${labelSize}; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,.2); }
    @page { size: A4; margin: ${space.pageMargin}; }
    @media print {
      body { padding: 0; background: #fff; font-size: ${printBodySize}; line-height: ${p.lineHeight}; }
      a, a:visited { color: inherit !important; text-decoration: none !important; }
      a[href]::after { content: none !important; }
      .sheet { max-width: none; box-shadow: none; border: none; border-radius: 0; }
      .header { padding: ${p.headerPad}; }
      .brand { margin-bottom: ${p.brandMarginBottom}; }
      .brand-logo { max-height: ${p.brandLogoMax}; }
      .brand-name { font-size: ${printBrandNameSize}; }
      .header h1 { font-size: ${printH1Size}; }
      .header .meta { font-size: ${printMetaSize}; margin-top: ${p.metaMarginTop}; }
      .body { padding: ${p.bodyInnerPad}; }
      .parties { gap: ${p.partiesGap}; margin-bottom: ${p.partiesMarginBottom}; }
      .party-label { font-size: ${printLabelSize}; margin-bottom: ${p.partyLabelMargin}; }
      .party-line { font-size: ${printBodySize}; }
      table.lines { font-size: ${printBodySize}; margin-bottom: ${p.tableMarginBottom}; }
      table.lines th { font-size: ${printLabelSize}; padding: ${p.thPad}; }
      table.lines td { padding: ${p.tdPad}; font-size: ${printBodySize}; }
      table.lines .amt { font-size: ${printBodySize}; }
      .totals { font-size: ${printBodySize}; }
      .total-row { font-size: ${printBodySize}; padding: ${p.totalRowPad}; }
      .total-row.grand { font-size: ${printGrandTotalSize}; padding-top: ${p.grandPadTop}; }
      .footer { margin-top: ${p.footerMarginTop}; padding-top: ${p.footerPadTop}; font-size: ${printFooterSize}; }
      .footer h3 { font-size: ${printLabelSize}; }
      .footer p { font-size: ${printFooterSize}; margin-bottom: ${p.footerPMargin}; }
      .etims { font-size: ${printFooterSize}; margin: ${p.etimsMargin}; padding: ${p.etimsPad}; }
      .status { font-size: ${printLabelSize}; }
      .watermark-text { font-size: ${space.printWatermarkText}; }
    }
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
    ? `<div><h3>Payment details</h3><p>${printTextBlock(options.payment_details)}</p></div>`
    : "";

  const notesBlock = invoice.notes
    ? `<div><h3>Notes</h3><p>${printTextBlock(invoice.notes)}</p></div>`
    : "";
  const termsBlock = invoice.terms
    ? `<div><h3>Terms</h3><p>${printTextBlock(invoice.terms)}</p></div>`
    : "";
  const footerInner = `${paymentBlock}${notesBlock}${termsBlock}`;
  const footerBlock = footerInner
    ? `<div class="footer">${footerInner}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(invoiceNo)}</title>
  <style>${baseStyles(templateId, options)}</style>
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
        ${footerBlock}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printPlatformInvoice(invoice) {
  if (typeof window === "undefined") return;
  const html = buildPlatformInvoiceHtml(invoice);
  const win = openBlankPrintWindow(printWindowFeatures("invoice"));
  if (!win) return;
  fillPrintWindow(win, html);
}
