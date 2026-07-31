/**
 * Document print phones — company Tel 1 / Tel 2 are the primary numbers (thermal + default).
 * A4 invoice, proforma, LPO, and other branded docs can use the same or dedicated numbers.
 */

export function emptyPrintPhones() {
  return { tel1: "", tel2: "" };
}

export function normalizePrintPhones(raw = null) {
  if (!raw || typeof raw !== "object") return emptyPrintPhones();
  return {
    tel1: String(raw.tel1 ?? raw.primary_tel ?? raw.phone ?? "").trim(),
    tel2: String(raw.tel2 ?? raw.secondary_tel ?? raw.secondary_phone ?? "").trim(),
  };
}

export function printPhonesToPayload(raw = null) {
  return normalizePrintPhones(raw);
}

export function printPhonesFromApi(raw = null) {
  return normalizePrintPhones(raw);
}

export function formatPrintPhones(phones) {
  const normalized = normalizePrintPhones(phones);
  return [normalized.tel1, normalized.tel2].filter(Boolean).join(" / ");
}

export function organizationPrintPhones(organization = null) {
  return normalizePrintPhones({
    tel1: organization?.primary_tel,
    tel2: organization?.secondary_tel,
  });
}

export const DOCUMENT_PRINT_PHONE_DEFAULTS = {
  use_same_print_phones_for_proforma: true,
  proforma_print_phones: emptyPrintPhones(),
  use_same_print_phones_for_lpo: true,
  lpo_print_phones: emptyPrintPhones(),
  use_same_print_phones_for_other: true,
  other_print_phones: emptyPrintPhones(),
};

/**
 * @param {object} options
 * @param {"receipt"|"invoice"|"proforma"|"lpo"|"other"} [options.documentType]
 * @param {object|null} [options.organization]
 * @param {object|null} [options.salesSettings]
 * @param {object|null} [options.procurementSettings]
 * @param {object|null} [options.generalSettings]
 * @param {object|null} [options.moduleSettings] — convenience: { sales, procurement, general }
 */
export function resolveDocumentPrintPhones({
  documentType = "receipt",
  organization = null,
  salesSettings = null,
  procurementSettings = null,
  generalSettings = null,
  moduleSettings = null,
} = {}) {
  const sales = salesSettings ?? moduleSettings?.sales ?? null;
  const procurement = procurementSettings ?? moduleSettings?.procurement ?? null;
  const general = generalSettings ?? moduleSettings?.general ?? null;
  const orgPhones = organizationPrintPhones(organization);

  // Thermal and A4 tax invoice share company profile Tel 1 / Tel 2.
  if (documentType === "receipt" || documentType === "invoice") {
    return orgPhones;
  }

  let useSame = true;
  let dedicated = emptyPrintPhones();

  if (documentType === "proforma") {
    useSame = sales?.use_same_print_phones_for_proforma !== false;
    dedicated = normalizePrintPhones(sales?.proforma_print_phones);
  } else if (documentType === "lpo") {
    useSame = procurement?.use_same_print_phones_for_lpo !== false;
    dedicated = normalizePrintPhones(procurement?.lpo_print_phones);
  } else {
    // Credit notes, GRNs, supplier returns, and other branded A4 docs.
    useSame = general?.use_same_print_phones_for_other !== false;
    dedicated = normalizePrintPhones(general?.other_print_phones);
  }

  if (useSame) return orgPhones;
  if (!dedicated.tel1 && !dedicated.tel2) return orgPhones;
  return dedicated;
}

export function resolveDocumentPrintPhonesLine(options) {
  return formatPrintPhones(resolveDocumentPrintPhones(options));
}

export function documentPrintPhonesFormFields(source = {}, { prefix } = {}) {
  if (prefix === "proforma") {
    return {
      use_same_print_phones_for_proforma: source.use_same_print_phones_for_proforma !== false,
      proforma_print_phones: printPhonesFromApi(
        source.proforma_print_phones ?? emptyPrintPhones(),
      ),
    };
  }
  if (prefix === "lpo") {
    return {
      use_same_print_phones_for_lpo: source.use_same_print_phones_for_lpo !== false,
      lpo_print_phones: printPhonesFromApi(source.lpo_print_phones ?? emptyPrintPhones()),
    };
  }
  return {
    use_same_print_phones_for_other: source.use_same_print_phones_for_other !== false,
    other_print_phones: printPhonesFromApi(source.other_print_phones ?? emptyPrintPhones()),
  };
}

export function documentPrintPhonesPayloadFields(form = {}, { prefix } = {}) {
  if (prefix === "proforma") {
    return {
      use_same_print_phones_for_proforma: Boolean(form.use_same_print_phones_for_proforma),
      proforma_print_phones: printPhonesToPayload(form.proforma_print_phones),
    };
  }
  if (prefix === "lpo") {
    return {
      use_same_print_phones_for_lpo: Boolean(form.use_same_print_phones_for_lpo),
      lpo_print_phones: printPhonesToPayload(form.lpo_print_phones),
    };
  }
  return {
    use_same_print_phones_for_other: Boolean(form.use_same_print_phones_for_other),
    other_print_phones: printPhonesToPayload(form.other_print_phones),
  };
}
