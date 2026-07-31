import { buildKraDocumentQrHtml } from "@/lib/kra-receipt-qr";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import {
  buildSaleDocumentLineRows,
  buildSaleDocumentOrgHeaderHtml,
  buildSaleDocumentTableHead,
  escapeHtml,
  formatPrintAmount,
  resolveSaleDocumentStoreContact,
  resolveSaleOrderCreatorName,
  saleDocumentDiscountTotals,
  shouldShowPrintDiscountColumn,
} from "@/lib/sale-document-print-shared";
import {
  resolveSaleLinePrintColumns,
  saleLinePrintQtyPackage,
  saleLineProductLabel,
  saleLineUom,
} from "@/lib/sale-line-items";
import { buildReceiptPaymentDetailsHtml } from "@/lib/receipt-payment-details";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import {
  buildSalesDocumentBodyFooterHtml,
  resolveSalesDocumentBodyFooterLines,
  salesDocumentFooterSettings,
} from "@/lib/sales-document-footer";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";
import {
  DEFAULT_PROFORMA_BANNER,
  DEFAULT_PROFORMA_VAT_NOTE,
  resolveProformaTerms,
} from "@/lib/proforma-print-settings";
import {
  brandingWithDocumentLogo,
  DOCUMENT_LOGO_A4_SIZE_PX,
} from "@/lib/document-logo-settings";
import {
  orgDocumentTemplateCss,
  resolveOrgDocumentTemplateId,
} from "@/lib/document-print-templates";
import {
  buildProfessionalHeaderHtml,
  buildProfessionalItemsTableHtml,
  buildProfessionalMetaHtml,
  buildProfessionalSignaturesHtml,
  buildProfessionalTermsHtml,
  professionalA4Styles,
} from "@/lib/professional-a4-print";
import { formatOrderNumber, saleCustomerLabel, salePaymentMethodDisplay } from "@/lib/sales";
import { isLegacySale } from "@/lib/sale-line-items";
import { buildReportWatermarkHtml } from "@/lib/reports/report-branding";

function formatInvoiceDate(value) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatInvoiceDateShort(value) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatProformaDate(value) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function addDays(value, days) {
  if (!value || days == null) return null;
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
}

function metaRow(label, value, { emphasize = false } = {}) {
  const display = value == null || value === "" ? "—" : String(value);
  return `<div class="meta-row">
    <span class="meta-label">${escapeHtml(label)}</span>
    <span class="meta-value${emphasize ? " meta-value-em" : ""}">${escapeHtml(display)}</span>
  </div>`;
}

function lineSpecification(line, uomById, legacyPrint) {
  const { package: packageLabel } = saleLinePrintQtyPackage(line, uomById, { legacyPrint });
  if (packageLabel) return packageLabel;
  const code = line.product_code ?? line.sku ?? "";
  return code ? String(code) : "—";
}

function buildProfessionalSaleRows(
  items,
  { uomById = null, showDiscountColumn = false, legacyPrint = false } = {},
) {
  return (items ?? []).map((line, index) => {
    const uom = legacyPrint ? null : saleLineUom(line, uomById);
    const cols = resolveSaleLinePrintColumns(line, { uom, legacyPrint });
    const { quantity } = saleLinePrintQtyPackage(line, uomById, { legacyPrint });
    const row = {
      no: String(index + 1),
      description: saleLineProductLabel(line),
      specification: lineSpecification(line, uomById, legacyPrint),
      qty: quantity,
      unit_price: formatPrintAmount(cols.unitPrice),
      amount: formatPrintAmount(cols.amount),
    };
    if (showDiscountColumn) {
      row.discount = formatPrintAmount(line.discount_given ?? 0);
    }
    return row;
  });
}

function resolveInvoiceBranding(branding, generalSettings, salesSettings, variant) {
  return brandingWithDocumentLogo(
    branding,
    generalSettings ?? salesSettings,
    variant,
  );
}

