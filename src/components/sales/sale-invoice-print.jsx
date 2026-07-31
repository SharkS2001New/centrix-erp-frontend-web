import { buildKraDocumentQrHtml } from "@/lib/kra-receipt-qr";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import {
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
} from "@/lib/document-print-edge-footer";
import { resolveInvoiceDeliveryTerms } from "@/lib/invoice-print-settings";
import {
  DEFAULT_PROFORMA_BANNER,
  DEFAULT_PROFORMA_VAT_NOTE,
  resolveProformaTerms,
} from "@/lib/proforma-print-settings";
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

/**
 * Professional A4 invoice / proforma — PIN left, logo right, bordered lines,
 * terms & conditions, prepared/confirmed signatures.
 */
export function buildSaleInvoiceHtml(
  sale,
  {
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
    documentType = "invoice",
  } = {},
) {
  if (!sale) return "";

  const isProforma = documentType === "proforma";
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
  const showLogo =
    branding?.showHeader !== false &&
    (branding?.display === "logo" || branding?.display === "logo_and_name");
  const showName =
    branding?.showHeader !== false &&
    (branding?.display === "name" ||
      branding?.display === "logo_and_name" ||
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

  const kraQrHtml = isProforma
    ? ""
    : buildKraDocumentQrHtml(kraData, kraQrDataUrl, { size: 130, layout: "a4" });

  const paymentInstructionsHtml =
    showPaymentInstructions && paymentInstructions
      ? buildReceiptPaymentDetailsHtml(paymentInstructions, { layout: "a4" })
      : "";

  const docTitle = isProforma ? "PROFORMA INVOICE" : "TAX INVOICE";
  const pageTitle = isProforma ? `Proforma ${invoiceNo}` : `Invoice ${invoiceNo}`;
  const numberLabel = isProforma ? "PFI Number" : "Invoice Number";

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

  const termsLines = resolveInvoiceDeliveryTerms(salesSettings ?? {});
  const termsHtml = buildProfessionalTermsHtml({
    title: "Terms and Conditions",
    lines: termsLines,
  });

  const signaturesHtml = buildProfessionalSignaturesHtml([
    { label: "Prepared By", value: servedByName || null },
    { label: "Confirmed By", value: null },
  ]);

  const watermarkHtml = branding
    ? buildReportWatermarkHtml({
        ...branding,
        watermarkText: customerName || branding.organizationName || "",
      })
    : "";

  const amountDueHtml = isProforma
    ? `<p class="grand"><strong>Amount Due:</strong> ${escapeHtml(formatPrintAmount(balanceDue > 0.01 ? balanceDue : orderTotal))}</p>`
    : "";
  const amountPaidHtml =
    isProforma && amountPaid > 0.01
      ? `<p><strong>Amount Paid:</strong> ${escapeHtml(formatPrintAmount(amountPaid))}</p>`
      : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(pageTitle)}</title>
  <style>${professionalA4Styles(generalSettings, "sale_invoice")}</style>
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
        logoUrl: branding?.logoUrl ?? null,
        showLogo,
        showName: showName || !showLogo,
      })}

      <div class="doc-title">${escapeHtml(docTitle)}</div>
      ${
        isProforma
          ? `<div class="doc-banner">This is a proforma invoice for payment purposes — not a tax invoice.</div>`
          : ""
      }

      ${buildProfessionalMetaHtml([
        { label: "Date", value: formatInvoiceDate(createdOn) },
        { label: "Customer Name", value: customerName, emphasize: true },
        {
          label: "Customer Address",
          value: customerAddress || customer?.town || branchName || "—",
        },
        { label: numberLabel, value: invoiceNo, emphasize: true },
        {
          label: "Customer PIN",
          value: customer?.kra_pin || "—",
        },
        {
          label: "Terms of Payment",
          value: customer?.terms_of_payment ?? paymentLine,
        },
        {
          label: "Valid Until",
          value: formatInvoiceDate(validUntil),
        },
      ])}

      ${tableHtml}

      <p class="vat-note">*The above prices are inclusive of VAT</p>

      <div class="closing">
        <div class="totals">
          <div class="totals-box">
            ${totalDiscount > 0.0001 ? `<p><strong>Total Discount:</strong> ${escapeHtml(formatPrintAmount(totalDiscount))}</p>` : ""}
            <p><strong>V.A.T Charged:</strong> ${escapeHtml(formatPrintAmount(totalVat))}</p>
            <p class="grand"><strong>Grand Total:</strong> ${escapeHtml(formatPrintAmount(orderTotal))}</p>
            ${amountPaidHtml}
            ${amountDueHtml}
            <p><strong>Payment:</strong> ${escapeHtml(paymentLine)}</p>
          </div>
        </div>

        ${paymentInstructionsHtml}
        ${termsHtml}
        ${signaturesHtml}

        ${
          kraQrHtml || documentFooterText
            ? `<div class="footer-notes">
                ${kraQrHtml}
                ${documentFooterText ? `<p>${escapeHtml(documentFooterText)}</p>` : ""}
              </div>`
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

  return html;
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
