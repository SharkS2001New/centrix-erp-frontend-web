export const DEFAULT_LPO_DELIVERY_NOTES = [
  "Order valid for 7 days from the date of this LPO.",
  "No goods shall be received without an Invoice or Delivery note.",
  "Please quote LPO number in all delivery notes and invoices.",
  "Kindly attach a copy of LPO to the invoices / Delivery notes.",
  "Partial delivery shall be treated as full delivery and should be accompanied by an invoice.",
  "Any pending LPO balance shall warrant a new LPO to be raised.",
  "No over supply will be accepted.",
  "Ensure our KRA PIN is captured in all invoices.",
  "No short expiries shall be accepted.",
];

export const DEFAULT_LPO_KEBS_WARNING =
  "WE WILL ONLY RECEIVE PRODUCTS WITH K.E.B.S MARK / CERTIFICATE";

export const DEFAULT_LPO_VAT_NOTE =
  "VAT amount will not be paid on invoices without ETR receipt";

export const DEFAULT_LPO_FOOTER_LINES = [
  "No Oversupply will be accepted.",
  "This order is not valid unless sent directly OR Signed by an authorised Signatory of {organization}.",
  "ORDER ONLY VALID FOR {days} DAYS FROM ABOVE DATE.",
];

export const PROCUREMENT_PRINT_DEFAULTS = {
  lpo_print_delivery_notes: DEFAULT_LPO_DELIVERY_NOTES.join("\n"),
  lpo_print_kebs_warning: DEFAULT_LPO_KEBS_WARNING,
  lpo_print_vat_note: DEFAULT_LPO_VAT_NOTE,
  lpo_print_footer_lines: DEFAULT_LPO_FOOTER_LINES.join("\n"),
  lpo_print_validity_days: "7",
  lpo_print_checked_by: "",
  lpo_print_authorised_by: "",
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

export function resolveLpoValidityDays(lpo, printSettings = {}) {
  if (lpo?.order_date && lpo?.due_date) {
    const start = new Date(`${lpo.order_date}T12:00:00`);
    const end = new Date(`${lpo.due_date}T12:00:00`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
      if (diff > 0) return diff;
    }
  }
  const configured = Number(printSettings.lpo_print_validity_days);
  return configured > 0 ? configured : 7;
}

export function resolveLpoFooterLines(printSettings = {}, { organizationName = "", validDays = 7 } = {}) {
  const configured = linesFromMultilineText(printSettings.lpo_print_footer_lines);
  const lines = configured.length ? configured : DEFAULT_LPO_FOOTER_LINES;
  return lines.map((line) =>
    String(line)
      .replace(/\{organization\}/gi, organizationName || "the company")
      .replace(/\{days\}/gi, String(validDays ?? 7)),
  );
}

export function resolveLpoSignatures(lpo, printSettings = {}) {
  return {
    preparedBy: String(lpo?.created_by_name ?? lpo?.prepared_by_name ?? "").trim(),
    checkedBy: String(lpo?.checked_by_name ?? printSettings.lpo_print_checked_by ?? "").trim(),
    authorisedBy: String(
      lpo?.authorised_by_name ?? lpo?.approved_by_name ?? printSettings.lpo_print_authorised_by ?? "",
    ).trim(),
    terms: String(lpo?.terms ?? "").trim(),
  };
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
    lpo_print_footer_lines: String(
      procurement.lpo_print_footer_lines ?? PROCUREMENT_PRINT_DEFAULTS.lpo_print_footer_lines,
    ),
    lpo_print_validity_days: String(procurement.lpo_print_validity_days ?? "7"),
    lpo_print_checked_by: String(procurement.lpo_print_checked_by ?? ""),
    lpo_print_authorised_by: String(procurement.lpo_print_authorised_by ?? ""),
  };
}

export function lpoPrintPayloadFromForm(form) {
  return {
    lpo_print_delivery_notes: String(form.lpo_print_delivery_notes ?? ""),
    lpo_print_kebs_warning: String(form.lpo_print_kebs_warning ?? "").trim(),
    lpo_print_vat_note: String(form.lpo_print_vat_note ?? "").trim(),
    lpo_print_footer_lines: String(form.lpo_print_footer_lines ?? ""),
    lpo_print_validity_days: Number(form.lpo_print_validity_days) || 7,
    lpo_print_checked_by: String(form.lpo_print_checked_by ?? "").trim(),
    lpo_print_authorised_by: String(form.lpo_print_authorised_by ?? "").trim(),
  };
}
