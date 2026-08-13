import { PRINT_FOOTER_LABELS } from "@/lib/print-footer-settings";
import { generalFormFromApi, mergeGeneralSettings } from "@/lib/general-settings";
import {
  creditNotePrintFormFromApi,
  creditNotePrintPayloadFromForm,
} from "@/lib/credit-note-print-settings";
import {
  invoicePrintFormFromApi,
  invoicePrintPayloadFromForm,
} from "@/lib/invoice-print-settings";
import {
  proformaPrintFormFromApi,
  proformaPrintPayloadFromForm,
  PROFORMA_PRINT_DEFAULTS,
} from "@/lib/proforma-print-settings";
import { lpoPrintFormFromApi, lpoPrintPayloadFromForm } from "@/lib/lpo-print-settings";
import { loadingSheetPrintFormFromApi, loadingSheetPrintPayloadFromForm } from "@/lib/loading-sheet-print-settings";
import { printFooterFormFromGeneral, printFooterPayloadFromForm } from "@/lib/print-footer-settings";
import { defaultReceiptBodyFooterForAdmin } from "@/lib/sales-document-footer";
import {
  printFontFormDefaults,
  printFontFormFromGeneral,
  printFontPayloadFromForm,
} from "@/lib/print-font-settings";
import {
  documentLogoFormDefaults,
  documentLogoFormFromGeneral,
  documentLogoPayloadFromForm,
} from "@/lib/document-logo-settings";
import {
  receiptPaymentDetailsFromApi,
  receiptPaymentDetailsToPayload,
  DEFAULT_POS_RECEIPT_PAYMENT_LINES,
} from "@/lib/receipt-payment-details";
import { emptyPrintPhones } from "@/lib/document-print-phones";
import { isPlatformMobileOrdersEnabled } from "@/lib/platform-org-features";
import { salesOrganizationFormFromApi } from "@/lib/sales-settings";

