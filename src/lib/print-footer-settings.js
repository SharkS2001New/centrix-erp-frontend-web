import { PRINT_POWERED_BY } from "@/lib/branding";
import { parseFooterLines, serializeFooterLines } from "@/lib/footer-line-format";
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

/** Preserve styled footer JSON when saving non-receipt document footers. */
export function footerContentForAdmin(text) {
  return serializeFooterLines(parseFooterLines(text));
}

/** Receipt footer text for admin forms — vendor credit line is never editable. */
export function receiptFooterForAdmin(text) {
  const normalized = receiptBodyFooterForAdmin(text);
  if (normalized) return normalized;
  return defaultReceiptBodyFooterForAdmin();
}

export function resolveReceiptFooterLines(settings = {}, organizationName = "") {
  const configured = parseFooterLines(
    settings?.print_footer_receipt ?? settings?.document_footer_text ?? "",
  );
  const editable = configured.length
    ? configured.filter((line) => !isPoweredByFooterLine(line.text))
    : DEFAULT_RECEIPT_BODY_FOOTER_LINES.map((text) => ({ text, align: "left", bold: false }));

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
    print_footer_a4_invoice: footerContentForAdmin(form?.print_footer_a4_invoice ?? ""),
    print_footer_lpo: footerContentForAdmin(form?.print_footer_lpo ?? ""),
    print_footer_loading_sheet: footerContentForAdmin(form?.print_footer_loading_sheet ?? ""),
  };
}
