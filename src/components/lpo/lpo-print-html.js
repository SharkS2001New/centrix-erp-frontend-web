import { organizationLogoFileUrl } from "@/lib/api";
import { printHtmlDocument } from "@/lib/print-dispatch";
import { printWindowFeatures } from "@/lib/open-print-window";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import {
  organizationHasLogo,
  resolveReportBranding,
  buildReportWatermarkHtml,
} from "@/lib/reports/report-branding";
import { brandingWithDocumentLogo } from "@/lib/document-logo-settings";
import { resolveDocumentPrintPhonesLine } from "@/lib/document-print-phones";
import {
  resolveLpoDeliveryNotes,
  resolveLpoFooterLines,
  resolveLpoKebsWarning,
  resolveLpoSignatures,
  resolveLpoValidityDays,
  resolveLpoVatNote,
} from "@/lib/lpo-print-settings";
import { computeLpoLineTotals, formatLpoAmount, lpoDisplayNumber } from "./lpo-shared";
import { buildDocumentPrintEdgeFooterHtml } from "@/lib/document-print-edge-footer";
import { documentFooterHtmlFromText } from "@/lib/footer-line-format";
import {
  buildProfessionalHeaderHtml,
  buildProfessionalItemsTableHtml,
  buildProfessionalMetaHtml,
  buildProfessionalSignaturesHtml,
  buildProfessionalTermsHtml,
  escapeProfessionalHtml,
  professionalA4Styles,
} from "@/lib/professional-a4-print";
import { resolveOrgDocumentTemplateId } from "@/lib/document-print-templates";

