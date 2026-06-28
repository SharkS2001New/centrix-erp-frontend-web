import QRCode from "qrcode";
import { apiRequest } from "@/lib/api";

/** Normalize KRA fiscal payload from checkout response, sale relation, or credit note. */
export function extractKraReceiptData(sale, kraReceipt = null) {
  const kra = kraReceipt ?? sale?.kra_response ?? sale?.kraResponse ?? null;
  if (!kra) return null;

  const signatureLink = kra.signature_link ?? kra.kra_signature_link ?? null;
  const invoiceNumber =
    kra.invoice_number ?? kra.kra_cu_inv_no ?? kra.kra_invoice_number ?? null;
  const receiptSignature = kra.receipt_signature ?? kra.kra_receipt_signature ?? null;
  const serialNumber = kra.serial_number ?? kra.kra_serial_number ?? null;
  const timestamp = kra.kra_timestamp ?? null;

  if (!signatureLink && !receiptSignature && !invoiceNumber) return null;

  return {
    signatureLink: signatureLink ? String(signatureLink).trim() : null,
    invoiceNumber: invoiceNumber ? String(invoiceNumber) : null,
    receiptSignature: receiptSignature ? String(receiptSignature) : null,
    serialNumber: serialNumber ? String(serialNumber) : null,
    timestamp: timestamp ? String(timestamp) : null,
  };
}

/** Build a data-URL QR image for the KRA ERA verification link. */
export async function kraReceiptQrDataUrl(link, { size = 120 } = {}) {
  const url = String(link ?? "").trim();
  if (!url) return null;
  try {
    return await QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

export function escapeKraHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** KRA fiscal block with optional QR scan area for thermal or A4 documents. */
export function buildKraFiscalBlockHtml(
  kra,
  { layout = "thermal", qrDataUrl = null, title = "KRA FISCAL RECEIPT" } = {},
) {
  if (!kra) return "";

  const isThermal = layout === "thermal";
  const qrSize = isThermal ? 100 : 130;
  const border = isThermal ? "1px dashed #475569" : "1px solid #cbd5e1";

  let html = `<div class="kra-block" style="margin-top:12px;padding-top:10px;border-top:${border};text-align:center;line-height:1.45;">`;
  html += `<div style="font-weight:700;font-size:${isThermal ? "10px" : "11px"};letter-spacing:0.06em;margin-bottom:6px;">${escapeKraHtml(title)}</div>`;

  if (kra.invoiceNumber) {
    html += `<div style="font-size:${isThermal ? "9px" : "10px"};">CU Invoice: ${escapeKraHtml(kra.invoiceNumber)}</div>`;
  }
  if (kra.serialNumber) {
    html += `<div style="font-size:${isThermal ? "9px" : "10px"};">SCU: ${escapeKraHtml(kra.serialNumber)}</div>`;
  }

  if (qrDataUrl && kra.signatureLink) {
    html += `<div style="margin:10px 0 6px;">
      <img src="${qrDataUrl}" alt="KRA verification QR code" width="${qrSize}" height="${qrSize}" style="display:block;margin:0 auto;" />
      <div style="font-size:${isThermal ? "8px" : "9px"};margin-top:4px;color:#475569;">Scan to verify on KRA eTIMS</div>
    </div>`;
  } else if (kra.signatureLink) {
    html += `<div style="font-size:8px;word-break:break-all;margin-top:6px;">${escapeKraHtml(kra.signatureLink)}</div>`;
  }

  if (kra.receiptSignature) {
    html += `<div style="font-size:8px;word-break:break-all;margin-top:6px;">${escapeKraHtml(kra.receiptSignature)}</div>`;
  }
  if (kra.timestamp) {
    html += `<div style="font-size:${isThermal ? "9px" : "10px"};margin-top:4px;">${escapeKraHtml(kra.timestamp)}</div>`;
  }

  html += "</div>";
  return html;
}

/** Centered KRA eTIMS QR for printed sale documents. */
export function buildKraDocumentQrHtml(
  kra,
  qrDataUrl,
  { size = 100, layout = "thermal" } = {},
) {
  if (!kra?.signatureLink || !qrDataUrl) return "";

  const isThermal = layout === "thermal";
  const fontSize = isThermal ? "9px" : "10px";
  const padding = isThermal ? "10px 0" : "12px 0";
  const margin = isThermal ? "10px 0" : "14px 0";
  const border = isThermal ? "1px dashed #64748b" : "1px dashed #999";

  return `<div class="kra-etims-block" style="margin:${margin};padding:${padding};border-top:${border};border-bottom:${border};text-align:center;">
      <img src="${qrDataUrl}" alt="KRA eTIMS verification QR code" width="${size}" height="${size}" style="display:block;margin:0 auto;" />
      <div style="margin-top:8px;font-size:${fontSize};font-family:Arial,Helvetica,sans-serif;color:#334155;line-height:1.45;">
        Scan to verify this invoice on KRA eTIMS platform
      </div>
    </div>`;
}

/** Centered KRA eTIMS QR for thermal receipts (before the thank-you footer). */
export function buildKraThermalQrHtml(kra, qrDataUrl) {
  return buildKraDocumentQrHtml(kra, qrDataUrl, { size: 100, layout: "thermal" });
}

/** Load KRA fiscal data for a sale (checkout relation, embedded payload, or API lookup). */
export async function resolveKraReceiptDataForSale(sale, kraReceipt = null) {
  const inline = extractKraReceiptData(sale, kraReceipt);
  if (inline?.signatureLink) return inline;

  if (!sale?.id) return inline;

  try {
    const res = await apiRequest("/kra-responses", {
      loading: false,
      reportIssues: false,
      searchParams: { per_page: 10, "filter[sale_id]": sale.id },
    });
    const rows = Array.isArray(res?.data) ? res.data : [];
    const withLink =
      rows.find((row) => row.signature_link && String(row.status).toLowerCase() === "success") ??
      rows.find((row) => row.signature_link) ??
      rows[0] ??
      null;
    return extractKraReceiptData(null, withLink) ?? inline;
  } catch {
    return inline;
  }
}
