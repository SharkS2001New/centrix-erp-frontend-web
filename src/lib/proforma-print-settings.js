import { linesFromMultilineText } from "@/lib/invoice-print-settings";

export const DEFAULT_PROFORMA_BANNER =
  "This is a proforma invoice for payment purposes — not a tax invoice.";

export const DEFAULT_PROFORMA_VAT_NOTE = "*The above prices are inclusive of VAT";

/** Default terms & conditions for proforma printouts (admin-editable). */
export const DEFAULT_PROFORMA_TERMS = [
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

export const PROFORMA_PRINT_DEFAULTS = {
  show_print_proforma_invoice_option: true,
  proforma_valid_days: 7,
  show_proforma_payment_details: true,
  show_proforma_terms: true,
  proforma_print_terms: DEFAULT_PROFORMA_TERMS.join("\n"),
  show_proforma_vat_note: true,
  proforma_vat_note: DEFAULT_PROFORMA_VAT_NOTE,
  show_proforma_signatures: true,
  proforma_confirmed_by: "",
  show_proforma_banner: true,
  proforma_banner_text: DEFAULT_PROFORMA_BANNER,
  show_proforma_customer_pin: true,
  show_proforma_valid_until: true,
  show_proforma_payment_terms: true,
  show_proforma_totals_breakdown: true,
};

export function proformaPrintFormFromApi(sales = {}) {
  const merged = { ...PROFORMA_PRINT_DEFAULTS, ...sales };
  const terms =
    merged.proforma_print_terms != null && String(merged.proforma_print_terms).trim() !== ""
      ? String(merged.proforma_print_terms)
      : PROFORMA_PRINT_DEFAULTS.proforma_print_terms;
  return {
    show_print_proforma_invoice_option: merged.show_print_proforma_invoice_option !== false,
    proforma_valid_days: String(
      merged.proforma_valid_days ??
        merged.invoice_valid_days ??
        PROFORMA_PRINT_DEFAULTS.proforma_valid_days,
    ),
    show_proforma_payment_details: merged.show_proforma_payment_details !== false,
    show_proforma_terms: merged.show_proforma_terms !== false,
    proforma_print_terms: terms,
    show_proforma_vat_note: merged.show_proforma_vat_note !== false,
    proforma_vat_note: String(
      merged.proforma_vat_note ?? PROFORMA_PRINT_DEFAULTS.proforma_vat_note,
    ),
    show_proforma_signatures: merged.show_proforma_signatures !== false,
    proforma_confirmed_by: String(merged.proforma_confirmed_by ?? ""),
    show_proforma_banner: merged.show_proforma_banner !== false,
    proforma_banner_text: String(
      merged.proforma_banner_text ?? PROFORMA_PRINT_DEFAULTS.proforma_banner_text,
    ),
    show_proforma_customer_pin: merged.show_proforma_customer_pin !== false,
    show_proforma_valid_until: merged.show_proforma_valid_until !== false,
    show_proforma_payment_terms: merged.show_proforma_payment_terms !== false,
    show_proforma_totals_breakdown: merged.show_proforma_totals_breakdown !== false,
  };
}

export function proformaPrintPayloadFromForm(form) {
  return {
    show_print_proforma_invoice_option: Boolean(form.show_print_proforma_invoice_option),
    proforma_valid_days: Number(form.proforma_valid_days) || 0,
    show_proforma_payment_details: Boolean(form.show_proforma_payment_details),
    show_proforma_terms: Boolean(form.show_proforma_terms),
    proforma_print_terms: String(form.proforma_print_terms ?? ""),
    show_proforma_vat_note: Boolean(form.show_proforma_vat_note),
    proforma_vat_note: String(form.proforma_vat_note ?? ""),
    show_proforma_signatures: Boolean(form.show_proforma_signatures),
    proforma_confirmed_by: String(form.proforma_confirmed_by ?? "").trim(),
    show_proforma_banner: Boolean(form.show_proforma_banner),
    proforma_banner_text: String(form.proforma_banner_text ?? "").trim(),
    show_proforma_customer_pin: Boolean(form.show_proforma_customer_pin),
    show_proforma_valid_until: Boolean(form.show_proforma_valid_until),
    show_proforma_payment_terms: Boolean(form.show_proforma_payment_terms),
    show_proforma_totals_breakdown: Boolean(form.show_proforma_totals_breakdown),
  };
}

/** Terms for proforma printouts — admin text or built-in defaults. */
export function resolveProformaTerms(salesSettings = {}) {
  const dedicated = linesFromMultilineText(salesSettings.proforma_print_terms);
  return dedicated.length ? dedicated : DEFAULT_PROFORMA_TERMS;
}

export function resolveProformaValidDays(salesSettings = {}) {
  const dedicated = Number(salesSettings.proforma_valid_days);
  if (Number.isFinite(dedicated) && dedicated >= 0) return dedicated;
  const invoiceDays = Number(salesSettings.invoice_valid_days);
  if (Number.isFinite(invoiceDays) && invoiceDays >= 0) return invoiceDays;
  return PROFORMA_PRINT_DEFAULTS.proforma_valid_days;
}
