import { generalFormFromApi } from "@/lib/general-settings";
import {
  invoicePrintFormFromApi,
  invoicePrintPayloadFromForm,
} from "@/lib/invoice-print-settings";
import { lpoPrintFormFromApi, lpoPrintPayloadFromForm } from "@/lib/lpo-print-settings";
import {
  receiptPaymentDetailsFromApi,
  receiptPaymentDetailsToPayload,
  DEFAULT_POS_RECEIPT_PAYMENT_LINES,
} from "@/lib/receipt-payment-details";
import { salesOrganizationFormFromApi } from "@/lib/sales-settings";

export const EMPTY_PRINTOUTS_FORM = {
  document_footer_text: "",
  show_organization_on_documents: true,
  document_header_display: "auto",
  order_document_type: "receipt",
  receipt_copies: "1",
  show_branch_on_receipt: true,
  show_receipt_payment_details: true,
  show_invoice_payment_details: true,
  use_same_payment_details_for_routes: true,
  pos_receipt_payment_details: {
    title: "Payment details",
    lines: [],
    note: "",
  },
  route_receipt_payment_details: {
    title: "Payment details",
    lines: [],
    note: "",
  },
  invoice_valid_days: "7",
  invoice_print_delivery_terms: "",
  invoice_print_footer_lines: "",
  lpo_print_delivery_notes: "",
  lpo_print_kebs_warning: "",
  lpo_print_vat_note: "",
};

export function printoutsGeneralFormFromApi(res) {
  const general = generalFormFromApi(res);
  return {
    document_footer_text: general.document_footer_text,
    show_organization_on_documents: general.show_organization_on_documents,
    document_header_display: general.document_header_display,
  };
}

export function printoutsSalesFormFromApi(res) {
  const sales = salesOrganizationFormFromApi(res);
  return {
    order_document_type: sales.order_document_type,
    receipt_copies: sales.receipt_copies,
    show_branch_on_receipt: sales.show_branch_on_receipt,
    show_receipt_payment_details: sales.show_receipt_payment_details,
    show_invoice_payment_details: sales.show_invoice_payment_details,
    use_same_payment_details_for_routes: sales.use_same_payment_details_for_routes,
    pos_receipt_payment_details: sales.pos_receipt_payment_details,
    route_receipt_payment_details: sales.route_receipt_payment_details,
    invoice_valid_days: sales.invoice_valid_days,
    ...invoicePrintFormFromApi(sales),
  };
}

export function printoutsProcurementFormFromApi(res) {
  return lpoPrintFormFromApi(res);
}

export function printoutsFormFromApis({ generalRes, salesRes, procurementRes } = {}) {
  return {
    ...EMPTY_PRINTOUTS_FORM,
    ...(generalRes ? printoutsGeneralFormFromApi(generalRes) : {}),
    ...(salesRes ? printoutsSalesFormFromApi(salesRes) : {}),
    ...(procurementRes ? printoutsProcurementFormFromApi(procurementRes) : {}),
  };
}

export function printoutsGeneralPayloadFromForm(form) {
  return {
    document_footer_text: form.document_footer_text?.trim() || "",
    show_organization_on_documents: Boolean(form.show_organization_on_documents),
    document_header_display: form.document_header_display || "auto",
  };
}

export function printoutsSalesPayloadFromForm(form) {
  return {
    order_document_type: ["receipt", "invoice", "both"].includes(form.order_document_type)
      ? form.order_document_type
      : "receipt",
    receipt_copies: Number(form.receipt_copies) || 1,
    show_branch_on_receipt: Boolean(form.show_branch_on_receipt),
    show_receipt_payment_details: Boolean(form.show_receipt_payment_details),
    show_invoice_payment_details: Boolean(form.show_invoice_payment_details),
    use_same_payment_details_for_routes: Boolean(form.use_same_payment_details_for_routes),
    pos_receipt_payment_details: receiptPaymentDetailsToPayload(
      form.pos_receipt_payment_details ?? {
        title: "Payment details",
        lines: DEFAULT_POS_RECEIPT_PAYMENT_LINES,
        note: "",
      },
    ),
    route_receipt_payment_details: receiptPaymentDetailsToPayload(
      form.route_receipt_payment_details ?? {
        title: "Payment details",
        lines: DEFAULT_POS_RECEIPT_PAYMENT_LINES.map((line) => ({ ...line })),
        note: "",
      },
    ),
    invoice_valid_days: Number(form.invoice_valid_days) || 0,
    ...invoicePrintPayloadFromForm(form),
  };
}

export function printoutsProcurementPayloadFromForm(form) {
  return lpoPrintPayloadFromForm(form);
}
