"use client";

import { useCallback, useState } from "react";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { printLpoDocument, sampleLpoPreviewData } from "@/components/lpo/lpo-print-html";
import {
  printLoadingList,
  sampleLoadingListPreviewData,
} from "@/components/fulfillment/loading-list-print";
import { lpoPrintPayloadFromForm } from "@/lib/lpo-print-settings";
import { loadingSheetPrintPayloadFromForm } from "@/lib/loading-sheet-print-settings";
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
import {
  SAMPLE_PREVIEW_CUSTOMER,
  SAMPLE_PREVIEW_SELLER,
} from "@/lib/print-preview-samples";
import { mergeSalesSettings } from "@/lib/sales-settings";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { useAuth } from "@/contexts/auth-context";
import { printSaleReceipt } from "@/components/sales/sale-receipt-print";

const PREVIEW_DEFER_MS = 32;
const PREVIEW_COOLDOWN_MS = 450;

function deferPrintPreview(run) {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      try {
        run();
        resolve();
      } catch (error) {
        reject(error);
      }
    }, PREVIEW_DEFER_MS);
  });
}

export function DocumentPrintPreviewButton({
  onPreview,
  label = "Preview",
  disabled = false,
  className = "",
}) {
  const [previewing, setPreviewing] = useState(false);

  const handleClick = useCallback(async () => {
    if (previewing || disabled) return;
    setPreviewing(true);
    try {
      await deferPrintPreview(onPreview);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Failed to open print preview.");
    } finally {
      window.setTimeout(() => setPreviewing(false), PREVIEW_COOLDOWN_MS);
    }
  }, [disabled, onPreview, previewing]);

  return (
    <button
      type="button"
      disabled={disabled || previewing}
      onClick={() => void handleClick()}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {previewing ? (
        <>
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
            aria-hidden
          />
          Opening preview…
        </>
      ) : (
        label
      )}
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

function resolvePreviewSeller(organization) {
  if (!organization) return SAMPLE_PREVIEW_SELLER;
  return {
    name: organization.org_name ?? SAMPLE_PREVIEW_SELLER.name,
    address: organization.org_address ?? SAMPLE_PREVIEW_SELLER.address,
    email: organization.org_email ?? SAMPLE_PREVIEW_SELLER.email,
    phone: organization.primary_tel ?? SAMPLE_PREVIEW_SELLER.phone,
    secondary_phone: organization.secondary_tel ?? "",
    tax_pin: organization.org_pin ?? SAMPLE_PREVIEW_SELLER.tax_pin,
  };
}

export function previewLpoPrint({
  organization = null,
  generalSettings = null,
  procurementForm = null,
}) {
  const sample = sampleLpoPreviewData();
  const printSettings = procurementForm
    ? {
        ...lpoPrintPayloadFromForm(procurementForm),
        lpo_print_checked_by: procurementForm.lpo_print_checked_by || "Rutto",
        lpo_print_authorised_by: procurementForm.lpo_print_authorised_by || "Steve Omega",
      }
    : null;
  printLpoDocument({
    ...sample,
    organization,
    generalSettings,
    printedBy: "Preview",
    printSettings,
    documentFooterText: resolvePrintFooter(generalSettings ?? {}, "lpo"),
  });
}

export function previewLoadingListPrint({
  organization = null,
  generalSettings = null,
  moduleSettings = null,
  printoutsForm = null,
}) {
  const general = printoutsForm
    ? buildPreviewGeneralFromForm(printoutsForm, moduleSettings)
    : generalSettings ?? mergeGeneralSettings(moduleSettings);

  const sample = sampleLoadingListPreviewData();
  printLoadingList({
    organization,
    generalSettings: general,
    loadingList: sample.loadingList,
    printSettings: printoutsForm ? loadingSheetPrintPayloadFromForm(printoutsForm) : null,
    documentFooterText: resolvePrintFooter(general, "loading_sheet"),
  });
}

function buildPreviewGeneralFromForm(form, moduleSettings) {
  return {
    ...mergeGeneralSettings(moduleSettings),
    show_organization_on_documents: form.show_organization_on_documents,
    document_header_display: form.document_header_display,
    print_footer_receipt: form.print_footer_receipt,
    print_footer_a4_invoice: form.print_footer_a4_invoice,
    print_footer_lpo: form.print_footer_lpo,
    print_footer_loading_sheet: form.print_footer_loading_sheet,
  };
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
  const seller = resolvePreviewSeller(organization);
  const sale = sampleReceiptPreviewSale();
  const paymentInstructions = receiptPaymentDetailsToPayload(sales.pos_receipt_payment_details);

  printSaleInvoice(sale, {
    seller,
    branding,
    customer: SAMPLE_PREVIEW_CUSTOMER,
    productDiscountsEnabled: Boolean(sales.allow_discounts),
    orderDiscountEnabled: Boolean(sales.enable_order_discount),
    invoiceValidDays: Number(sales.invoice_valid_days ?? 7),
    documentFooterText: resolvePrintFooter(general, "invoice"),
    paymentInstructions,
    showPaymentInstructions: shouldShowReceiptPaymentDetails({ sales }, "invoice"),
    deliveryTerms: resolveInvoiceDeliveryTerms(sales),
    footerLines: resolveInvoiceFooterLines(sales, {
      organizationName: seller.name,
      validDays: Number(sales.invoice_valid_days ?? 7),
    }),
    preparedBy: "Preview cashier",
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
  const seller = organization ? resolvePreviewSeller(organization) : null;

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
    documentFooterText: resolvePrintFooter(general, "receipt"),
    paymentInstructions: payload,
  });
}
