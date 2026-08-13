import { PRINT_POWERED_BY } from "@/lib/branding";
import { parseFooterLines, serializeFooterLines } from "@/lib/footer-line-format";
import {
  DEFAULT_RECEIPT_BODY_FOOTER_LINES,
  defaultInvoiceBodyFooterForAdmin,
  defaultReceiptBodyFooterForAdmin,
  defaultReceiptFooterLinesForEditor,
  isLegacyUnconfiguredReceiptFooter,
} from "@/lib/sales-document-footer";

export const PRINT_FOOTER_TYPES = {
  receipt: "print_footer_receipt",
  invoice: "print_footer_a4_invoice",
  credit_note: "print_footer_credit_note",
  hospitality_check: "print_footer_hospitality_check",
  lpo: "print_footer_lpo",
  loading_sheet: "print_footer_loading_sheet",
  picking_list: "print_footer_picking_list",
  trip_chart: "print_footer_trip_chart",
  payroll_receipt: "print_footer_payroll_receipt",
};

export const PRINT_FOOTER_FORM_KEYS = {
  receipt: "print_footer_receipt",
  invoice: "print_footer_a4_invoice",
  credit_note: "print_footer_credit_note",
  hospitality_check: "print_footer_hospitality_check",
  lpo: "print_footer_lpo",
  loading_sheet: "print_footer_loading_sheet",
  picking_list: "print_footer_picking_list",
  trip_chart: "print_footer_trip_chart",
  payroll_receipt: "print_footer_payroll_receipt",
};

export const PRINT_FOOTER_LABELS = {
  receipt: "Thermal receipt footer",
  invoice: "A4 sales invoice footer",
  credit_note: "Credit note footer",
  hospitality_check: "Hotel check receipt footer",
  lpo: "LPO footer",
  loading_sheet: "Loading sheet footer",
  picking_list: "Picking list footer",
  trip_chart: "Trip chart list footer",
  payroll_receipt: "HR payroll receipt (payslip) footer",
};

export const RECEIPT_POWERED_BY_LINE = `Designed & Developed By ${PRINT_POWERED_BY}`;

/** Editable receipt footer lines shown when nothing is configured (excludes vendor credit). */
const DEFAULT_RECEIPT_FOOTER_EDITABLE_LINES = DEFAULT_RECEIPT_BODY_FOOTER_LINES;

export function isPoweredByFooterLine(line) {
  const s = String(line ?? "").trim();
  return /^Powered\s+By\s*:/i.test(s) || /^Designed\s+&\s+Developed\s+By\b/i.test(s);
}

function receiptFooterLinesFromText(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function stripPoweredByFooterLines(lines) {
  const normalized = Array.isArray(lines) ? lines : receiptFooterLinesFromText(lines);
  return normalized.filter((line) => !isPoweredByFooterLine(line));
}

/** Coerce API/stored footer values into an editor string. */
export function coerceFooterField(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return serializeFooterLines(value, { forEditor: true });
  }
  if (typeof value === "object") return "";
  return String(value);
}

/** Normalize footer text for admin editor state. */
export function footerEditorValueFromApi(value, { fallback = "" } = {}) {
  const raw = coerceFooterField(value);
  if (!raw.trim()) return fallback;
  if (raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return serializeFooterLines(parsed, { forEditor: true });
      }
    } catch {
      /* legacy plain text */
    }
  }
  return serializeFooterLines(parseFooterLines(raw, { includeEmpty: true }), { forEditor: true });
}

/** Compact footer value for API storage (drops empty rows). */
export function footerStorageValueFromForm(text) {
  return serializeFooterLines(parseFooterLines(text, { includeEmpty: true }), { forEditor: false });
}

/** Preserve styled footer JSON and empty editor rows while editing. */
export function footerContentForAdmin(text) {
  const raw = coerceFooterField(text);
  if (!raw.trim()) return "";
  return footerEditorValueFromApi(raw);
}

/** Receipt footer value for the admin editor — prefills the full template when unset or legacy. */
export function receiptFooterEditorValueFromApi(value) {
  const raw = coerceFooterField(value);
  if (!raw.trim()) return defaultReceiptBodyFooterForAdmin();

  const lines = parseFooterLines(raw, { includeEmpty: true }).filter(
    (line) => !isPoweredByFooterLine(line.text),
  );
  if (isLegacyUnconfiguredReceiptFooter(lines)) {
    return defaultReceiptBodyFooterForAdmin();
  }

  return footerEditorValueFromApi(raw);
}

