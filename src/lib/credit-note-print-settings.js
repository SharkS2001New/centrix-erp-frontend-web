import { resolveOrgDocumentTemplateId, DEFAULT_DOCUMENT_TEMPLATE_ID } from "@/lib/document-print-templates";

export const CREDIT_NOTE_PRINT_DEFAULTS = {
  credit_note_document_template: DEFAULT_DOCUMENT_TEMPLATE_ID,
};

export function creditNotePrintFormFromApi(sales = {}) {
  const merged = { ...CREDIT_NOTE_PRINT_DEFAULTS, ...sales };
  return {
    credit_note_document_template: resolveOrgDocumentTemplateId(
      merged.credit_note_document_template ?? CREDIT_NOTE_PRINT_DEFAULTS.credit_note_document_template,
    ),
  };
}

export function creditNotePrintPayloadFromForm(form = {}) {
  return {
    credit_note_document_template: resolveOrgDocumentTemplateId(
      form.credit_note_document_template ?? DEFAULT_DOCUMENT_TEMPLATE_ID,
    ),
  };
}
