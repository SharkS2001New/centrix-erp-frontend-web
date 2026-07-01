"use client";

import { useEffect, useMemo, useState } from "react";
import { buildLoadingListHtml } from "@/components/fulfillment/loading-list-print";
import { buildLpoPrintHtml } from "@/components/lpo/lpo-print-html";
import { buildSaleInvoiceHtml } from "@/components/sales/sale-invoice-print";
import { buildSaleReceiptHtml } from "@/components/sales/sale-receipt-print";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { lpoPrintPayloadFromForm } from "@/lib/lpo-print-settings";
import { loadingSheetPrintPayloadFromForm } from "@/lib/loading-sheet-print-settings";
import { sampleLoadingListPreviewData } from "@/components/fulfillment/loading-list-print";
import { sampleLpoPreviewData } from "@/components/lpo/lpo-print-html";
import {
  receiptPaymentDetailsToPayload,
  sampleReceiptPreviewSale,
  shouldShowReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { resolvePrintoutSections } from "@/lib/printouts-settings";
import { SAMPLE_PREVIEW_CUSTOMER, SAMPLE_PREVIEW_SELLER } from "@/lib/print-preview-samples";
import { mergeSalesSettings } from "@/lib/sales-settings";
import { resolveSaleDocumentBranding } from "@/lib/sale-document-print-shared";

const PREVIEW_OPTION_LABELS = {
  receipt: "Thermal receipt",
  invoice: "Invoice receipt (A4)",
  lpo: "LPO",
  loading_sheet: "Loading sheet",
};

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

function buildPreviewGeneral(form, moduleSettings) {
  return {
    ...mergeGeneralSettings(moduleSettings),
    show_organization_on_documents: form.show_organization_on_documents,
    document_header_display: form.document_header_display,
    print_font_family: form.print_font_family ?? "times",
    print_font_scale: form.print_font_scale ?? "standard",
    print_footer_receipt: form.print_footer_receipt,
    print_footer_a4_invoice: form.print_footer_a4_invoice,
    print_footer_lpo: form.print_footer_lpo,
    print_footer_loading_sheet: form.print_footer_loading_sheet,
  };
}

function buildPreviewHtml(previewType, { form, organization, moduleSettings }) {
  if (!form) return "";

  const general = buildPreviewGeneral(form, moduleSettings);
  const sales = { ...mergeSalesSettings(moduleSettings), ...form };
  const branding = resolveSaleDocumentBranding({ organization, generalSettings: general });
  const seller = resolvePreviewSeller(organization);
  const sale = sampleReceiptPreviewSale();

  if (previewType === "receipt") {
    const paymentInstructions = receiptPaymentDetailsToPayload(sales.pos_receipt_payment_details);
    return buildSaleReceiptHtml(sale, {
      seller,
      branding,
      organization,
      productDiscountsEnabled: Boolean(sales.allow_discounts),
      orderDiscountEnabled: Boolean(sales.enable_order_discount),
      customerNameEnabled: Boolean(sales.enable_checkout_customer_name),
      showBranchOnReceipt: Boolean(sales.show_branch_on_receipt),
      documentFooterText: resolvePrintFooter(general, "receipt"),
      paymentInstructions,
      showPaymentInstructions: shouldShowReceiptPaymentDetails({ sales }, "receipt"),
      generalSettings: general,
    });
  }

  if (previewType === "invoice") {
    const paymentInstructions = receiptPaymentDetailsToPayload(sales.pos_receipt_payment_details);
    return buildSaleInvoiceHtml(sale, {
      seller,
      branding,
      customer: SAMPLE_PREVIEW_CUSTOMER,
      productDiscountsEnabled: Boolean(sales.allow_discounts),
      orderDiscountEnabled: Boolean(sales.enable_order_discount),
      invoiceValidDays: Number(sales.invoice_valid_days ?? 7),
      documentFooterText: resolvePrintFooter(general, "invoice"),
      paymentInstructions,
      showPaymentInstructions: shouldShowReceiptPaymentDetails({ sales }, "invoice"),
      preparedBy: "Preview cashier",
      generalSettings: general,
    });
  }

  if (previewType === "lpo") {
    const sample = sampleLpoPreviewData();
    const printSettings = {
      ...lpoPrintPayloadFromForm(form),
      lpo_print_checked_by: form.lpo_print_checked_by || "Rutto",
      lpo_print_authorised_by: form.lpo_print_authorised_by || "Steve Omega",
    };
    return buildLpoPrintHtml({
      ...sample,
      organization,
      generalSettings: general,
      printedBy: "Preview",
      printSettings,
      documentFooterText: resolvePrintFooter(general, "lpo"),
    });
  }

  const loadingSettings = loadingSheetPrintPayloadFromForm(form);
  const sample = sampleLoadingListPreviewData();
  return buildLoadingListHtml({
    organization,
    generalSettings: general,
    loadingList: sample.loadingList,
    printSettings: loadingSettings,
    documentFooterText: resolvePrintFooter(general, "loading_sheet"),
    footerLines: loadingSettings.loading_sheet_footer_lines
      ? loadingSettings.loading_sheet_footer_lines.split(/\n+/).filter(Boolean)
      : [],
    printedBy: "Preview",
  });
}

export function PrintoutsLivePreview({
  form,
  organization,
  moduleSettings,
  capabilities,
  defaultType = "receipt",
}) {
  const previewTypes = resolvePrintoutSections(capabilities).previewTypes;
  const previewOptions = previewTypes.map((id) => ({
    id,
    label: PREVIEW_OPTION_LABELS[id] ?? id,
  }));
  const initialType = previewTypes.includes(defaultType) ? defaultType : previewTypes[0] ?? "receipt";
  const [previewType, setPreviewType] = useState(initialType);
  const [debouncedForm, setDebouncedForm] = useState(form);

  useEffect(() => {
    if (!previewTypes.includes(previewType) && previewTypes.length > 0) {
      setPreviewType(previewTypes[0]);
    }
  }, [previewType, previewTypes]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedForm(form), 280);
    return () => window.clearTimeout(timer);
  }, [form]);

  const html = useMemo(
    () =>
      buildPreviewHtml(previewType, {
        form: debouncedForm,
        organization,
        moduleSettings,
      }),
    [debouncedForm, moduleSettings, organization, previewType],
  );

  return (
    <div className="sticky top-4 flex h-[calc(100vh-8rem)] min-h-[28rem] flex-col rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-medium text-slate-900">Live preview</p>
        <p className="mt-0.5 text-xs text-slate-500">Updates as you edit. Sample data is used for speed.</p>
        {previewOptions.length > 0 ? (
        <div className="mt-3">
          <select
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            value={previewType}
            onChange={(e) => setPreviewType(e.target.value)}
          >
            {previewOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Enable Sales, Procurement, or Distribution for live previews.</p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-slate-100 p-3">
        {html ? (
          <iframe
            title="Printout preview"
            srcDoc={html}
            className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-inner"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading preview…</div>
        )}
      </div>
    </div>
  );
}
