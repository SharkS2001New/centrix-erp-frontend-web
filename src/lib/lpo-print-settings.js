export const DEFAULT_LPO_DELIVERY_NOTES = [
  "Order valid until the date shown above.",
  "No goods shall be received without an invoice or delivery note.",
  "Please quote LPO number on all delivery notes and invoices.",
  "Kindly attach a copy of this LPO to invoices and delivery notes.",
  "No oversupply will be accepted.",
  "Ensure KRA PIN is captured on all supplier invoices.",
  "Goods must comply with applicable KEBS standards.",
];

export const DEFAULT_LPO_KEBS_WARNING =
  "We will only receive products with K.E.B.S mark / certificate";

export const DEFAULT_LPO_VAT_NOTE =
  "VAT amount will not be paid on invoices without ETR receipt";

export const PROCUREMENT_PRINT_DEFAULTS = {
  lpo_print_delivery_notes: DEFAULT_LPO_DELIVERY_NOTES.join("\n"),
  lpo_print_kebs_warning: DEFAULT_LPO_KEBS_WARNING,
  lpo_print_vat_note: DEFAULT_LPO_VAT_NOTE,
};

export function linesFromMultilineText(text) {
  return String(text ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function multilineFromLines(lines) {
  return (lines ?? []).map((line) => String(line).trim()).filter(Boolean).join("\n");
}

export function mergeLpoPrintSettings(procurement = {}) {
  return {
    ...PROCUREMENT_PRINT_DEFAULTS,
    ...procurement,
  };
}

export function resolveLpoDeliveryNotes(lpo, printSettings = {}) {
  const fromLpo = String(lpo?.instructions ?? "")
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (fromLpo.length) return fromLpo;

  const configured = linesFromMultilineText(printSettings.lpo_print_delivery_notes);
  return configured.length ? configured : DEFAULT_LPO_DELIVERY_NOTES;
}

export function resolveLpoKebsWarning(printSettings = {}) {
  const value = String(printSettings.lpo_print_kebs_warning ?? "").trim();
  return value || DEFAULT_LPO_KEBS_WARNING;
}

export function resolveLpoVatNote(printSettings = {}) {
  const value = String(printSettings.lpo_print_vat_note ?? "").trim();
  return value || DEFAULT_LPO_VAT_NOTE;
}

export function lpoPrintFormFromApi(res) {
  const procurement = mergeLpoPrintSettings(res?.procurement ?? res);
  return {
    lpo_print_delivery_notes: String(
      procurement.lpo_print_delivery_notes ?? PROCUREMENT_PRINT_DEFAULTS.lpo_print_delivery_notes,
    ),
    lpo_print_kebs_warning: String(
      procurement.lpo_print_kebs_warning ?? DEFAULT_LPO_KEBS_WARNING,
    ),
    lpo_print_vat_note: String(procurement.lpo_print_vat_note ?? DEFAULT_LPO_VAT_NOTE),
  };
}

export function lpoPrintPayloadFromForm(form) {
  return {
    lpo_print_delivery_notes: String(form.lpo_print_delivery_notes ?? ""),
    lpo_print_kebs_warning: String(form.lpo_print_kebs_warning ?? "").trim(),
    lpo_print_vat_note: String(form.lpo_print_vat_note ?? "").trim(),
  };
}