/**
 * Classic A4 tax invoice — previous layout, with per-document logo controls.
 */
function buildClassicTaxInvoiceHtml(sale, options) {
  const {
    seller = {},
    customer = null,
    branch = null,
    preparedBy = null,
    printedBy = null,
    invoiceValidDays = 7,
    uomById = null,
    branding = null,
    productDiscountsEnabled = false,
    orderDiscountEnabled = false,
    moduleSettings = null,
    kraData = null,
    kraQrDataUrl = null,
    documentFooterText = "",
    paymentInstructions = null,
    showPaymentInstructions = true,
    showBranchOnReceipt = true,
    generalSettings = null,
    salesSettings = null,
  } = options;

  const printPx = createOrgPrintPx(generalSettings, "sale_invoice");
  const px = printPx.body;
  const hpx = printPx.header;
  const fpx = printPx.footer;
  const font = orgPrintFontFamilyFromSettings(generalSettings, "sale_invoice");

  const items = sale.items ?? [];
  const invoiceNo = formatOrderNumber(sale);
  const createdOn = sale.completed_at ?? sale.created_at;
  const validUntil = addDays(createdOn, invoiceValidDays);
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);
  const payment = salePaymentMethodDisplay(sale);
  const paymentLine = payment.isMixed
    ? `${payment.label} (${payment.methods.join(", ")})`
    : payment.label;
  const customerPhone =
    customer?.phone_number ??
    sale.customer_phone ??
    sale.customer_mobile ??
    customer?.additional_phone ??
    "";
  const { branchName, storeAddress, storePhones } = resolveSaleDocumentStoreContact({
    showBranchOnReceipt,
    branch,
    seller,
  });
  const customerTown = customer?.town ?? (showBranchOnReceipt ? branchName : null) ?? "—";
  const paymentTerms = customer?.terms_of_payment ?? paymentLine;

  const showDiscountColumn = shouldShowPrintDiscountColumn({
    moduleSettings,
    allowDiscounts: productDiscountsEnabled || orderDiscountEnabled,
  });
  const discountTotals = saleDocumentDiscountTotals({
    items,
    sale,
    orderDiscountEnabled,
  });

  const totalVat = Number(sale.total_vat ?? 0);
  const orderTotal = Number(sale.order_total ?? 0);
  const totalDiscount =
    discountTotals.lineDiscountTotal + discountTotals.orderDiscount;

  const sellerName = seller.name ?? branding?.organizationName ?? "Company";
  const effectiveBranding = resolveInvoiceBranding(
    branding,
    generalSettings,
    salesSettings,
    "invoice",
  );
  const logoSize =
    DOCUMENT_LOGO_A4_SIZE_PX[effectiveBranding?.logoLayout?.size ?? "large"] ??
    DOCUMENT_LOGO_A4_SIZE_PX.large;
  const documentTemplateId = resolveOrgDocumentTemplateId(
    salesSettings?.invoice_document_template,
  );

  const itemRows = buildSaleDocumentLineRows(items, {
    uomById,
    showDiscountColumn,
    layout: "a4",
    legacyPrint: isLegacySale(sale),
  });
  const tableHead = buildSaleDocumentTableHead({
    showDiscountColumn,
    layout: "a4",
  });

  const printedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const servedByName = resolveSaleOrderCreatorName(sale, preparedBy);
  const printedByName = resolvePrintedByUser(printedBy) ?? "—";

  const bodyFooterLines = resolveSalesDocumentBodyFooterLines(
    salesDocumentFooterSettings(
      documentFooterText ? { print_footer_a4_invoice: documentFooterText } : {},
      salesSettings ?? {},
      "invoice",
    ),
    "invoice",
    {
      username: servedByName,
      organizationName: sellerName,
      validDays: invoiceValidDays,
    },
  );
  const bodyFooterHtml = buildSalesDocumentBodyFooterHtml(bodyFooterLines, { layout: "a4" });

  const orgHeader = buildSaleDocumentOrgHeaderHtml(effectiveBranding, {
    layout: "a4",
    fallbackName: sellerName,
  });

  const kraQrHtml = buildKraDocumentQrHtml(kraData, kraQrDataUrl, { size: 130, layout: "a4" });

  const paymentInstructionsHtml =
    showPaymentInstructions && paymentInstructions
      ? buildReceiptPaymentDetailsHtml(paymentInstructions, { layout: "a4" })
      : "";

  const metaSheetHtml = [
    metaRow("Invoice No.", invoiceNo, { emphasize: true }),
    metaRow("Customer Name", customerName),
    metaRow("Phone Number", customerPhone),
    metaRow("Date", formatInvoiceDateShort(createdOn)),
    metaRow("K.R.A Pin", customer?.kra_pin ?? seller.tax_pin),
    metaRow("Terms of Payment", paymentTerms),
    metaRow("Location", customerTown),
    metaRow("Valid Until", formatInvoiceDate(validUntil)),
  ].join("");

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(`Invoice Receipt ${invoiceNo}`)}</title>
  <style>
    @page { size: A4; margin: 0; }
    body { font-family: ${font}; margin: 0; padding: 16px; font-size: ${px(12)}; line-height: 1.4; box-sizing: border-box; ${orgPrintInkStyles(generalSettings, "sale_invoice")} }
    .page { max-width: 820px; margin: 0 auto; }
    .page-body { }
    .invoice-header-block { break-inside: avoid; page-break-inside: avoid; }
    .org-brand .org-logo { display: block; margin: 0 auto 8px; max-height: ${logoSize.maxHeight}px; max-width: ${logoSize.maxWidth}px; object-fit: contain; }
    .org-brand .org-name { font-size: ${hpx(24)}; font-weight: var(--print-w-header, 700); letter-spacing: 0.04em; text-transform: uppercase; }
    .brand-name { text-align: center; font-size: ${hpx(24)}; font-weight: var(--print-w-header, 700); letter-spacing: 0.04em; text-transform: uppercase; }
    .brand-meta { margin-top: 6px; font-size: ${hpx(11)}; text-align: center; font-weight: var(--print-w-header, 600); line-height: 1.45; }
    .doc-title { text-align: center; font-size: ${px(15)}; font-weight: 700; margin: 10px 0 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    .meta-sheet { margin-bottom: 12px; font-size: ${px(11)}; }
    .meta-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin: 4px 0; }
    .meta-label { font-weight: 700; text-transform: uppercase; white-space: nowrap; }
    .meta-value { text-align: right; flex: 1; min-width: 0; word-break: break-word; font-weight: 600; }
    .meta-value-em { font-style: italic; font-weight: 700; }
    table.items { width: 100%; border-collapse: collapse; margin: 8px 0 10px; font-size: ${px(11)}; }
    table.items thead { display: table-header-group; }
    table.items th, table.items td { border-top: 1px dotted #000; border-bottom: 1px dotted #000; padding: 5px 6px; vertical-align: top; }
    table.items th { font-weight: 700; text-align: left; text-transform: uppercase; font-size: ${px(10)}; }
    table.items td.num, table.items th.num { text-align: right; white-space: nowrap; }
    table.items tbody tr { break-inside: avoid; page-break-inside: avoid; }
    .invoice-closing { break-inside: avoid; page-break-inside: avoid; margin-top: 4px; }
    .totals { display: flex; justify-content: flex-end; margin: 6px 0 14px; }
    .totals-box { min-width: 280px; text-align: right; font-size: ${px(12)}; font-weight: 600; }
    .totals-box p { margin: 3px 0; }
    .totals-box .grand { font-weight: 700; font-size: ${px(13)}; margin-top: 6px; padding-top: 4px; border-top: 1px solid #000; }
    .served-by { margin: 10px 0 8px; font-size: ${px(11)}; font-weight: 700; text-transform: none; }
    .body-footer-block { margin: 10px 0 8px; font-size: ${px(11)}; }
    .body-footer-line { margin: 6px 0; font-weight: 700; text-transform: none; }
    .goods-note { margin: 8px 0 4px; font-size: ${px(11)}; font-weight: 700; text-transform: none; }
    .goods-note-sub { margin: 0 0 0; font-weight: 700; }
    .receive-signatures { margin: 14px 0 0; font-size: ${px(11)}; max-width: 420px; }
    .sig-row { display: flex; align-items: baseline; gap: 6px; margin: 0 0 10px; }
    .sig-row:last-child { margin-bottom: 0; }
    .sig-label { white-space: nowrap; min-width: 5.5rem; font-weight: 700; }
    .sig-line { flex: 1; border-bottom: 1px dotted #000; min-height: 1.1em; }
    .footer-notes { margin: 0 0 8px; text-align: center; font-size: ${fpx(10)}; font-weight: var(--print-w-footer, 600); }
    .footer-notes p { margin: 4px 0; }
    .pay-instructions { margin: 10px 0 12px; padding: 8px 10px; border: 1px dotted #000; font-size: ${px(11)}; font-weight: 600; }
    .pay-instructions .pay-title { font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
    .pay-instructions .pay-line { display: flex; justify-content: space-between; gap: 12px; margin: 2px 0; }
    .pay-instructions .pay-label { font-weight: 700; }
    .pay-instructions .pay-value { text-align: right; font-weight: 600; }
    .pay-instructions .pay-note { margin-top: 6px; font-size: ${px(10)}; font-weight: 600; }
    .center { text-align: center; }
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "sale_invoice" })}
    ${orgDocumentTemplateCss(documentTemplateId, { layout: "classic" })}
    @media print {
      html, body { height: auto !important; min-height: 0 !important; }
      body { font-size: ${px(12, true)}; padding: 0; }
      .org-brand .org-name, .brand-name { font-size: ${hpx(24, true)}; }
      .brand-meta { font-size: ${hpx(11, true)}; }
      .doc-title { font-size: ${px(15, true)}; }
      .meta-sheet { font-size: ${px(11, true)}; }
      table.items { font-size: ${px(11, true)}; }
      table.items th { font-size: ${px(10, true)}; }
      .totals-box { font-size: ${px(12, true)}; }
      .totals-box .grand { font-size: ${px(13, true)}; }
      .served-by, .goods-note, .receive-signatures { font-size: ${px(11, true)}; }
      .footer-notes { font-size: ${fpx(10, true)}; }
      .pay-instructions { font-size: ${px(11, true)}; }
      .pay-instructions .pay-note { font-size: ${px(10, true)}; }
      .page { max-width: none; margin: 0; }
    }
  </style>
</head>
<body class="has-doc-print-edge-footer">
  <div class="page">
    <div class="page-body">
    <div class="invoice-header-block">
      <div class="brand">
        ${orgHeader}
        <div class="brand-meta">
          ${branchName ? `<div>${escapeHtml(branchName)}</div>` : ""}
          ${storeAddress ? `<div>${escapeHtml(storeAddress)}</div>` : ""}
          ${seller.email ? `<div>Email: ${escapeHtml(seller.email)}</div>` : ""}
          ${storePhones ? `<div>Tel: ${escapeHtml(storePhones)}</div>` : ""}
          ${seller.tax_pin ? `<div>PIN NO: ${escapeHtml(seller.tax_pin)}</div>` : ""}
          ${seller.vat_regno ? `<div>VAT Reg: ${escapeHtml(seller.vat_regno)}</div>` : ""}
        </div>
      </div>

      <div class="doc-title">Invoice Receipt</div>

      <div class="meta-sheet">
        ${metaSheetHtml}
      </div>
    </div>

    <table class="items">
      <thead>${tableHead}</thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="invoice-closing">
      <div class="totals">
        <div class="totals-box">
          <p><strong>Total Amount:</strong> ${escapeHtml(formatPrintAmount(orderTotal))}</p>
          ${totalDiscount > 0.0001 ? `<p><strong>Total Discount:</strong> ${escapeHtml(formatPrintAmount(totalDiscount))}</p>` : ""}
          <p><strong>V.A.T Charged:</strong> ${escapeHtml(formatPrintAmount(totalVat))}</p>
          <p class="grand"><strong>Grand Total:</strong> ${escapeHtml(formatPrintAmount(orderTotal))}</p>
          <p><strong>Payment:</strong> ${escapeHtml(paymentLine)}</p>
        </div>
      </div>

      ${paymentInstructionsHtml}

      ${bodyFooterHtml}

      ${
        kraQrHtml
          ? `<div class="footer-notes">${kraQrHtml}</div>`
          : ""
      }
    </div>
    </div>
  </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt,
  })}
