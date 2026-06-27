"use client";

import { mergeGeneralSettings } from "@/lib/general-settings";
import { printLpoDocument, sampleLpoPreviewData } from "@/components/lpo/lpo-print-html";
import { lpoPrintPayloadFromForm } from "@/lib/lpo-print-settings";
import { resolveSaleDocumentBranding } from "@/lib/sale-document-print-shared";
import { printSaleInvoice } from "@/components/sales/sale-invoice-print";
import {
  receiptPaymentDetailsToPayload,
  sampleReceiptPreviewSale,
  shouldShowReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";
import {
  resolveInvoiceDeliveryTerms,
  resolveInvoiceFooterLines,
} from "@/lib/invoice-print-settings";
import { mergeSalesSettings } from "@/lib/sales-settings";
import { useAuth } from "@/contexts/auth-context";
import { printSaleReceipt } from "@/components/sales/sale-receipt-print";

export function DocumentPrintPreviewButton({
  onPreview,
  label = "Preview",
  disabled = false,
  className = "",
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPreview}
      className={`rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
}

export function useDocumentPrintPreviewContext() {
  const { organization, generalSettings, capabilities } = useAuth();
  return {
    organization,
    generalSettings: generalSettings(),
    moduleSettings: capabilities?.module_settings ?? null,
  };
}

export function previewLpoPrint({
  organization = null,
  generalSettings = null,
  procurementForm = null,
}) {
  const sample = sampleLpoPreviewData();
  printLpoDocument({
    ...sample,
    organization,
    generalSettings,
    printedBy: "Preview",
    printSettings: procurementForm ? lpoPrintPayloadFromForm(procurementForm) : null,
  });
}

export function previewSaleInvoicePrint({
  organization = null,
  generalSettings = null,
  moduleSettings = null,
  salesForm = null,
}) {
  const sales = salesForm
    ? { ...mergeSalesSettings(moduleSettings), ...salesForm, ...invoicePrintFieldsFromSalesForm(salesForm) }
    : mergeSalesSettings(moduleSettings);
  const general = generalSettings ?? mergeGeneralSettings(moduleSettings);
  const branding = resolveSaleDocumentBranding({ organization, generalSettings: general });
  const seller = organization
    ? {
        name: organization.org_name,
        address: organization.org_address,
        email: organization.org_email,
        phone: organization.primary_tel,
        secondary_phone: organization.secondary_tel,
        tax_pin: organization.org_pin,
      }
    : { name: "Preview Company" };

  const sale = sampleReceiptPreviewSale();
  const paymentInstructions = receiptPaymentDetailsToPayload(sales.pos_receipt_payment_details);

  printSaleInvoice(sale, {
    seller,
    branding,
    customer: {
      customer_name: "Sample Customer Ltd",
      phone_number: "0712 000 111",
      kra_pin: "P051234567X",
      town: "Nairobi",
      terms_of_payment: "30 DAYS",
    },
    productDiscountsEnabled: Boolean(sales.allow_discounts),
    orderDiscountEnabled: Boolean(sales.enable_order_discount),
    invoiceValidDays: Number(sales.invoice_valid_days ?? 7),
    documentFooterText: general.document_footer_text?.trim?.() || "",
    paymentInstructions,
    showPaymentInstructions: shouldShowReceiptPaymentDetails({ sales }, "invoice"),
    deliveryTerms: resolveInvoiceDeliveryTerms(sales),
    footerLines: resolveInvoiceFooterLines(sales, {
      organizationName: seller.name,
      validDays: Number(sales.invoice_valid_days ?? 7),
    }),
    preparedBy: "Preview cashier",
    kraEnabled: false,
  });
}

function invoicePrintFieldsFromSalesForm(form) {
  return {
    invoice_print_delivery_terms: form.invoice_print_delivery_terms,
    invoice_print_footer_lines: form.invoice_print_footer_lines,
    invoice_valid_days: form.invoice_valid_days,
    show_invoice_payment_details: form.show_invoice_payment_details,
    pos_receipt_payment_details: form.pos_receipt_payment_details,
  };
}

export function previewReceiptPaymentDetails({
  organization = null,
  generalSettings = null,
  moduleSettings = null,
  paymentDetails = null,
  salesForm = null,
  route = null,
  channel = "pos",
}) {
  const sales = salesForm
    ? {
        ...mergeSalesSettings(moduleSettings),
        show_receipt_payment_details: salesForm.show_receipt_payment_details,
        use_same_payment_details_for_routes: salesForm.use_same_payment_details_for_routes,
        pos_receipt_payment_details: salesForm.pos_receipt_payment_details,
        route_receipt_payment_details: salesForm.route_receipt_payment_details,
      }
    : mergeSalesSettings(moduleSettings);

  const general = generalSettings ?? mergeGeneralSettings(moduleSettings);
  const branding = resolveSaleDocumentBranding({ organization, generalSettings: general });
  const seller = organization
    ? {
        name: organization.org_name,
        address: organization.org_address,
        email: organization.org_email,
        phone: organization.primary_tel,
        secondary_phone: organization.secondary_tel,
        tax_pin: organization.org_pin,
      }
    : null;

  const isRoutePreview = channel === "mobile" || channel === "route";
  const details =
    paymentDetails ??
    (isRoutePreview && route?.receipt_payment_details
      ? route.receipt_payment_details
      : isRoutePreview && sales.use_same_payment_details_for_routes === false
        ? sales.route_receipt_payment_details
        : sales.pos_receipt_payment_details);

  const payload = receiptPaymentDetailsToPayload(details);
  if (!payload || !shouldShowReceiptPaymentDetails({ sales }, "receipt")) {
    window.alert("Add at least one payment line to preview.");
    return;
  }

  const sale = sampleReceiptPreviewSale({
    channel: isRoutePreview ? "mobile" : "pos",
    routeId: route?.id ?? (isRoutePreview ? 1 : null),
  });

  printSaleReceipt(sale, {
    seller,
    branding,
    organization,
    productDiscountsEnabled: Boolean(sales.allow_discounts),
    orderDiscountEnabled: Boolean(sales.enable_order_discount),
    customerNameEnabled: Boolean(sales.enable_checkout_customer_name),
    showBranchOnReceipt: Boolean(sales.show_branch_on_receipt),
    documentFooterText: general.document_footer_text?.trim?.() || "",
    paymentInstructions: payload,
    kraEnabled: false,
  });
}