/** Receipt footer text for admin forms — vendor credit line is never editable. */
export function receiptFooterForAdmin(text) {
  const raw = coerceFooterField(text);
  if (!raw.trim()) return defaultReceiptBodyFooterForAdmin();

  const lines = parseFooterLines(raw, { includeEmpty: true }).filter(
    (line) => !isPoweredByFooterLine(line.text),
  );
  if (isLegacyUnconfiguredReceiptFooter(lines)) {
    return defaultReceiptBodyFooterForAdmin();
  }
  const stored = footerStorageValueFromForm(lines);
  if (stored) return stored;
  return defaultReceiptBodyFooterForAdmin();
}

export function resolveReceiptFooterLines(settings = {}, organizationName = "") {
  const configured = parseFooterLines(
    settings?.print_footer_receipt ?? settings?.document_footer_text ?? "",
  );
  const editable = (() => {
    const withoutPoweredBy = configured.filter((line) => !isPoweredByFooterLine(line.text));
    if (isLegacyUnconfiguredReceiptFooter(withoutPoweredBy)) {
      return defaultReceiptFooterLinesForEditor();
    }
    if (withoutPoweredBy.length) return withoutPoweredBy;
    return defaultReceiptFooterLinesForEditor();
  })();

  const org = String(organizationName ?? "").trim();
  const resolvedEditable = editable.map((line) => ({
    ...line,
    text: line.text.replace(/\{\{organization\}\}/gi, org || "{{organization}}"),
  }));

  return [...resolvedEditable, { text: RECEIPT_POWERED_BY_LINE, align: "center", bold: false }];
}

export function resolvePrintFooter(settings = {}, documentType = "receipt") {
  const key = PRINT_FOOTER_TYPES[documentType] ?? PRINT_FOOTER_TYPES.receipt;

  const specific = String(settings?.[key] ?? "").trim();
  if (specific) {
    if (documentType === "receipt") {
      return receiptFooterForAdmin(specific);
    }
    return specific;
  }

  // Route docs share loading-sheet footer until a dedicated one is saved.
  if (documentType === "picking_list" || documentType === "trip_chart") {
    const shared = String(settings?.[PRINT_FOOTER_TYPES.loading_sheet] ?? "").trim();
    if (shared) return shared;
  }

  const legacy = String(settings?.document_footer_text ?? "").trim();
  if (legacy) {
    if (documentType === "receipt") {
      return receiptFooterForAdmin(legacy);
    }
    return legacy;
  }

  if (documentType === "receipt") {
    return defaultReceiptBodyFooterForAdmin();
  }

  if (documentType === "invoice") {
    return defaultInvoiceBodyFooterForAdmin();
  }

  return "";
}

export function printFooterFormFromGeneral(general = {}) {
  return {
    print_footer_receipt: receiptFooterEditorValueFromApi(general?.print_footer_receipt),
    print_footer_a4_invoice: footerEditorValueFromApi(general?.print_footer_a4_invoice),
    print_footer_lpo: footerEditorValueFromApi(general?.print_footer_lpo),
    print_footer_loading_sheet: footerEditorValueFromApi(general?.print_footer_loading_sheet),
    print_footer_picking_list: footerEditorValueFromApi(general?.print_footer_picking_list),
    print_footer_trip_chart: footerEditorValueFromApi(general?.print_footer_trip_chart),
    print_footer_payroll_receipt: footerEditorValueFromApi(general?.print_footer_payroll_receipt),
  };
}

export function printFooterPayloadFromForm(form = {}) {
  const receiptLines = parseFooterLines(form?.print_footer_receipt ?? "", { includeEmpty: true }).filter(
    (line) => !isPoweredByFooterLine(line.text),
  );
  const receiptStored = footerStorageValueFromForm(receiptLines);

  return {
    print_footer_receipt: receiptStored || defaultReceiptBodyFooterForAdmin(),
    print_footer_a4_invoice: footerStorageValueFromForm(form?.print_footer_a4_invoice ?? ""),
    print_footer_lpo: footerStorageValueFromForm(form?.print_footer_lpo ?? ""),
    print_footer_loading_sheet: footerStorageValueFromForm(form?.print_footer_loading_sheet ?? ""),
    print_footer_picking_list: footerStorageValueFromForm(form?.print_footer_picking_list ?? ""),
    print_footer_trip_chart: footerStorageValueFromForm(form?.print_footer_trip_chart ?? ""),
    print_footer_payroll_receipt: footerStorageValueFromForm(form?.print_footer_payroll_receipt ?? ""),
  };
}