</body>
</html>`;
}

/**
 * Professional proforma — terms & conditions (admin-editable), signatures, logo controls.
 */
function buildProformaInvoiceHtml(sale, options) {
  const {
    seller = {},
    customer = null,
    branch = null,
    preparedBy = null,
    printedBy = null,
    invoiceValidDays = 7,
    uomById = null,
    branding = null,
    productDiscountsEnabled = false,
    orderDiscountEnabled = false,
    moduleSettings = null,
    documentFooterText = "",
    paymentInstructions = null,
    showPaymentInstructions = true,
    showBranchOnReceipt = true,
    generalSettings = null,
    salesSettings = null,
  } = options;

  const items = sale.items ?? [];
  const invoiceNo = formatOrderNumber(sale);
  const createdOn = sale.completed_at ?? sale.created_at;
  const validUntil = addDays(createdOn, invoiceValidDays);
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);
  const payment = salePaymentMethodDisplay(sale);
  const paymentLine = payment.isMixed
    ? `${payment.label} (${payment.methods.join(", ")})`
    : payment.label;
  const customerPhone =
    customer?.phone_number ??
    sale.customer_phone ??
    sale.customer_mobile ??
    customer?.additional_phone ??
    "";
  const { branchName, storeAddress, storePhones } = resolveSaleDocumentStoreContact({
    showBranchOnReceipt,
    branch,
    seller,
  });
  const customerAddress = [
    customer?.town,
    customer?.org_address ?? customer?.address,
    customerPhone ? `Tel: ${customerPhone}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const showDiscountColumn = shouldShowPrintDiscountColumn({
    moduleSettings,
    allowDiscounts: productDiscountsEnabled || orderDiscountEnabled,
  });
  const discountTotals = saleDocumentDiscountTotals({
    items,
    sale,
    orderDiscountEnabled,
  });

  const totalVat = Number(sale.total_vat ?? 0);
  const orderTotal = Number(sale.order_total ?? 0);
  const amountPaid = Number(sale.amount_paid ?? 0);
  const balanceDue = Math.max(0, orderTotal - amountPaid);
  const totalDiscount =
    discountTotals.lineDiscountTotal + discountTotals.orderDiscount;

  const sellerName = seller.name ?? branding?.organizationName ?? "Company";
  const effectiveBranding = resolveInvoiceBranding(
    branding,
    generalSettings,
    salesSettings,
    "proforma",
  );
  const logoLayout = effectiveBranding?.logoLayout ?? {
    show: true,
    position: "right",
    size: "large",
  };
  const showLogo =
    effectiveBranding?.showHeader !== false &&
    logoLayout.show !== false &&
    (effectiveBranding?.display === "logo" || effectiveBranding?.display === "logo_and_name");
  const showName =
    effectiveBranding?.showHeader !== false &&
    (effectiveBranding?.display === "name" ||
      effectiveBranding?.display === "logo_and_name" ||
      !showLogo);

  const servedByName = resolveSaleOrderCreatorName(sale, preparedBy);
  const printedByName = resolvePrintedByUser(printedBy) ?? "—";
  const printedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const paymentInstructionsHtml =
    showPaymentInstructions && paymentInstructions
      ? buildReceiptPaymentDetailsHtml(paymentInstructions, { layout: "a4" })
      : "";

  const bodyFooterLines = resolveSalesDocumentBodyFooterLines(
    salesDocumentFooterSettings(
      documentFooterText ? { print_footer_a4_invoice: documentFooterText } : {},
      salesSettings ?? {},
      "invoice",
    ),
    "invoice",
    {
      username: servedByName,
      organizationName: sellerName,
      validDays: invoiceValidDays,
    },
  );
  const bodyFooterHtml = buildSalesDocumentBodyFooterHtml(bodyFooterLines, { layout: "a4" });

  const columns = [
    { key: "no", label: "No.", align: "center", width: "6%" },
    { key: "description", label: "Item Description", width: "28%" },
    { key: "specification", label: "Specification", width: "24%" },
    { key: "qty", label: "Qty.", align: "right", width: "10%" },
    { key: "unit_price", label: "Unit Price", align: "right", width: "14%" },
    ...(showDiscountColumn
      ? [{ key: "discount", label: "Discount", align: "right", width: "10%" }]
      : []),
    { key: "amount", label: "Amount KSh", align: "right", width: "14%" },
  ];

  const tableHtml = buildProfessionalItemsTableHtml({
    columns,
    rows: buildProfessionalSaleRows(items, {
      uomById,
      showDiscountColumn,
      legacyPrint: isLegacySale(sale),
    }),
    total: {
      totalLabel: "TOTAL :",
      totalAmount: formatPrintAmount(orderTotal),
      totalColSpan: columns.length - 1,
    },
  });

  const showTerms = salesSettings?.show_proforma_terms !== false;
  const termsHtml = showTerms
    ? buildProfessionalTermsHtml({
        title: "Terms and Conditions",
        lines: resolveProformaTerms(salesSettings ?? {}),
      })
    : "";

  const confirmedBy = String(salesSettings?.proforma_confirmed_by ?? "").trim() || null;
  const showSignatures = salesSettings?.show_proforma_signatures !== false;
  const signaturesHtml = showSignatures
    ? buildProfessionalSignaturesHtml([
        { label: "Prepared By", value: servedByName || null },
        { label: "Confirmed By", value: confirmedBy },
      ])
    : "";

  const watermarkHtml = effectiveBranding
    ? buildReportWatermarkHtml({
        ...effectiveBranding,
        watermarkText: customerName || effectiveBranding.organizationName || "",
      })
    : "";

  const showTotalsBreakdown = salesSettings?.show_proforma_totals_breakdown !== false;
  const amountDueHtml = showTotalsBreakdown
    ? `<p class="grand"><strong>Amount Due:</strong> ${escapeHtml(formatPrintAmount(balanceDue > 0.01 ? balanceDue : orderTotal))}</p>`
    : "";
  const amountPaidHtml =
    showTotalsBreakdown && amountPaid > 0.01
      ? `<p><strong>Amount Paid:</strong> ${escapeHtml(formatPrintAmount(amountPaid))}</p>`
      : "";

  const bannerText = String(
    salesSettings?.proforma_banner_text ?? DEFAULT_PROFORMA_BANNER,
  ).trim();
  const showBanner = salesSettings?.show_proforma_banner !== false && bannerText;
  const vatNoteText = String(
    salesSettings?.proforma_vat_note ?? DEFAULT_PROFORMA_VAT_NOTE,
  ).trim();
  const showVatNote =
    salesSettings?.show_proforma_vat_note !== false && Boolean(vatNoteText);

  const metaFields = [
    { label: "Date", value: formatProformaDate(createdOn) },
    { label: "Customer Name", value: customerName, emphasize: true },
    {
      label: "Customer Address",
      value: customerAddress || customer?.town || branchName || "—",
    },
    { label: "PFI Number", value: invoiceNo, emphasize: true },
  ];
  if (salesSettings?.show_proforma_customer_pin !== false) {
    metaFields.push({
      label: "Customer PIN",
      value: customer?.kra_pin || "—",
    });
  }
  if (salesSettings?.show_proforma_payment_terms !== false) {
    metaFields.push({
      label: "Terms of Payment",
      value: customer?.terms_of_payment ?? paymentLine,
    });
  }
  if (salesSettings?.show_proforma_valid_until !== false) {
    metaFields.push({
      label: "Valid Until",
      value: formatProformaDate(validUntil),
    });
  }

  const totalsBoxHtml = showTotalsBreakdown
    ? `<div class="totals-box">
            ${totalDiscount > 0.0001 ? `<p><strong>Total Discount:</strong> ${escapeHtml(formatPrintAmount(totalDiscount))}</p>` : ""}
            <p><strong>V.A.T Charged:</strong> ${escapeHtml(formatPrintAmount(totalVat))}</p>
            <p class="grand"><strong>Grand Total:</strong> ${escapeHtml(formatPrintAmount(orderTotal))}</p>
            ${amountPaidHtml}
            ${amountDueHtml}
            <p><strong>Payment:</strong> ${escapeHtml(paymentLine)}</p>
          </div>`
    : `<div class="totals-box">
            <p class="grand"><strong>Grand Total:</strong> ${escapeHtml(formatPrintAmount(orderTotal))}</p>
          </div>`;

  const documentTemplateId = resolveOrgDocumentTemplateId(
    salesSettings?.proforma_document_template,
  );

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(`Proforma ${invoiceNo}`)}</title>
  <style>${professionalA4Styles(generalSettings, "sale_invoice", documentTemplateId)}</style>