export const EMPTY_PRINTOUTS_FORM = {
  document_footer_text: "",
  show_organization_on_documents: true,
  document_header_display: "auto",
  ...printFontFormDefaults(),
  ...documentLogoFormDefaults(),
  print_footer_receipt: defaultReceiptBodyFooterForAdmin(),
  print_footer_a4_invoice: "",
  print_footer_hospitality_check:
    "You were served by: {username}\nThank you for dining with us\nPlease check your bill carefully",
  print_footer_lpo: "",
  print_footer_loading_sheet: "",
  print_footer_picking_list: "",
  print_footer_trip_chart: "",
  print_footer_payroll_receipt: "",
  order_document_type: "receipt",
  receipt_copies: "1",
  show_branch_on_receipt: true,
  check_receipt_copies: "1",
  show_outlet_on_check_receipt: true,
  show_organization_on_check_receipt: true,
  enable_check_guest_name: false,
  show_address_on_check_receipt: true,
  show_tax_pin_on_check_receipt: true,
  show_unit_price_on_check_receipt: true,
  show_cashier_on_check_receipt: true,
  show_datetime_on_check_receipt: true,
  show_check_payment_details: true,
  use_same_payment_details_for_check: true,
  check_receipt_show_all_payment_methods: false,
  use_same_print_phones_for_check: true,
  check_print_phones: emptyPrintPhones(),
  check_receipt_payment_details: {
    title: "Payment details",
    blocks: [{ title: "", lines: [{ label: "", value: "" }] }],
    lines: [{ label: "", value: "" }],
    note: "",
  },
  show_full_package_uom_on_documents: false,
  show_receipt_payment_details: true,
  show_invoice_payment_details: true,
  use_same_payment_details_for_routes: true,
  pos_receipt_payment_details: {
    title: "Payment details",
    blocks: [{ title: "", lines: [{ label: "", value: "" }] }],
    lines: [{ label: "", value: "" }],
    note: "",
  },
  route_receipt_payment_details: {
    title: "Payment details",
    blocks: [{ title: "", lines: [{ label: "", value: "" }] }],
    lines: [{ label: "", value: "" }],
    note: "",
  },
  invoice_payment_details: {
    title: "Payment details",
    lines: [],
    note: "",
  },
  invoice_valid_days: "7",
  invoice_document_template: "default",
  credit_note_document_template: "default",
  invoice_print_delivery_terms: "",
  invoice_print_footer_lines: "",
  print_footer_credit_note: "",
  proforma_valid_days: String(PROFORMA_PRINT_DEFAULTS.proforma_valid_days),
  show_print_proforma_invoice_option: true,
  proforma_document_template: "default",
  show_proforma_payment_details: true,
  proforma_payment_details: {
    title: "Payment details",
    blocks: [{ title: "", lines: [{ label: "", value: "" }] }],
    lines: [{ label: "", value: "" }],
    note: "",
  },
  show_proforma_terms: true,
  proforma_print_terms: PROFORMA_PRINT_DEFAULTS.proforma_print_terms,
  show_proforma_vat_note: true,
  proforma_vat_note: PROFORMA_PRINT_DEFAULTS.proforma_vat_note,
  show_proforma_signatures: true,
  proforma_confirmed_by: "",
  show_proforma_banner: true,
  proforma_banner_text: PROFORMA_PRINT_DEFAULTS.proforma_banner_text,
  show_proforma_customer_pin: true,
  show_proforma_our_pin: true,
  show_proforma_valid_until: true,
  show_proforma_payment_terms: true,
  show_proforma_totals_breakdown: true,
  use_same_print_phones_for_proforma: true,
  proforma_print_phones: emptyPrintPhones(),
  use_same_print_phones_for_lpo: true,
  lpo_print_phones: emptyPrintPhones(),
  lpo_document_template: "default",
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
  proforma: "Proforma invoices",
  credit_note: "Credit notes",
  hospitality_check: "Hotel check receipts",
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
export const PRINTOUTS_NEEDS_WORK = [];

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
  const hasHospitality = Boolean(
    modules.hospitality || modules["hospitality.bar_pos"] || modules["hospitality.backend"],
  );
  const hasProcurement = Boolean(modules.customers_suppliers);
  const hasDistribution = Boolean(modules.distribution);
  const hasHrPayroll = Boolean(modules.hr_payroll);
  const hasMobileSales = isPlatformMobileOrdersEnabled(capabilities);
  const hasRoutePrintouts = hasDistribution || hasMobileSales;

  const footerKeys = Object.keys(PRINT_FOOTER_LABELS).filter((key) => {
    if (key === "receipt" || key === "invoice" || key === "credit_note") return hasSales;
    // Hotel check footer is edited on the Hotel checks tab (hospitality settings), not General.
    if (key === "hospitality_check") return false;
    if (key === "lpo") return hasProcurement;
    if (key === "loading_sheet" || key === "picking_list" || key === "trip_chart") {
      return hasRoutePrintouts;
    }
    if (key === "payroll_receipt") return hasHrPayroll;
    return false;
  });

  const previewTypes = [
    hasSales ? "receipt" : null,
    hasSales ? "invoice" : null,
    hasSales ? "proforma" : null,
    hasSales ? "credit_note" : null,
    hasHospitality ? "hospitality_check" : null,
    hasProcurement ? "lpo" : null,
    hasRoutePrintouts ? "loading_sheet" : null,
    hasRoutePrintouts ? "picking_list" : null,
    hasRoutePrintouts ? "trip_chart" : null,
    hasHrPayroll ? "payroll_receipt" : null,
  ].filter(Boolean);

  const availableKinds = [
    hasSales ? "receipt" : null,
    hasSales ? "invoice" : null,
    hasSales ? "proforma" : null,
    hasSales ? "credit_note" : null,
    hasHospitality ? "hospitality_check" : null,
    hasProcurement ? "lpo" : null,
    hasRoutePrintouts ? "loading_sheet" : null,
    hasRoutePrintouts ? "picking_list" : null,
    hasRoutePrintouts ? "trip_chart" : null,
    hasHrPayroll ? "payroll_receipt" : null,
  ].filter(Boolean);

  const needsWork = PRINTOUTS_NEEDS_WORK.filter((item) => availableKinds.includes(item.kind));

  return {
    hasSales,
    hasHospitality,
    hasProcurement,
    hasDistribution,
    hasMobileSales,
    hasRoutePrintouts,
    hasHrPayroll,
    footerKeys,
    previewTypes,
    availableKinds,
    needsWork,
    hasModuleSections:
      hasSales || hasHospitality || hasProcurement || hasRoutePrintouts || hasHrPayroll,
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
    ...documentLogoFormFromGeneral(merged),
    ...printFooterFormFromGeneral(merged),
  };
}

export function printoutsSalesFormFromApi(res) {
  const sales = salesOrganizationFormFromApi(res);
  return {
    order_document_type: sales.order_document_type,
    receipt_copies: sales.receipt_copies,
    show_branch_on_receipt: sales.show_branch_on_receipt,
    show_full_package_uom_on_documents: sales.show_full_package_uom_on_documents,
    show_receipt_payment_details: sales.show_receipt_payment_details,
    show_invoice_payment_details: sales.show_invoice_payment_details,
    use_same_payment_details_for_routes: sales.use_same_payment_details_for_routes,
    pos_receipt_payment_details: sales.pos_receipt_payment_details,
    route_receipt_payment_details: sales.route_receipt_payment_details,
    invoice_valid_days: sales.invoice_valid_days,
    ...invoicePrintFormFromApi(sales),
    ...proformaPrintFormFromApi(sales),
    ...creditNotePrintFormFromApi(sales),
  };
}

export function printoutsProcurementFormFromApi(res) {
  return lpoPrintFormFromApi(res);
}

export function printoutsDistributionFormFromApi(res) {
  return loadingSheetPrintFormFromApi(res);
}

