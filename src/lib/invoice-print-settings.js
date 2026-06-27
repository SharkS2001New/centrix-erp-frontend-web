export const DEFAULT_INVOICE_DELIVERY_TERMS = [
  "Order valid for the period shown above.",
  "No goods shall be received without an invoice or delivery note.",
  "Please quote invoice number on all delivery notes.",
  "Kindly attach a copy of this invoice to delivery notes.",
  "No oversupply will be accepted.",
  "Ensure KRA PIN is captured on all supplier invoices.",
  "Goods must comply with applicable KEBS standards.",
  "VAT amount will not be paid on invoices without ETR receipt.",
  "Payment terms as agreed with the customer.",
];

export const DEFAULT_INVOICE_FOOTER_LINES = [
  "No Oversupply will be accepted.",
  "This invoice is not valid unless sent directly or signed by an authorised signatory of {organization}.",
  "Order only valid for {days} days from above date.",
  "We will only receive products with K.E.B.S mark / certificate",
  "Take note: VAT amount will not be paid on invoices without ETR receipt",
];

export const INVOICE_PRINT_DEFAULTS = {
  invoice_print_delivery_terms: DEFAULT_INVOICE_DELIVERY_TERMS.join("\n"),
  invoice_print_footer_lines: DEFAULT_INVOICE_FOOTER_LINES.join("\n"),
};

export function linesFromMultilineText(text) {
  return String(text ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolveInvoiceDeliveryTerms(salesSettings = {}) {
  const configured = linesFromMultilineText(salesSettings.invoice_print_delivery_terms);
  return configured.length ? configured : DEFAULT_INVOICE_DELIVERY_TERMS;
}

export function resolveInvoiceFooterLines(salesSettings = {}, { organizationName = "", validDays = 7 } = {}) {
  const configured = linesFromMultilineText(salesSettings.invoice_print_footer_lines);
  const lines = configured.length ? configured : DEFAULT_INVOICE_FOOTER_LINES;
  return lines.map((line) =>
    String(line)
      .replace(/\{organization\}/gi, organizationName || "the company")
      .replace(/\{days\}/gi, String(validDays ?? 7)),
  );
}

export function invoicePrintFormFromApi(sales = {}) {
  const merged = { ...INVOICE_PRINT_DEFAULTS, ...sales };
  return {
    invoice_print_delivery_terms: String(
      merged.invoice_print_delivery_terms ?? INVOICE_PRINT_DEFAULTS.invoice_print_delivery_terms,
    ),
    invoice_print_footer_lines: String(
      merged.invoice_print_footer_lines ?? INVOICE_PRINT_DEFAULTS.invoice_print_footer_lines,
    ),
  };
}

export function invoicePrintPayloadFromForm(form) {
  return {
    invoice_print_delivery_terms: String(form.invoice_print_delivery_terms ?? ""),
    invoice_print_footer_lines: String(form.invoice_print_footer_lines ?? ""),
  };
}