function formatPrintDate(value) {
  if (!value) return "—";
  const normalized = String(value).trim().replace(" ", "T");
  const d = new Date(normalized.includes("T") ? normalized : `${normalized}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatQty(value) {
  return Number(value ?? 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function sampleLpoPreviewData() {
  return {
    lpo: {
      lpo_no: 71,
      reference_number: "",
      po_number: "LPO-2026-0071",
      supplier_name: "Sample Supplier Ltd",
      supplier_email: "orders@supplier.example",
      supplier_phone: "0712 345 678",
      terms: "30 DAYS",
      order_date: "2026-01-30",
      due_date: "2026-03-01",
      delivery_address: "Main warehouse — Nairobi",
      subtotal: 10000,
      vat_amount: 1600,
      net_amount: 11600,
      created_by_name: "Erick",
    },
    lines: [
      {
        id: 1,
        product_name: "Sample product A",
        packaging_label: "carton",
        ordered_qty: 10,
        cost_price: 800,
      },
      {
        id: 2,
        product_name: "Sample product B",
        packaging_label: "piece",
        ordered_qty: 4,
        cost_price: 500,
      },
    ],
    supplier: {
      supplier_name: "Sample Supplier Ltd",
      address: "P.O. Box 12345, Nairobi",
      email: "orders@supplier.example",
      phone: "0712 345 678",
      tax_pin: "P051234567X",
      town: "Nairobi",
    },
  };
}

function lpoDocumentTitle(variant) {
  return variant === "delivery_note" ? "DELIVERY NOTE" : "LOCAL PURCHASE ORDER";
}

/** Professional A4 LPO / delivery note HTML. */
export function buildLpoPrintHtml({
  lpo,
  lines = [],
  buyer = {},
  organization = null,
  supplier = null,
  printedBy = null,
  printSettings = null,
  generalSettings = null,
  documentFooterText = null,
  variant = "lpo",
  logoDataUrl = null,
} = {}) {
  const isDeliveryNote = variant === "delivery_note";
  const showPricing = !isDeliveryNote;

  const branding = brandingWithDocumentLogo(
    resolveReportBranding({ organization, generalSettings }),
    generalSettings,
    "lpo",
  );
  const orgName = organization?.org_name ?? buyer.name ?? "";
  const orgPhones = resolveDocumentPrintPhonesLine({
    documentType: "lpo",
    organization,
    procurementSettings: printSettings,
  });
  const logoUrl =
    logoDataUrl ||
    (organizationHasLogo(organization) && organization?.id
      ? organizationLogoFileUrl(organization.id, {
          filePath: organization.logo_file_path ?? undefined,
        })
      : branding.logoUrl ?? null);

  const logoLayout = branding.logoLayout ?? {
    show: true,
    position: "right",
    size: "medium",
  };
  const showLogo =
    branding.showHeader !== false &&
    logoLayout.show !== false &&
    (branding.display === "logo" || branding.display === "logo_and_name");
  const showName =
    branding.showHeader !== false &&
    (branding.display === "name" ||
      branding.display === "logo_and_name" ||
      !showLogo);

  const supplierName = lpo?.supplier_name ?? supplier?.supplier_name ?? "Supplier";
  const supplierPoBox = supplier?.address?.trim() || "—";
  const supplierEmail = lpo?.supplier_email ?? supplier?.email ?? "—";
  const supplierPhone = lpo?.supplier_phone ?? supplier?.phone ?? supplier?.alternate_phone ?? "—";
  const supplierPin = supplier?.tax_pin ?? "—";
  const supplierTown = supplier?.town ?? "—";
  const paymentTerms = lpo?.terms?.trim() || "—";
  const deliverAt =
    String(lpo?.delivery_address ?? "").trim() ||
    String(buyer?.address ?? "").trim() ||
    "—";

  const noteLines = resolveLpoDeliveryNotes(lpo, printSettings ?? {});
  const kebsWarning = resolveLpoKebsWarning(printSettings ?? {});
  const vatNote = resolveLpoVatNote(printSettings ?? {});
  const validityDays = resolveLpoValidityDays(lpo, printSettings ?? {});
  const footerLines = resolveLpoFooterLines(printSettings ?? {}, {
    organizationName: orgName,
    validDays: validityDays,
  });
  const signatures = resolveLpoSignatures(lpo, printSettings ?? {});
  const printedByName = resolvePrintedByUser(printedBy) ?? "—";
  if (!signatures.terms && paymentTerms && paymentTerms !== "—") {
    signatures.terms = paymentTerms;
  }
  if (!signatures.preparedBy && printedByName !== "—") {
    signatures.preparedBy = printedByName;
  }
  if (!signatures.preparedBy && lpo?.created_by_name) {
    signatures.preparedBy = String(lpo.created_by_name);
  }

  const subtotal =
    Number(lpo?.subtotal) ||
    Math.max(0, Number(lpo?.net_amount ?? 0) - Number(lpo?.vat_amount ?? 0));
  const totalVat = Number(lpo?.vat_amount ?? 0);
  const orderTotal = Number(lpo?.net_amount ?? subtotal + totalVat);

  const tableRows = (lines ?? []).map((line, index) => {
    const totals = computeLpoLineTotals(line);
    const pkg = (line.packaging_label || line.package_name || line.uom || "—").toLowerCase();
    const row = {
      no: String(index + 1),
      description: line.product_name ?? "—",
      specification: pkg,
      qty: formatQty(line.ordered_qty),
    };
    if (showPricing) {
      row.unit_price = formatLpoAmount(line.cost_price);
      row.vat = formatLpoAmount(totals.vat);
      row.amount = formatLpoAmount(totals.gross);
    }
    return row;
  });

  const columns = showPricing
    ? [
        { key: "no", label: "No.", align: "center", width: "6%" },
        { key: "description", label: "Item Description", width: "28%" },
        { key: "specification", label: "Specification", width: "16%" },
        { key: "qty", label: "Qty.", align: "right", width: "10%" },
        { key: "unit_price", label: "Unit Price", align: "right", width: "12%" },
        { key: "vat", label: "V.A.T", align: "right", width: "12%" },
        { key: "amount", label: "Amount KSh", align: "right", width: "14%" },
      ]
    : [
        { key: "no", label: "No.", align: "center", width: "8%" },
        { key: "description", label: "Item Description", width: "52%" },
        { key: "specification", label: "Specification", width: "22%" },
        { key: "qty", label: "Qty.", align: "right", width: "18%" },
      ];

  const tableHtml = buildProfessionalItemsTableHtml({
    columns,
    rows: tableRows,
    total: showPricing
      ? {
          totalLabel: "TOTAL :",
          totalAmount: formatLpoAmount(orderTotal),
          totalColSpan: columns.length - 1,
        }
      : null,
  });

  const printedAt = new Date();
  const printedOn = printedAt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const docTitle = lpoDocumentTitle(variant);
  const docNoLabel = isDeliveryNote ? "Delivery Note Number" : "LPO Number";
  const termsHtml = buildProfessionalTermsHtml({
    title: "Delivery Instructions",
    lines: noteLines,
  });

  const signaturesHtml = buildProfessionalSignaturesHtml([
    { label: "Prepared By", value: signatures.preparedBy || null },
    { label: "Checked By", value: signatures.checkedBy || null },
    { label: "Authorised By", value: signatures.authorisedBy || null },
  ]);

  const watermarkHtml = buildReportWatermarkHtml({
    ...branding,
    watermarkText: supplierName || branding.organizationName || "",
  });

  const footerLinesHtml = footerLines
    .map((line) => `<p>${escapeProfessionalHtml(line)}</p>`)
    .join("");

  const documentTemplateId = resolveOrgDocumentTemplateId(
    printSettings?.lpo_document_template,
  );

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${escapeProfessionalHtml(docTitle)} ${escapeProfessionalHtml(lpoDisplayNumber(lpo))}</title>
  <style>${professionalA4Styles(generalSettings, "lpo", documentTemplateId)}</style>
</head>
<body class="has-doc-print-edge-footer">
  ${watermarkHtml}
  <div class="page">
    <div class="page-body">
      ${buildProfessionalHeaderHtml({
        companyName: orgName,
        pin: "",
        address: organization?.org_address ?? buyer.address ?? "",
        email: organization?.org_email ?? buyer.email ?? "",
        phones: orgPhones || buyer.phone || "",
        logoUrl,
        showLogo,
        showName: showName || !showLogo,
        logoPosition: logoLayout.position,
        logoSize: logoLayout.size,
      })}

      <div class="doc-title">${escapeProfessionalHtml(docTitle)}</div>

      ${buildProfessionalMetaHtml([
        { label: "Date", value: formatPrintDate(lpo?.order_date ?? lpo?.created_at) },
        { label: "Supplier Name", value: supplierName, emphasize: true },
        { label: "Supplier Address", value: supplierPoBox },
        { label: docNoLabel, value: lpoDisplayNumber(lpo), emphasize: true },
        { label: "Supplier PIN", value: supplierPin },
        { label: "Email", value: supplierEmail },
        { label: "Phone", value: supplierPhone },
        { label: "Town", value: supplierTown },
        { label: "Terms of Payment", value: paymentTerms },
        { label: "Valid Until", value: formatPrintDate(lpo?.due_date) },
        { label: "Deliver At", value: deliverAt },
        ...(lpo?.reference_number
          ? [{ label: "Your Ref", value: lpo.reference_number }]
          : []),
      ])}

      ${tableHtml}

      ${showPricing ? `<p class="vat-note">*${escapeProfessionalHtml(vatNote)}</p>` : ""}

      <div class="closing">
        ${
          showPricing
            ? `<div class="totals">
                <div class="totals-box">
                  <p><strong>Subtotal:</strong> ${escapeProfessionalHtml(formatLpoAmount(subtotal))}</p>
                  <p><strong>Total V.A.T:</strong> ${escapeProfessionalHtml(formatLpoAmount(totalVat))}</p>
                  <p class="grand"><strong>Order Total:</strong> ${escapeProfessionalHtml(formatLpoAmount(orderTotal))}</p>
                </div>
              </div>`
            : ""
        }

        ${termsHtml}
        ${signaturesHtml}

        <div class="footer-notes">
          ${footerLinesHtml}
          <p class="warn">${escapeProfessionalHtml(kebsWarning)}</p>
          ${
            documentFooterText ?? branding.documentFooterText
              ? documentFooterHtmlFromText(documentFooterText ?? branding.documentFooterText, {
                  layout: "block",
                  tag: "p",
                })
              : ""
          }
        </div>
      </div>
    </div>
  </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt: printedOn,
  })}
</body>
</html>`;

  return html;
}

/** Open compact A4 LPO or delivery note print. */
export async function printLpoDocument(options) {
  const html = buildLpoPrintHtml(options);
  if (!html) return { mode: "browser", ok: false, error: "Nothing to print." };
  return printHtmlDocument(html, {
    jobType: options.variant === "delivery_note" ? "delivery_note" : "lpo",
    documentId: options.lpo?.lpo_no ?? options.lpo?.id ?? null,
    windowFeatures: printWindowFeatures("invoice"),
  });
}