</head>
<body class="has-doc-print-edge-footer">
  ${watermarkHtml}
  <div class="page">
    <div class="page-body">
      ${buildProfessionalHeaderHtml({
        companyName: sellerName,
        pin: seller.tax_pin ?? "",
        address: storeAddress || seller.address || "",
        email: seller.email || "",
        phones: storePhones || "",
        logoUrl: effectiveBranding?.logoUrl ?? branding?.logoUrl ?? null,
        showLogo,
        showName: showName || !showLogo,
        logoPosition: logoLayout.position,
        logoSize: logoLayout.size,
      })}

      <div class="doc-title">PROFORMA INVOICE</div>
      ${showBanner ? `<div class="doc-banner">${escapeHtml(bannerText)}</div>` : ""}

      ${buildProfessionalMetaHtml(metaFields)}

      ${tableHtml}

      ${showVatNote ? `<p class="vat-note">${escapeHtml(vatNoteText)}</p>` : ""}

      <div class="closing">
        <div class="totals">
          ${totalsBoxHtml}
        </div>

        ${paymentInstructionsHtml}
        ${termsHtml}
        ${signaturesHtml}
        ${bodyFooterHtml}
      </div>
    </div>
  </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt,
  })}
</body>
</html>`;
}

/**
 * A4 tax invoice (classic layout) or proforma (professional layout with editable terms).
 */
export function buildSaleInvoiceHtml(sale, options = {}) {
  if (!sale) return "";
  if (options.documentType === "proforma") {
    return buildProformaInvoiceHtml(sale, options);
  }
  return buildClassicTaxInvoiceHtml(sale, options);
}

export function printSaleInvoice(sale, options = {}) {
  const html = buildSaleInvoiceHtml(sale, options);
  if (!html) return;
  if (options.printWindow) {
    fillPrintWindow(options.printWindow, html);
    return;
  }
  openPrintWindow(html, "width=860,height=960");
}
