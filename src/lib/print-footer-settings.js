export const PRINT_FOOTER_TYPES = {
  receipt: "print_footer_receipt",
  invoice: "print_footer_a4_invoice",
  lpo: "print_footer_lpo",
  loading_sheet: "print_footer_loading_sheet",
};

export const PRINT_FOOTER_FORM_KEYS = {
  receipt: "print_footer_receipt",
  invoice: "print_footer_a4_invoice",
  lpo: "print_footer_lpo",
  loading_sheet: "print_footer_loading_sheet",
};

export const PRINT_FOOTER_LABELS = {
  receipt: "Thermal receipt footer",
  invoice: "A4 sales invoice footer",
  lpo: "LPO footer",
  loading_sheet: "Loading sheet footer",
};

export function printFooterFormFromGeneral(general = {}) {
  return {
    print_footer_receipt: String(general.print_footer_receipt ?? general.document_footer_text ?? ""),
    print_footer_a4_invoice: String(
      general.print_footer_a4_invoice ?? general.document_footer_text ?? "",
    ),
    print_footer_lpo: String(general.print_footer_lpo ?? general.document_footer_text ?? ""),
    print_footer_loading_sheet: String(
      general.print_footer_loading_sheet ?? general.document_footer_text ?? "",
    ),
  };
}

export function printFooterPayloadFromForm(form) {
  return {
    print_footer_receipt: String(form.print_footer_receipt ?? "").trim(),
    print_footer_a4_invoice: String(form.print_footer_a4_invoice ?? "").trim(),
    print_footer_lpo: String(form.print_footer_lpo ?? "").trim(),
    print_footer_loading_sheet: String(form.print_footer_loading_sheet ?? "").trim(),
  };
}

/** Resolve the footer line for a specific document type. */
export function resolvePrintFooter(settings = {}, documentType = "receipt") {
  const key = PRINT_FOOTER_TYPES[documentType] ?? PRINT_FOOTER_TYPES.receipt;
  const specific = String(settings?.[key] ?? "").trim();
  if (specific) return specific;
  return String(settings?.document_footer_text ?? "").trim();
}