export function printoutsFormFromApis({
  generalRes,
  salesRes,
  hospitalityRes,
  procurementRes,
  distributionRes,
} = {}) {
  return {
    ...EMPTY_PRINTOUTS_FORM,
    ...(generalRes ? printoutsGeneralFormFromApi(generalRes) : {}),
    ...(salesRes ? printoutsSalesFormFromApi(salesRes) : {}),
    ...(hospitalityRes ? printoutsHospitalityFormFromApi(hospitalityRes) : {}),
    ...(procurementRes ? printoutsProcurementFormFromApi(procurementRes) : {}),
    ...(distributionRes ? printoutsDistributionFormFromApi(distributionRes) : {}),
  };
}

export function printoutsHospitalityFormFromApi(res = {}) {
  const h = res?.hospitality ?? res ?? {};
  const phones = h.check_print_phones ?? {};
  const defaultFooter =
    "You were served by: {username}\nThank you for dining with us\nPlease check your bill carefully";
  return {
    check_receipt_copies: String(h.check_receipt_copies ?? 1),
    show_outlet_on_check_receipt: h.show_outlet_on_check_receipt !== false,
    show_organization_on_check_receipt: h.show_organization_on_check_receipt !== false,
    enable_check_guest_name: Boolean(h.enable_check_guest_name),
    show_address_on_check_receipt: h.show_address_on_check_receipt !== false,
    show_tax_pin_on_check_receipt: h.show_tax_pin_on_check_receipt !== false,
    show_unit_price_on_check_receipt: h.show_unit_price_on_check_receipt !== false,
    show_cashier_on_check_receipt: h.show_cashier_on_check_receipt !== false,
    show_datetime_on_check_receipt: h.show_datetime_on_check_receipt !== false,
    show_check_payment_details: h.show_check_payment_details !== false,
    use_same_payment_details_for_check: h.use_same_payment_details_for_check !== false,
    check_receipt_show_all_payment_methods: Boolean(h.check_receipt_show_all_payment_methods),
    print_footer_hospitality_check: String(h.check_receipt_footer ?? defaultFooter),
    check_receipt_payment_details: receiptPaymentDetailsFromApi(
      h.check_receipt_payment_details ?? {
        title: "Payment details",
        blocks: [{ title: "", lines: [{ label: "", value: "" }] }],
        lines: [{ label: "", value: "" }],
        note: "",
      },
    ),
    use_same_print_phones_for_check: h.use_same_print_phones_for_check !== false,
    check_print_phones: {
      tel1: String(phones.tel1 ?? ""),
      tel2: String(phones.tel2 ?? ""),
    },
  };
}

export function printoutsHospitalityPayloadFromForm(form) {
  return {
    check_receipt_copies: Math.min(3, Math.max(1, Number(form.check_receipt_copies) || 1)),
    show_outlet_on_check_receipt: Boolean(form.show_outlet_on_check_receipt),
    show_organization_on_check_receipt: Boolean(form.show_organization_on_check_receipt),
    enable_check_guest_name: Boolean(form.enable_check_guest_name),
    show_address_on_check_receipt: Boolean(form.show_address_on_check_receipt),
    show_tax_pin_on_check_receipt: Boolean(form.show_tax_pin_on_check_receipt),
    show_unit_price_on_check_receipt: Boolean(form.show_unit_price_on_check_receipt),
    show_cashier_on_check_receipt: Boolean(form.show_cashier_on_check_receipt),
    show_datetime_on_check_receipt: Boolean(form.show_datetime_on_check_receipt),
    show_check_payment_details: Boolean(form.show_check_payment_details),
    use_same_payment_details_for_check: Boolean(form.use_same_payment_details_for_check),
    check_receipt_show_all_payment_methods: Boolean(form.check_receipt_show_all_payment_methods),
    check_receipt_footer: String(form.print_footer_hospitality_check ?? "").trim(),
    check_receipt_payment_details: receiptPaymentDetailsToPayload(
      form.check_receipt_payment_details ?? {
        title: "Payment details",
        lines: DEFAULT_POS_RECEIPT_PAYMENT_LINES,
        note: "",
      },
    ),
    use_same_print_phones_for_check: Boolean(form.use_same_print_phones_for_check),
    check_print_phones: {
      tel1: String(form.check_print_phones?.tel1 ?? "").trim(),
      tel2: String(form.check_print_phones?.tel2 ?? "").trim(),
    },
  };
}

export function printoutsGeneralPayloadFromForm(form) {
  return {
    show_organization_on_documents: Boolean(form.show_organization_on_documents),
    document_header_display: form.document_header_display || "auto",
    document_footer_text: String(form.document_footer_text ?? "").trim(),
    ...printFontPayloadFromForm(form),
    ...documentLogoPayloadFromForm(form),
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
    show_full_package_uom_on_documents: Boolean(form.show_full_package_uom_on_documents),
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
    ...proformaPrintPayloadFromForm(form),
    ...creditNotePrintPayloadFromForm(form),
  };
}

export function printoutsProcurementPayloadFromForm(form) {
  return lpoPrintPayloadFromForm(form);
}

export function printoutsDistributionPayloadFromForm(form) {
  return loadingSheetPrintPayloadFromForm(form);
}
