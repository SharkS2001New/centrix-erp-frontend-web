import { organizationLogoFileUrl } from "@/lib/api";
import { openPrintWindow, printWindowFeatures } from "@/lib/open-print-window";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import {
  buildReportOrgHeaderHtml,
  organizationHasLogo,
  resolveReportBranding,
} from "@/lib/reports/report-branding";
import {
  resolveLpoDeliveryNotes,
  resolveLpoFooterLines,
  resolveLpoKebsWarning,
  resolveLpoSignatures,
  resolveLpoValidityDays,
  resolveLpoVatNote,
} from "@/lib/lpo-print-settings";
import { computeLpoLineTotals, formatLpoAmount, lpoDisplayNumber } from "./lpo-shared";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import { documentFooterHtmlFromText } from "@/lib/footer-line-format";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";

function formatPrintDate(value) {
  if (!value) return "—";
  const normalized = String(value).trim().replace(" ", "T");
  const d = new Date(normalized.includes("T") ? normalized : `${normalized}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function signatureLine(label, value) {
  const lineContent = value ? escapeHtml(value) : "&nbsp;";
  return `<p><span class="sig-label">${escapeHtml(label)}:</span> <span class="sig-line">${lineContent}</span></p>`;
}

function buildLpoSignaturesHtml(signatures) {
  return `<div class="signatures">
    ${signatureLine("Prepared By", signatures.preparedBy)}
    ${signatureLine("Checked By", signatures.checkedBy)}
    ${signatureLine("Authorised By", signatures.authorisedBy)}
    ${signatureLine("Terms", signatures.terms)}
  </div>`;
}

function lpoDocumentTitle(variant) {
  return variant === "delivery_note" ? "DELIVERY NOTE" : "LOCAL PURCHASE ORDER";
}

function lpoPrintStyles(generalSettings = null) {
  const printPx = createOrgPrintPx(generalSettings, "lpo");
  const px = printPx.body;
  const hpx = printPx.header;
  const fpx = printPx.footer;
  const font = orgPrintFontFamilyFromSettings(generalSettings, "lpo");
  return `
    @page { size: A4; margin: 0; }
    html { height: 100%; }
    body {
      font-family: ${font};
      margin: 0;
      padding: 16px;
      font-size: ${px(11)};
      line-height: 1.35;
      color: #000;
      min-height: 100%;
      box-sizing: border-box;
      ${orgPrintInkStyles(generalSettings, "lpo")}
    }
    .page {
      max-width: 820px;
      margin: 0 auto;
    }
    .page-body { }
    .org-header { text-align: center; margin-bottom: 8px; }
    .org-logo { display: block; margin: 0 auto 8px; max-height: 72px; max-width: 280px; object-fit: contain; }
    .org-name { font-size: ${hpx(22)}; font-weight: var(--print-w-header, 700); letter-spacing: 0.04em; text-transform: uppercase; }
    .org-meta { text-align: center; font-size: ${hpx(10)}; margin-top: 4px; line-height: 1.45; font-weight: var(--print-w-header, 600); }
    .doc-title { text-align: center; font-size: ${px(14)}; font-weight: 700; margin: 10px 0 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 12px; font-size: ${px(10)}; }
    .meta p { margin: 2px 0; }
    .meta-right { text-align: right; }
    .supplier-name { font-size: ${px(11)}; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
    .meta-label { font-weight: 700; }
    table.items { width: 100%; border-collapse: collapse; margin: 8px 0 10px; font-size: ${px(10)}; }
    table.items th, table.items td { border-top: 1px dotted #000; border-bottom: 1px dotted #000; padding: 5px 6px; vertical-align: top; }
    table.items th { font-weight: 700; text-align: left; text-transform: uppercase; font-size: ${px(9)}; }
    table.items th.num, table.items td.num { text-align: right; white-space: nowrap; }
    .table-totals { display: flex; justify-content: flex-end; margin: 0 0 12px; font-size: ${px(10)}; }
    .table-totals-box { min-width: 220px; text-align: right; }
    .table-totals-box p { margin: 2px 0; }
    .bottom-grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 20px; margin-top: 8px; align-items: start; }
    .instructions-title { font-weight: 700; text-transform: uppercase; font-size: ${px(9)}; margin: 0 0 4px; }
    .notes { margin: 0; padding: 0; list-style: none; font-size: ${px(9)}; }
    .notes li { margin-bottom: 3px; }
    .notes .n { font-weight: 700; margin-right: 4px; }
    .signatures { font-size: ${px(10)}; text-align: right; }
    .signatures p { margin: 0 0 16px; }
    .sig-label { font-weight: 700; }
    .sig-line { display: inline-block; min-width: 140px; border-bottom: 1px dotted #000; padding-bottom: 2px; }
    .footer-notes { margin-top: 12px; text-align: center; font-size: ${px(9)}; }
    .footer-notes p { margin: 4px 0; }
    .footer-line { font-weight: 700; }
    .warn { font-weight: 700; text-decoration: underline; text-transform: uppercase; }
    .note-line { margin-top: 4px; }
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "lpo" })}
    @media print {
      body { font-size: ${px(11, true)}; }
      .org-name { font-size: ${hpx(22, true)}; }
      .org-meta { font-size: ${hpx(10, true)}; }
      .doc-title { font-size: ${px(14, true)}; }
      .meta { font-size: ${px(10, true)}; }
      table.items { font-size: ${px(10, true)}; }
      table.items th { font-size: ${px(9, true)}; }
      .table-totals { font-size: ${px(10, true)}; }
      .instructions-title, .notes { font-size: ${px(9, true)}; }
      .signatures { font-size: ${px(10, true)}; }
      .footer-notes { font-size: ${px(9, true)}; }
    }
  `;
}

/** Build Omega-style A4 LPO or delivery note HTML. */
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
} = {}) {
  const isDeliveryNote = variant === "delivery_note";
  const showPricing = !isDeliveryNote;

  const branding = resolveReportBranding({ organization, generalSettings });
  const orgName = organization?.org_name ?? buyer.name ?? "";
  const orgPhones = [organization?.primary_tel, organization?.secondary_tel]
    .filter(Boolean)
    .join(" / ");
  const orgPin = organization?.org_pin ?? buyer.tax_pin ?? "";
  const logoUrl =
    organizationHasLogo(organization) && organization?.id
      ? organizationLogoFileUrl(organization.id, {
          filePath: organization.logo_file_path ?? undefined,
        })
      : null;

  const supplierName = lpo?.supplier_name ?? supplier?.supplier_name ?? "Supplier";
  const supplierPoBox = supplier?.address?.trim() || "—";
  const supplierEmail = lpo?.supplier_email ?? supplier?.email ?? "—";
  const supplierPhone = lpo?.supplier_phone ?? supplier?.phone ?? supplier?.alternate_phone ?? "—";
  const supplierPin = supplier?.tax_pin ?? "—";
  const supplierTown = supplier?.town ?? "—";
  const paymentTerms = lpo?.terms?.trim() || "—";

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

  const lineRows = (lines ?? []).map((line) => {
    const totals = computeLpoLineTotals(line);
    const pkg = (line.packaging_label || line.package_name || line.uom || "—").toLowerCase();
    return {
      key: line.id ?? `${line.product_code}-${line.ordered_qty}`,
      product_name: line.product_name ?? "—",
      qty: formatQty(line.ordered_qty),
      pkg,
      unitPrice: formatLpoAmount(line.cost_price),
      vat: formatLpoAmount(totals.vat),
      amount: formatLpoAmount(totals.net),
    };
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

  const orgHeaderHtml = branding.showHeader
    ? buildReportOrgHeaderHtml({
        ...branding,
        logoUrl: logoUrl ?? branding.logoUrl,
        organizationName: orgName || branding.organizationName,
      })
    : orgName
      ? `<div class="org-name">${escapeHtml(orgName)}</div>`
      : "";

  const notesHtml = noteLines
    .map((line, index) => `<li><span class="n">${index + 1}.</span>${escapeHtml(line)}</li>`)
    .join("");

  const colSpan = showPricing ? 6 : 3;
  const itemsHtml = lineRows.length
    ? lineRows
        .map((line) =>
          showPricing
            ? `<tr>
              <td>${escapeHtml(line.product_name)}</td>
              <td class="num">${escapeHtml(line.qty)}</td>
              <td class="num">${escapeHtml(line.pkg)}</td>
              <td class="num">${escapeHtml(line.unitPrice)}</td>
              <td class="num">${escapeHtml(line.vat)}</td>
              <td class="num">${escapeHtml(line.amount)}</td>
            </tr>`
            : `<tr>
              <td>${escapeHtml(line.product_name)}</td>
              <td class="num">${escapeHtml(line.qty)}</td>
              <td class="num">${escapeHtml(line.pkg)}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="${colSpan}" style="text-align:center;color:#666;">No line items</td></tr>`;

  const tableHeadHtml = showPricing
    ? `<tr>
          <th>Product Name</th>
          <th class="num">Quantity</th>
          <th class="num">Package</th>
          <th class="num">Unit Price</th>
          <th class="num">V.A.T</th>
          <th class="num">Amount</th>
        </tr>`
    : `<tr>
          <th>Product Name</th>
          <th class="num">Quantity</th>
          <th class="num">Package</th>
        </tr>`;

  const totalsHtml = showPricing
    ? `<div class="table-totals">
        <div class="table-totals-box">
          <p><strong>Subtotal:</strong> ${escapeHtml(formatLpoAmount(subtotal))}</p>
          <p><strong>Total V.A.T:</strong> ${escapeHtml(formatLpoAmount(totalVat))}</p>
          <p><strong>Order total:</strong> ${escapeHtml(formatLpoAmount(Number(lpo?.net_amount ?? subtotal + totalVat)))}</p>
        </div>
      </div>`
    : "";

  const footerLinesHtml = footerLines
    .map((line) => `<p class="footer-line">${escapeHtml(line)}</p>`)
    .join("");
  const signaturesHtml = buildLpoSignaturesHtml(signatures);
  const docTitle = lpoDocumentTitle(variant);
  const docNoLabel = isDeliveryNote ? "Delivery Note No.:" : "L.P.O No.:";

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(docTitle)} ${escapeHtml(lpoDisplayNumber(lpo))}</title>
  <style>${lpoPrintStyles(generalSettings)}</style>
</head>
<body class="has-doc-print-edge-footer">
  <div class="page">
    <div class="page-body">
    <div class="org-header">
      ${orgHeaderHtml}
      <div class="org-meta">
        ${organization?.org_address || buyer.address ? `<div>${escapeHtml(organization?.org_address ?? buyer.address)}</div>` : ""}
        ${organization?.org_email || buyer.email ? `<div>Email: ${escapeHtml(organization?.org_email ?? buyer.email)}</div>` : ""}
        ${orgPhones || buyer.phone ? `<div>Tel: ${escapeHtml(orgPhones || buyer.phone)}</div>` : ""}
        ${orgPin ? `<div>PIN NO: ${escapeHtml(orgPin)}</div>` : ""}
      </div>
    </div>

    <div class="doc-title">${escapeHtml(docTitle)}</div>

    <div class="meta">
      <div>
        <div class="supplier-name">${escapeHtml(supplierName)}</div>
        <p><span class="meta-label">P.O Box:</span> ${escapeHtml(supplierPoBox)}</p>
        <p><span class="meta-label">Email Address:</span> ${escapeHtml(supplierEmail)}</p>
        <p><span class="meta-label">Phone:</span> ${escapeHtml(supplierPhone)}</p>
        <p><span class="meta-label">K.R.A Pin:</span> ${escapeHtml(supplierPin)}</p>
        <p><span class="meta-label">Town:</span> ${escapeHtml(supplierTown)}</p>
        <p><span class="meta-label">Terms of Payment:</span> ${escapeHtml(paymentTerms)}</p>
      </div>
      <div class="meta-right">
        <p><span class="meta-label">${escapeHtml(docNoLabel)}</span> <em>${escapeHtml(lpoDisplayNumber(lpo))}</em></p>
        <p><span class="meta-label">Created On:</span> ${escapeHtml(formatPrintDate(lpo?.order_date ?? lpo?.created_at))}</p>
        ${lpo?.created_by_name ? `<p><span class="meta-label">Created By:</span> ${escapeHtml(lpo.created_by_name)}</p>` : ""}
        <p><span class="meta-label">Valid Until:</span> ${escapeHtml(formatPrintDate(lpo?.due_date))}</p>
        <p><span class="meta-label">Deliver At:</span> ${escapeHtml(lpo?.delivery_address || "—")}</p>
        ${lpo?.reference_number ? `<p><span class="meta-label">Your Ref:</span> ${escapeHtml(lpo.reference_number)}</p>` : ""}
      </div>
    </div>

    <table class="items">
      <thead>${tableHeadHtml}</thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    ${totalsHtml}

    <div class="bottom-grid">
      <div>
        <p class="instructions-title">Delivery Instructions:</p>
        <ol class="notes">${notesHtml}</ol>
      </div>
      ${signaturesHtml}
    </div>

    <div class="footer-notes">
      ${footerLinesHtml}
      <p class="warn">${escapeHtml(kebsWarning)}</p>
      <p class="note-line"><strong>Take note:</strong> ${escapeHtml(vatNote)}</p>
      ${
        (documentFooterText ?? branding.documentFooterText)
          ? documentFooterHtmlFromText(documentFooterText ?? branding.documentFooterText, {
              layout: "block",
              tag: "p",
            })
          : ""
      }
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
export function printLpoDocument(options) {
  const html = buildLpoPrintHtml(options);
  openPrintWindow(html, printWindowFeatures("invoice"));
}
