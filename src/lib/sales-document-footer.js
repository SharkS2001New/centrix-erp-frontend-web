import { escapeHtml } from "@/lib/sale-document-print-shared";

export const SALES_FOOTER_PLACEHOLDER_HINT =
  "{username}, {cashier}, {organization}, {days} (A4 invoice validity)";

export const DEFAULT_RECEIPT_BODY_FOOTER_LINES = [
  "You were served by: {username}",
  "Thank you for your business!",
  "Goods once sold are not returnable.",
];

export const DEFAULT_INVOICE_BODY_FOOTER_LINES = [
  "You were served by: {username}",
  "Please Confirm Your Goods",
  "(Goods once sold are not refundable)",
  "Received By: _________________________",
  "Signature: _________________________",
];

function linesFromMultilineText(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function applySalesFooterPlaceholders(
  line,
  { username = "—", organizationName = "", validDays = 7 } = {},
) {
  const org = String(organizationName ?? "").trim();
  return String(line ?? "")
    .replace(/\{username\}/gi, username)
    .replace(/\{user\}/gi, username)
    .replace(/\{cashier\}/gi, username)
    .replace(/\{\{organization\}\}/gi, org || "{{organization}}")
    .replace(/\{organization\}/gi, org || "the company")
    .replace(/\{org\}/gi, org || "the company")
    .replace(/\{days\}/gi, String(validDays ?? 7));
}

/**
 * Merge general print footer settings with legacy sales invoice footer lines.
 */
export function salesDocumentFooterSettings(
  generalSettings = {},
  salesSettings = {},
  documentType = "receipt",
) {
  const key = documentType === "invoice" ? "print_footer_a4_invoice" : "print_footer_receipt";
  const primary = String(generalSettings?.[key] ?? "").trim();
  if (primary) {
    return { [key]: primary };
  }

  if (documentType === "invoice") {
    const legacy = String(salesSettings?.invoice_print_footer_lines ?? "").trim();
    if (legacy) {
      return { print_footer_a4_invoice: legacy };
    }
  }

  return {};
}

export function resolveSalesDocumentBodyFooterLines(
  footerSettings = {},
  documentType = "receipt",
  context = {},
) {
  const key = documentType === "invoice" ? "print_footer_a4_invoice" : "print_footer_receipt";
  const configured = linesFromMultilineText(footerSettings?.[key]);
  const defaults =
    documentType === "invoice"
      ? DEFAULT_INVOICE_BODY_FOOTER_LINES
      : DEFAULT_RECEIPT_BODY_FOOTER_LINES;

  let lines = configured.length ? configured : defaults;
  if (documentType === "receipt") {
    lines = stripPoweredByFooterLines(lines);
  }

  return lines.map((line) => applySalesFooterPlaceholders(line, context));
}

function formatBodyFooterLineHtml(line, layout) {
  const text = String(line ?? "").trim();
  if (!text) return "";

  if (layout === "thermal") {
    return `<div class="footer-text">${escapeHtml(text)}</div>`;
  }

  const lower = text.toLowerCase();
  if (lower.startsWith("you were served")) {
    return `<div class="served-by">${escapeHtml(text)}</div>`;
  }

  const sigMatch = text.match(/^([^:]+):\s*(.*)$/);
  if (sigMatch && /received by|signature|checked by|authorised by|authorized by/i.test(sigMatch[1])) {
    const label = sigMatch[1].trim();
    const value = sigMatch[2].trim() || "\u00a0";
    return `<p class="sig-row"><span class="sig-label">${escapeHtml(label)}:</span><span class="sig-line">${escapeHtml(value)}</span></p>`;
  }

  if (/confirm your goods|not refundable|not returnable/i.test(lower)) {
    const goodsSub = /^\(/.test(text);
    return `<p class="goods-note${goodsSub ? " goods-note-sub" : ""} center">${escapeHtml(text)}</p>`;
  }

  return `<p class="body-footer-line">${escapeHtml(text)}</p>`;
}

export function buildSalesDocumentBodyFooterHtml(lines, { layout = "a4" } = {}) {
  const list = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!list.length) return "";

  if (layout === "thermal") {
    return list.map((line) => formatBodyFooterLineHtml(line, layout)).join("");
  }

  const parts = [];
  let signatureRows = [];

  function flushSignatures() {
    if (!signatureRows.length) return;
    parts.push(`<div class="receive-signatures">${signatureRows.join("")}</div>`);
    signatureRows = [];
  }

  for (const line of list) {
    const html = formatBodyFooterLineHtml(line, layout);
    if (html.includes('class="sig-row"')) {
      signatureRows.push(html);
    } else {
      flushSignatures();
      parts.push(html);
    }
  }
  flushSignatures();

  return parts.join("");
}

function isPoweredByFooterLine(line) {
  return /^Powered\s+By\s*:/i.test(String(line ?? "").trim());
}

function stripPoweredByFooterLines(lines) {
  const normalized = Array.isArray(lines) ? lines : [];
  return normalized.filter((line) => !isPoweredByFooterLine(line));
}

export function receiptBodyFooterForAdmin(text) {
  return stripPoweredByFooterLines(linesFromMultilineText(text)).join("\n");
}

export function defaultReceiptBodyFooterForAdmin() {
  return DEFAULT_RECEIPT_BODY_FOOTER_LINES.join("\n");
}

export function defaultInvoiceBodyFooterForAdmin() {
  return DEFAULT_INVOICE_BODY_FOOTER_LINES.join("\n");
}
