import { PRINT_FOOTER_LABELS } from "@/lib/print-footer-settings";
import { generalFormFromApi, mergeGeneralSettings } from "@/lib/general-settings";
import {
  invoicePrintFormFromApi,
  invoicePrintPayloadFromForm,
} from "@/lib/invoice-print-settings";
import { lpoPrintFormFromApi, lpoPrintPayloadFromForm } from "@/lib/lpo-print-settings";
import { loadingSheetPrintFormFromApi, loadingSheetPrintPayloadFromForm } from "@/lib/loading-sheet-print-settings";
import { printFooterFormFromGeneral, printFooterPayloadFromForm } from "@/lib/print-footer-settings";
import {
  printFontFormDefaults,
  printFontFormFromGeneral,
  printFontPayloadFromForm,
} from "@/lib/print-font-settings";
import {
  receiptPaymentDetailsFromApi,
  receiptPaymentDetailsToPayload,
  DEFAULT_POS_RECEIPT_PAYMENT_LINES,
} from "@/lib/receipt-payment-details";
import { isPlatformMobileOrdersEnabled } from "@/lib/platform-org-features";
import { salesOrganizationFormFromApi } from "@/lib/sales-settings";

export const EMPTY_PRINTOUTS_FORM = {
  document_footer_text: "",
  show_organization_on_documents: true,
  document_header_display: "auto",
  ...printFontFormDefaults(),
  print_footer_receipt: "",
  print_footer_a4_invoice: "",
  print_footer_lpo: "",
  print_footer_loading_sheet: "",
  print_footer_picking_list: "",
  print_footer_trip_chart: "",
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
  lpo_print_footer_lines: "",
  lpo_print_validity_days: "7",
  lpo_print_checked_by: "",
  lpo_print_authorised_by: "",
  loading_sheet_footer_lines: "",
  loading_sheet_show_signatures: true,
  loading_sheet_show_qty_column: true,
  loading_sheet_show_price_columns: true,
  loading_sheet_show_total: true,
  loading_sheet_show_trip_expenses: true,
  loading_sheet_show_trip_profit: true,
  loading_sheet_default_checked_by: "",
};

/** Human labels for printout kinds shown in Admin → Printouts. */
export const PRINTOUT_KIND_LABELS = {
  receipt: "Thermal receipts",
  invoice: "A4 invoices",
  lpo: "Local purchase orders (LPO)",
  loading_sheet: "Loading sheets",
  picking_list: "Picking lists",
  trip_chart: "Trip chart lists",
  payroll_receipt: "HR payroll receipts (payslips)",
};

/**
 * Printouts that are catalogued but still need contrast / branding polish.
 * Shown under Admin → Printouts so they stay on the work list.
 */
export const PRINTOUTS_NEEDS_WORK = [
  {
    kind: "payroll_receipt",
    label: "HR payroll receipts (payslips)",
    note: "Org name contrast improved; still needs full Admin Printouts settings (logo, footer, fonts) like sales receipts.",
  },
];

/** Which document footer keys apply for the configured order print format. */
export function footerKeysForOrderPrintFormat(footerKeys, orderDocumentType) {
  const type = ["receipt", "invoice", "both"].includes(orderDocumentType)
    ? orderDocumentType
    : "receipt";

  return (footerKeys ?? []).filter((key) => {
    if (key === "receipt") return type === "receipt" || type === "both";
    if (key === "invoice") return type === "invoice" || type === "both";
    return true;
  });
}

/** Whether thermal receipt / A4 invoice printout tabs should appear. */
export function orderPrintFormatSections(orderDocumentType) {
  const type = ["receipt", "invoice", "both"].includes(orderDocumentType)
    ? orderDocumentType
    : "receipt";

  return {
    showThermal: type === "receipt" || type === "both",
    showA4: type === "invoice" || type === "both",
  };
}

