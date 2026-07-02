import { PRINT_POWERED_BY } from "@/lib/branding";
import {
  DEFAULT_RECEIPT_BODY_FOOTER_LINES,
  defaultInvoiceBodyFooterForAdmin,
  defaultReceiptBodyFooterForAdmin,
  receiptBodyFooterForAdmin,
} from "@/lib/sales-document-footer";

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

export const RECEIPT_POWERED_BY_LINE = `Powered By: ${PRINT_POWERED_BY}`;

const DEFAULT_RECEIPT_FOOTER_LINES = [
  ...DEFAULT_RECEIPT_BODY_FOOTER_LINES,
  RECEIPT_POWERED_BY_LINE,
];

/** Editable receipt footer lines shown when nothing is configured (excludes vendor credit). */
const DEFAULT_RECEIPT_FOOTER_EDITABLE_LINES = DEFAULT_RECEIPT_BODY_FOOTER_LINES;

export function isPoweredByFooterLine(line) {
  return /^Powered\s+By\s*:/i.test(String(line ?? "").trim());
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

/** Receipt footer text for admin forms — vendor credit line is never editable. */
export function receiptFooterForAdmin(text) {
  const normalized = receiptBodyFooterForAdmin(text);
  if (normalized) return normalized;
  return defaultReceiptBodyFooterForAdmin();
}

export function resolveReceiptFooterLines(settings = {}, organizationName = "") {
  const configured = receiptFooterLinesFromText(
    settings?.print_footer_receipt ?? settings?.document_footer_text ?? "",
  );
  const editable = configured.length
    ? stripPoweredByFooterLines(configured)
    : DEFAULT_RECEIPT_FOOTER_EDITABLE_LINES;

  const org = String(organizationName ?? "").trim();
  const resolvedEditable = editable.map((line) =>
    line.replace(/\{\{organization\}\}/gi, org || "{{organization}}"),
  );

  return [...resolvedEditable, RECEIPT_POWERED_BY_LINE];
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
    print_footer_receipt: receiptFooterForAdmin(general?.print_footer_receipt ?? ""),
    print_footer_a4_invoice: String(general?.print_footer_a4_invoice ?? ""),
    print_footer_lpo: String(general?.print_footer_lpo ?? ""),
    print_footer_loading_sheet: String(general?.print_footer_loading_sheet ?? ""),
  };
}

export function printFooterPayloadFromForm(form = {}) {
  return {
    print_footer_receipt: receiptFooterForAdmin(form?.print_footer_receipt ?? ""),
    print_footer_a4_invoice: String(form?.print_footer_a4_invoice ?? "").trim(),
    print_footer_lpo: String(form?.print_footer_lpo ?? "").trim(),
    print_footer_loading_sheet: String(form?.print_footer_loading_sheet ?? "").trim(),
  };
}
