import { organizationLogoFileUrl } from "@/lib/api";
import { openPrintWindow } from "@/lib/open-print-window";
import {
  buildReportOrgHeaderHtml,
  buildReportWatermarkHtml,
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
import { computeLpoLineTotals, formatLpoAmount, formatPoNumber } from "./lpo-shared";

function formatPrintDate(value) {
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

function lpoDisplayNumber(lpo) {
  const ref = String(lpo?.reference_number ?? "").trim();
  if (ref) return ref;
  return lpo?.po_number ?? formatPoNumber(lpo?.lpo_no);
}

export function sampleLpoPreviewData() {
  return {
    lpo: {
      lpo_no: 71,
      reference_number: "LPO-0071",
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
  const display = value ? escapeHtml(value) : "_________________________";
  return `<p class="sig-line"><span class="sig-label">${escapeHtml(label)}:</span> ${display}</p>`;
}

function buildLpoSignaturesHtml(signatures) {
  return `<div class="signatures">
    ${signatureLine("Prepared By", signatures.preparedBy)}
    ${signatureLine("Checked By", signatures.checkedBy)}
    ${signatureLine("Authorised By", signatures.authorisedBy)}
    ${signatureLine("Terms", signatures.terms)}
  </div>`;
}

/** Build compact A4 LPO HTML with org branding and watermark. */
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
} = {}) {
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
  if (!signatures.preparedBy && printedBy) {
    signatures.preparedBy = String(printedBy);
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

  const printedAt = new Date().toLocaleString("en-GB");
  const byName = printedBy ?? signatures.preparedBy ?? lpo?.created_by_name ?? "—";

  const orgHeaderHtml = branding.showHeader
    ? buildReportOrgHeaderHtml({
        ...branding,
        logoUrl: logoUrl ?? branding.logoUrl,
        organizationName: orgName || branding.organizationName,
      })
    : orgName
      ? `<div class="org-name">${escapeHtml(orgName)}</div>`
      : "";

  const watermarkHtml = buildReportWatermarkHtml(branding);
  const notesHtml = noteLines
    .map((line, index) => `<li><span class="n">${index + 1}.</span>${escapeHtml(line)}</li>`)
    .join("");

  const itemsHtml = lineRows.length
    ? lineRows
        .map(
          (line) =>
            `<tr>
              <td>${escapeHtml(line.product_name)}</td>
              <td class="num">${escapeHtml(line.qty)}</td>
              <td>${escapeHtml(line.pkg)}</td>
              <td class="num">${escapeHtml(line.unitPrice)}</td>
              <td class="num">${escapeHtml(line.vat)}</td>
              <td class="num">${escapeHtml(line.amount)}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="6" style="text-align:center;color:#666;">No line items</td></tr>`;

  const footerLinesHtml = footerLines
    .map((line) => `<p class="footer-line">${escapeHtml(line)}</p>`)
    .join("");
  const signaturesHtml = buildLpoSignaturesHtml(signatures);

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>LPO ${escapeHtml(lpoDisplayNumber(lpo))}</title>
  <style>
    @page { size: A4; margin: 8mm 10mm; }
    body { font-family: "Times New Roman", Times, serif; margin: 0; padding: 12px 16px; font-size: 10px; line-height: 1.3; color: #000; position: relative; }
    .page { max-width: 820px; margin: 0 auto; position: relative; z-index: 1; }
    .watermark { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    .watermark-text { position: absolute; top: 48%; left: 50%; transform: translate(-50%, -50%) rotate(-32deg); font-size: 64px; font-weight: 700; color: rgba(15, 23, 42, 0.06); white-space: nowrap; }
    .watermark-logo { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: 70%; max-height: 70%; opacity: 0.05; object-fit: contain; }
    .org-header { text-align: center; margin-bottom: 6px; }
    .org-logo { display: block; margin: 0 auto 4px; max-height: 56px; max-width: 220px; object-fit: contain; }
    .org-name { font-size: 18px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .org-meta { text-align: center; font-size: 9px; margin-top: 2px; }
    .doc-title { text-align: center; font-size: 13px; font-weight: 700; margin: 8px 0; letter-spacing: 0.06em; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-bottom: 8px; }
    .meta p { margin: 1px 0; }
    .supplier-name { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; }
    .meta-label { font-weight: 700; }
    table.items { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9px; }
    table.items th, table.items td { border-top: 1px dotted #000; border-bottom: 1px dotted #000; padding: 3px 5px; vertical-align: top; }
    table.items th { font-weight: 700; text-align: left; }
    table.items th.num, table.items td.num { text-align: right; white-space: nowrap; }
    .totals { display: flex; justify-content: flex-end; margin: 4px 0 8px; font-size: 10px; }
    .totals-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; margin: 4px 0 8px; align-items: start; }
    .totals-box { font-size: 10px; text-align: right; }
    .signatures { font-size: 9px; }
    .sig-line { margin: 0 0 10px; }
    .sig-label { font-weight: 700; }
    .notes { margin: 6px 0; padding: 0; list-style: none; font-size: 8px; }
    .notes li { margin-bottom: 2px; }
    .notes .n { font-weight: 700; margin-right: 4px; }
    .warn { text-align: center; font-size: 8px; font-weight: 700; text-decoration: underline; text-transform: uppercase; margin: 4px 0 2px; }
    .note-line { text-align: center; font-size: 8px; margin: 2px 0; }
    .footer-line { text-align: center; font-size: 8px; font-weight: 700; margin: 2px 0; }
    .footer { margin-top: 6px; padding-top: 4px; border-top: 1px dotted #999; display: flex; justify-content: space-between; font-size: 8px; color: #333; }
    @media print { body { padding: 0; } .watermark-text { color: rgba(15, 23, 42, 0.08); } }
  </style>
</head>
<body>
  ${watermarkHtml}
  <div class="page">
    <div class="org-header">
      ${orgHeaderHtml}
      <div class="org-meta">
        ${organization?.org_address || buyer.address ? `<div>${escapeHtml(organization?.org_address ?? buyer.address)}</div>` : ""}
        ${organization?.org_email || buyer.email ? `<div>Email: ${escapeHtml(organization?.org_email ?? buyer.email)}</div>` : ""}
        ${orgPhones || buyer.phone ? `<div>Tel: ${escapeHtml(orgPhones || buyer.phone)}</div>` : ""}
        ${orgPin ? `<div>PIN NO: ${escapeHtml(orgPin)}</div>` : ""}
      </div>
    </div>
    <div class="doc-title">LOCAL PURCHASE ORDER</div>
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
      <div>
        <p><span class="meta-label">L.P.O No.:</span> <em>${escapeHtml(lpoDisplayNumber(lpo))}</em></p>
        <p><span class="meta-label">Created On:</span> ${escapeHtml(formatPrintDate(lpo?.order_date))}</p>
        <p><span class="meta-label">Valid Until:</span> ${escapeHtml(formatPrintDate(lpo?.due_date))}</p>
        <p><span class="meta-label">Deliver At:</span> ${escapeHtml(lpo?.delivery_address || "—")}</p>
      </div>
    </div>
    <table class="items">
      <thead>
        <tr>
          <th>Product Name</th>
          <th class="num">Quantity</th>
          <th>Package</th>
          <th class="num">Unit Price</th>
          <th class="num">V.A.T</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="totals-signatures">
      <div class="totals-box">
        <p><strong>Totals:</strong> ${escapeHtml(formatLpoAmount(subtotal))}</p>
        <p><strong>Total V.A.T:</strong> ${escapeHtml(formatLpoAmount(totalVat))}</p>
      </div>
      ${signaturesHtml}
    </div>
    <ol class="notes">${notesHtml}</ol>
    ${footerLinesHtml}
    <p class="warn">${escapeHtml(kebsWarning)}</p>
    <p class="note-line"><strong>Take note:</strong> ${escapeHtml(vatNote)}</p>
    <div class="footer">
      <span>Printed On: ${escapeHtml(printedAt)}</span>
      <span>By: ${escapeHtml(byName)}</span>
    </div>
    ${
      (documentFooterText ?? branding.documentFooterText)
        ? `<p class="note-line">${escapeHtml(documentFooterText ?? branding.documentFooterText)}</p>`
        : ""
    }
  </div>
</body>
</html>`;

  return html;
}

/** Open compact A4 LPO print with org branding and watermark. */
export function printLpoDocument(options) {
  const html = buildLpoPrintHtml(options);
  openPrintWindow(html, "width=860,height=960");
}