/**
 * Which printout sections apply for this organization.
 * Small shop (sales only): receipts / A4 invoices (+ LPO if procurement).
 * Route docs (loading, picking, trip chart): when Distribution is on, or mobile orders are enabled
 * (wholesale / retail with field sales).
 */
export function resolvePrintoutSections(capabilities) {
  const modules = capabilities?.modules ?? {};
  const hasSales = Boolean(modules.sales);
  const hasProcurement = Boolean(modules.customers_suppliers);
  const hasDistribution = Boolean(modules.distribution);
  const hasHrPayroll = Boolean(modules.hr_payroll);
  const hasMobileSales = isPlatformMobileOrdersEnabled(capabilities);
  const hasRoutePrintouts = hasDistribution || hasMobileSales;

  const footerKeys = Object.keys(PRINT_FOOTER_LABELS).filter((key) => {
    if (key === "receipt" || key === "invoice") return hasSales;
    if (key === "lpo") return hasProcurement;
    if (key === "loading_sheet" || key === "picking_list" || key === "trip_chart") {
      return hasRoutePrintouts;
    }
    return false;
  });

  const previewTypes = [
    hasSales ? "receipt" : null,
    hasSales ? "invoice" : null,
    hasProcurement ? "lpo" : null,
    hasRoutePrintouts ? "loading_sheet" : null,
    hasRoutePrintouts ? "picking_list" : null,
    hasRoutePrintouts ? "trip_chart" : null,
  ].filter(Boolean);

  const availableKinds = [
    hasSales ? "receipt" : null,
    hasSales ? "invoice" : null,
    hasProcurement ? "lpo" : null,
    hasRoutePrintouts ? "loading_sheet" : null,
    hasRoutePrintouts ? "picking_list" : null,
    hasRoutePrintouts ? "trip_chart" : null,
    hasHrPayroll ? "payroll_receipt" : null,
  ].filter(Boolean);

  const needsWork = PRINTOUTS_NEEDS_WORK.filter((item) => availableKinds.includes(item.kind));

  return {
    hasSales,
    hasProcurement,
    hasDistribution,
    hasMobileSales,
    hasRoutePrintouts,
    hasHrPayroll,
    footerKeys,
    previewTypes,
    availableKinds,
    needsWork,
    hasModuleSections: hasSales || hasProcurement || hasRoutePrintouts || hasHrPayroll,
  };
}

export function printoutsGeneralFormFromApi(res) {
  const merged = mergeGeneralSettings({ general: res?.general ?? res });
  const general = generalFormFromApi(res);
  return {
    document_footer_text: general.document_footer_text,
    show_organization_on_documents: general.show_organization_on_documents,
    document_header_display: general.document_header_display,
    ...printFontFormFromGeneral(merged),
    ...printFooterFormFromGeneral(merged),
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

export function printoutsDistributionFormFromApi(res) {
  return loadingSheetPrintFormFromApi(res);
}

export function printoutsFormFromApis({ generalRes, salesRes, procurementRes, distributionRes } = {}) {
  return {
    ...EMPTY_PRINTOUTS_FORM,
    ...(generalRes ? printoutsGeneralFormFromApi(generalRes) : {}),
    ...(salesRes ? printoutsSalesFormFromApi(salesRes) : {}),
    ...(procurementRes ? printoutsProcurementFormFromApi(procurementRes) : {}),
    ...(distributionRes ? printoutsDistributionFormFromApi(distributionRes) : {}),
  };
}

export function printoutsGeneralPayloadFromForm(form) {
  return {
    show_organization_on_documents: Boolean(form.show_organization_on_documents),
    document_header_display: form.document_header_display || "auto",
    document_footer_text: String(form.document_footer_text ?? "").trim(),
    ...printFontPayloadFromForm(form),
    ...printFooterPayloadFromForm(form),
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

export function printoutsDistributionPayloadFromForm(form) {
  return loadingSheetPrintPayloadFromForm(form);
}
