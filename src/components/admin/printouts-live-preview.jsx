"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/catalog/catalog-shared";
import {
  buildHospitalityCheckReceiptHtml,
  sampleHospitalityCheckPreviewData,
} from "@/components/hospitality/hospitality-check-receipt-print";
import { buildLoadingListHtml, sampleLoadingListPreviewData } from "@/components/fulfillment/loading-list-print";
import {
  buildPickingListHtml,
  samplePickingListPreviewData,
} from "@/components/fulfillment/picking-list-print";
import {
  buildTripChartListHtml,
  sampleTripChartListPreviewData,
} from "@/components/fulfillment/trip-chart-list-print";
import {
  buildPayrollReceiptDocument,
  samplePayrollReceiptPreviewData,
} from "@/components/hr/payroll-receipt-print";
import { buildLpoPrintHtml, sampleLpoPreviewData } from "@/components/lpo/lpo-print-html";
import { buildSaleInvoiceHtml } from "@/components/sales/sale-invoice-print";
import { buildSaleReceiptHtml } from "@/components/sales/sale-receipt-print";
import {
  buildCreditNotePreviewHtml,
  sampleCreditNotePreviewDocument,
} from "@/components/sales/credit-note-print";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { lpoPrintPayloadFromForm } from "@/lib/lpo-print-settings";
import { loadingSheetPrintPayloadFromForm } from "@/lib/loading-sheet-print-settings";
import {
  receiptPaymentDetailsToPayload,
  sampleReceiptPreviewSale,
  shouldShowReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";
import { resolveProformaValidDays } from "@/lib/proforma-print-settings";
import { mergePreviewGeneralWithPrintFonts } from "@/lib/print-font-settings";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { printoutsHospitalityPayloadFromForm, resolvePrintoutSections } from "@/lib/printouts-settings";
import {
  SAMPLE_PREVIEW_BRANCH,
  SAMPLE_PREVIEW_CUSTOMER,
  SAMPLE_PREVIEW_SELLER,
} from "@/lib/print-preview-samples";
import { mergeSalesSettings } from "@/lib/sales-settings";
import { resolveSaleDocumentBranding } from "@/lib/sale-document-print-shared";
import { fetchOrganizationLogoDataUrl } from "@/lib/organization-logo";
import {
  ORG_DOCUMENT_DESIGN_TEMPLATES,
  documentTemplateFieldForPreviewType,
  orgDocumentTemplateMeta,
} from "@/lib/document-print-templates";
import { openPrintWindow, printWindowFeatures } from "@/lib/open-print-window";

const PREVIEW_OPTION_LABELS = {
  receipt: "Thermal receipt",
  invoice: "Invoice receipt (A4)",
  proforma: "Proforma invoice",
  credit_note: "Credit note",
  hospitality_check: "Hotel check receipt",
  lpo: "LPO",
  loading_sheet: "Loading sheet",
  picking_list: "Picking list",
  trip_chart: "Trip chart list",
  payroll_receipt: "Salary payment receipt",
};

const PREVIEW_TYPOGRAPHY_VARIANT = {
  receipt: "thermal",
  hospitality_check: "thermal_check",
  invoice: "sale_invoice",
  proforma: "sale_invoice",
  credit_note: "sale_invoice",
  lpo: "lpo",
  loading_sheet: "loading_sheet",
  picking_list: "picking_list",
  trip_chart: "trip_chart",
  payroll_receipt: "payroll_receipt",
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

function buildPreviewGeneral(form, moduleSettings, previewType) {
  const typographyVariant = PREVIEW_TYPOGRAPHY_VARIANT[previewType] ?? "sale_invoice";
  return mergePreviewGeneralWithPrintFonts(form, moduleSettings, typographyVariant);
}

function buildPreviewHtml(previewType, { form, organization, moduleSettings, capabilities, logoDataUrl = null }) {
  if (!form) return "";

  const general = buildPreviewGeneral(form, moduleSettings, previewType);
  const sales = { ...mergeSalesSettings(moduleSettings), ...form };
  const branding = resolveSaleDocumentBranding({
    organization,
    generalSettings: general,
    documentVariant:
      previewType === "invoice" ||
      previewType === "proforma" ||
      previewType === "receipt" ||
      previewType === "credit_note"
        ? previewType
        : null,
  });
  const brandingWithLogo = logoDataUrl
    ? {
        ...branding,
        logoUrl: logoDataUrl,
        display:
          branding.display === "logo" || branding.display === "logo_and_name"
            ? branding.display
            : "logo_and_name",
      }
    : branding;
  const organizationForPrint =
    logoDataUrl && organization
      ? { ...organization, has_logo: true }
      : organization;
  const seller = resolvePreviewSeller(organization);
  const sale = sampleReceiptPreviewSale();

  if (previewType === "receipt") {
    const showBranchOnReceipt = Boolean(sales.show_branch_on_receipt);
    const paymentInstructions = receiptPaymentDetailsToPayload(sales.pos_receipt_payment_details);
    return buildSaleReceiptHtml(sale, {
      seller,
      branch: showBranchOnReceipt ? SAMPLE_PREVIEW_BRANCH : null,
      branding: brandingWithLogo,
      organization: organizationForPrint,
      productDiscountsEnabled: Boolean(sales.allow_discounts),
      orderDiscountEnabled: Boolean(sales.enable_order_discount),
      customerNameEnabled: Boolean(sales.enable_checkout_customer_name),
      showBranchOnReceipt,
      documentFooterText: resolvePrintFooter(general, "receipt"),
      paymentInstructions,
      showPaymentInstructions: shouldShowReceiptPaymentDetails({ sales }, "receipt"),
      generalSettings: general,
      salesSettings: sales,
    });
  }

  if (previewType === "invoice") {
    const showBranchOnReceipt = Boolean(sales.show_branch_on_receipt);
    const paymentInstructions = receiptPaymentDetailsToPayload(
      sales.invoice_payment_details ?? sales.pos_receipt_payment_details,
    );
    return buildSaleInvoiceHtml(sale, {
      seller,
      branch: showBranchOnReceipt ? SAMPLE_PREVIEW_BRANCH : null,
      branding: brandingWithLogo,
      customer: SAMPLE_PREVIEW_CUSTOMER,
      productDiscountsEnabled: Boolean(sales.allow_discounts),
      orderDiscountEnabled: Boolean(sales.enable_order_discount),
      invoiceValidDays: Number(sales.invoice_valid_days ?? 7),
      documentFooterText: resolvePrintFooter(general, "invoice"),
      paymentInstructions,
      showPaymentInstructions: shouldShowReceiptPaymentDetails({ sales }, "invoice"),
      showBranchOnReceipt,
      preparedBy: "preview",
      generalSettings: general,
      salesSettings: sales,
      documentType: "invoice",
    });
  }

  if (previewType === "proforma") {
    const showBranchOnReceipt = Boolean(sales.show_branch_on_receipt);
    const paymentInstructions = receiptPaymentDetailsToPayload(sales.proforma_payment_details);
    return buildSaleInvoiceHtml(sale, {
      seller,
      branch: showBranchOnReceipt ? SAMPLE_PREVIEW_BRANCH : null,
      branding: brandingWithLogo,
      customer: SAMPLE_PREVIEW_CUSTOMER,
      productDiscountsEnabled: Boolean(sales.allow_discounts),
      orderDiscountEnabled: Boolean(sales.enable_order_discount),
      invoiceValidDays: resolveProformaValidDays(sales),
      documentFooterText: resolvePrintFooter(general, "invoice"),
      paymentInstructions,
      showPaymentInstructions: shouldShowReceiptPaymentDetails({ sales }, "proforma"),
      showBranchOnReceipt,
      preparedBy: "preview",
      generalSettings: general,
      salesSettings: sales,
      documentType: "proforma",
    });
  }

  if (previewType === "credit_note") {
    return buildCreditNotePreviewHtml(sampleCreditNotePreviewDocument(), {
      organization: organizationForPrint,
      generalSettings: general,
      salesSettings: sales,
      printedBy: "Preview",
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
      organization: organizationForPrint,
      generalSettings: general,
      printedBy: "Preview",
      printSettings,
      documentFooterText: resolvePrintFooter(general, "lpo"),
      logoDataUrl,
    });
  }

  if (previewType === "picking_list") {
    const salesLayout = !capabilities?.modules?.distribution;
    const sample = samplePickingListPreviewData({ salesLayout });
    return buildPickingListHtml({
      organization: organizationForPrint,
      generalSettings: general,
      pickingList: sample.pickingList,
      trip: sample.trip,
      documentFooterText: resolvePrintFooter(general, "picking_list"),
      printedBy: "Preview",
      includeShelfLocation: !salesLayout,
      layout: salesLayout ? "sales" : "distribution",
      printSettings: loadingSheetPrintPayloadFromForm(form),
    });
  }

  if (previewType === "trip_chart") {
    const sample = sampleTripChartListPreviewData();
    return buildTripChartListHtml({
      organization: organizationForPrint,
      generalSettings: general,
      trip: sample.trip,
      pickingList: sample.pickingList,
      documentFooterText: resolvePrintFooter(general, "trip_chart"),
      printedBy: "Preview",
      printSettings: loadingSheetPrintPayloadFromForm(form),
    });
  }

  if (previewType === "loading_sheet") {
    const loadingSettings = loadingSheetPrintPayloadFromForm(form);
    const sample = sampleLoadingListPreviewData();
    return buildLoadingListHtml({
      organization: organizationForPrint,
      generalSettings: general,
      loadingList: sample.loadingList,
      financialSummary: sample.financialSummary,
      printSettings: loadingSettings,
      documentFooterText: resolvePrintFooter(general, "loading_sheet"),
      footerLines: loadingSettings.loading_sheet_footer_lines
        ? loadingSettings.loading_sheet_footer_lines.split(/\n+/).filter(Boolean)
        : [],
      printedBy: "Preview",
      distributionEnabled: Boolean(capabilities?.modules?.distribution),
      trip: sample.trip,
    });
  }

  if (previewType === "payroll_receipt") {
    const sample = samplePayrollReceiptPreviewData();
    return buildPayrollReceiptDocument({
      receipts: [sample],
      organization: organizationForPrint,
      generalSettings: general,
      single: true,
      documentFooterText: resolvePrintFooter(general, "payroll_receipt"),
    });
  }

  if (previewType === "hospitality_check") {
    const hospitality = {
      ...(moduleSettings?.hospitality ?? {}),
      ...printoutsHospitalityPayloadFromForm(form),
    };
    const useSamePay = hospitality.use_same_payment_details_for_check !== false;
    const paymentInstructions = receiptPaymentDetailsToPayload(
      useSamePay
        ? sales.pos_receipt_payment_details
        : hospitality.check_receipt_payment_details ?? form.check_receipt_payment_details,
    );
    return buildHospitalityCheckReceiptHtml(sampleHospitalityCheckPreviewData(), {
      title: "Paid receipt",
      organization: organizationForPrint,
      seller,
      branding: brandingWithLogo,
      generalSettings: general,
      printSettings: hospitality,
      paymentInstructions,
      showPaymentInstructions: hospitality.show_check_payment_details !== false,
      user: { full_name: "Preview Cashier" },
    });
  }

  return "";
}

export function PrintoutsLivePreview({
  form,
  setForm = null,
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
  const [printing, setPrinting] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const templateField = documentTemplateFieldForPreviewType(previewType);
  const templateValue = templateField ? form?.[templateField] ?? "default" : null;
  const templateMeta = templateValue ? orgDocumentTemplateMeta(templateValue) : null;

  useEffect(() => {
    if (!previewTypes.includes(previewType) && previewTypes.length > 0) {
      setPreviewType(previewTypes[0]);
    }
  }, [previewType, previewTypes]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedForm(form), 280);
    return () => window.clearTimeout(timer);
  }, [form]);

  useEffect(() => {
    let cancelled = false;
    setLogoDataUrl(null);
    void fetchOrganizationLogoDataUrl(organization).then((dataUrl) => {
      if (!cancelled) setLogoDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [organization]);

  const html = useMemo(() => {
    try {
      return buildPreviewHtml(previewType, {
        form: debouncedForm,
        organization,
        moduleSettings,
        capabilities,
        logoDataUrl,
      });
    } catch (previewError) {
      console.error("Printout preview failed", previewError);
      return "";
    }
  }, [capabilities, debouncedForm, logoDataUrl, moduleSettings, organization, previewType]);

  const handlePrintPreview = useCallback(() => {
    if (!html || printing) return;
    setPrinting(true);
    try {
      const documentType =
        previewType === "receipt"
          ? "receipt"
          : previewType === "proforma"
            ? "proforma"
            : "invoice";
      openPrintWindow(html, printWindowFeatures(documentType));
    } finally {
      window.setTimeout(() => setPrinting(false), 600);
    }
  }, [html, previewType, printing]);

  return (
    <div className="sticky top-4 flex h-[calc(100vh-8rem)] min-h-[28rem] flex-col rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-medium text-slate-900">Live preview</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Updates as you edit. Use Print preview to see the real print layout.
        </p>
        {previewOptions.length > 0 ? (
        <div className="mt-3 space-y-2">
          <SearchableSelect
  className={"w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"}
  value={previewType}
  nativeEvent
  onChange={((e) => setPreviewType(e.target.value))}
  options={previewOptions.map((option) => ({ value: option.id, label: option.label }))}
/>
          {templateField && setForm ? (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">
                Document template
              </label>
              <SearchableSelect
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={templateValue}
                nativeEvent
                onChange={(e) => setForm((f) => ({ ...f, [templateField]: e.target.value }))}
                options={ORG_DOCUMENT_DESIGN_TEMPLATES.map((tpl) => ({
                  value: tpl.id,
                  label: tpl.label,
                }))}
              />
              {templateMeta?.description ? (
                <p className="text-[11px] leading-snug text-slate-500">
                  {templateMeta.description}
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            disabled={!html || printing}
            onClick={handlePrintPreview}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {printing ? "Opening print…" : "Print preview"}
          </button>
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
