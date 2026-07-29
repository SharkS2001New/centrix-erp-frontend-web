import QRCode from "qrcode";
import { apiRequest } from "@/lib/api";
import { isKraDeviceConfigured, isKraBypassedForOrderTotal, isKraFiscalizationActive } from "@/lib/finance-settings";

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Normalize KRA fiscal payload from checkout response, sale relation, or credit note. */
export function extractKraReceiptData(sale, kraReceipt = null) {
  const kra = kraReceipt ?? sale?.kra_response ?? sale?.kraResponse ?? null;
  if (!kra) return null;

  const payload =
    kra.response_payload && typeof kra.response_payload === "object"
      ? kra.response_payload
      : null;

  const signatureLink = firstNonEmpty(
    kra.signature_link,
    kra.kra_signature_link,
    kra.signatureLink,
    payload?.signature_link,
    payload?.signatureLink,
    payload?.["Signature Link"],
    payload?.qr_link,
    payload?.qr_url,
    payload?.verification_url,
  );
  const invoiceNumber = firstNonEmpty(
    kra.invoice_number,
    kra.kra_cu_inv_no,
    kra.kra_invoice_number,
    payload?.invoice_number,
    payload?.["cu-inv-no"],
    payload?.cu_inv_no,
  );
  const receiptSignature = firstNonEmpty(
    kra.receipt_signature,
    kra.kra_receipt_signature,
    payload?.receipt_signature,
    payload?.signature,
    payload?.["Receipt Signature"],
  );
  const serialNumber = firstNonEmpty(
    kra.serial_number,
    kra.kra_serial_number,
    payload?.serial_number,
  );
  const timestamp = firstNonEmpty(kra.kra_timestamp, payload?.timestamp);

  if (!signatureLink && !receiptSignature && !invoiceNumber) return null;

  return {
    signatureLink,
    invoiceNumber,
    receiptSignature,
    serialNumber,
    timestamp,
    status: firstNonEmpty(kra.status, payload?.status),
  };
}

/** Build a data-URL QR image for the KRA ERA verification link. */
export async function kraReceiptQrDataUrl(link, { size = 120 } = {}) {
  const url = String(link ?? "").trim();
  if (!url) return null;
  try {
    return await QRCode.toDataURL(url, {
      width: Math.max(72, Number(size) || 120),
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
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
      <div style="font-size:${isThermal ? "9px" : "9px"};margin-top:4px;color:#000;font-weight:700;line-height:1.35;">Scan to verify on KRA eTIMS</div>
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
  const padding = isThermal ? "4px 0" : "12px 0";
  const margin = isThermal ? "4px 0 0" : "14px 0";
  const border = isThermal ? "1px dashed #000" : "1px dashed #999";
  const captionClass = isThermal ? "kra-etims-caption" : "";
  const captionStyle = isThermal
    ? ""
    : `margin-top:8px;font-size:${fontSize};font-family:Arial,Helvetica,sans-serif;color:#334155;line-height:1.35;`;

  return `<div class="kra-etims-block" style="margin:${margin};padding:${padding};border-top:${border};border-bottom:none;text-align:center;page-break-inside:avoid;max-width:100%;overflow:hidden;box-sizing:border-box;">
      <img src="${qrDataUrl}" alt="KRA eTIMS verification QR code" width="${size}" height="${size}" style="display:block;margin:0 auto;max-width:100%;" />
      <div class="${captionClass}" style="${captionStyle}${isThermal ? "max-width:100%;padding:0 1px;overflow-wrap:anywhere;word-break:break-word;" : ""}">
        Scan to verify this invoice on KRA eTIMS platform
      </div>
    </div>`;
}

/** Centered KRA eTIMS QR for thermal receipts. */
export function buildKraThermalQrHtml(kra, qrDataUrl) {
  return buildKraDocumentQrHtml(kra, qrDataUrl, { size: 100, layout: "thermal" });
}

function saleLooksFiscalized(sale, kraData) {
  if (kraData?.signatureLink || kraData?.invoiceNumber || kraData?.receiptSignature) {
    return true;
  }
  const raw = sale?.kra_response ?? sale?.kraResponse ?? null;
  if (!raw) return false;
  const status = String(raw.status ?? "").toLowerCase();
  return status === "success" || Boolean(raw.id) || Boolean(raw.invoice_number);
}

/**
 * Load KRA fiscal data for a sale (checkout relation, embedded payload, or API lookup).
 *
 * Prefer GET /sales/{id} — cashiers can view their orders and the sale includes kra_response.
 * Do NOT rely on /kra-responses: that list is admin-module gated (admin.view), so non-admin
 * cashiers like till users never get a QR when the checkout payload was dropped on refresh.
 */
export async function resolveKraReceiptDataForSale(sale, kraReceipt = null) {
  const inline = extractKraReceiptData(sale, kraReceipt);
  if (inline?.signatureLink) return inline;

  if (!sale?.id) return inline;

  try {
    const loaded = await apiRequest(`/sales/${sale.id}`, {
      loading: false,
      reportIssues: false,
    });
    const fromSale = extractKraReceiptData(loaded, null);
    if (fromSale?.signatureLink) return fromSale;
    if (fromSale) return fromSale;
  } catch {
    // Fall through to optional admin list lookup.
  }

  // Admin / back-office only — keep as last resort for older environments.
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

/**
 * Resolve KRA fiscal data + QR image for print.
 * When KRA fiscalization is active for the sale, a scannable eTIMS QR is required.
 */
export async function ensureKraQrForPrint(
  sale,
  {
    kraReceipt = null,
    moduleSettings = null,
    capabilities = null,
    allowNetwork = true,
    qrSize = 100,
    requireQrWhenFiscalized = true,
  } = {},
) {
  const kraEnabled = isKraDeviceConfigured(moduleSettings, capabilities);
  const expectQr =
    requireQrWhenFiscalized &&
    isKraFiscalizationActive(moduleSettings, capabilities) &&
    !isKraBypassedForOrderTotal(moduleSettings, sale?.order_total) &&
    String(sale?.status ?? "").toLowerCase() !== "pending_approval";

  let kraData = extractKraReceiptData(sale, kraReceipt);

  if (allowNetwork && sale?.id && !kraData?.signatureLink) {
    const attempts = expectQr || kraEnabled ? 4 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      kraData = await resolveKraReceiptDataForSale(sale, kraReceipt);
      if (kraData?.signatureLink) break;
      if (!(expectQr || kraEnabled) || attempt >= attempts - 1) break;
      await sleep(300 * (attempt + 1));
    }
  }

  let kraQrDataUrl = null;
  if (kraData?.signatureLink) {
    for (let attempt = 0; attempt < 3 && !kraQrDataUrl; attempt += 1) {
      kraQrDataUrl = await kraReceiptQrDataUrl(kraData.signatureLink, { size: qrSize });
    }
  }

  // Any verification link must become a printed QR image.
  if (kraData?.signatureLink && !kraQrDataUrl) {
    throw new Error(
      "KRA is enabled but the eTIMS QR code could not be generated for this receipt. Please reprint.",
    );
  }

  if (expectQr && !kraQrDataUrl) {
    throw new Error(
      kraData?.signatureLink
        ? "KRA is enabled but the eTIMS QR code could not be generated for this receipt. Please reprint."
        : "KRA is enabled but this sale has no eTIMS verification link yet. Please reprint in a moment.",
    );
  }

  // Sale carries fiscal payload (even if default submit is off) — still require QR.
  if (
    requireQrWhenFiscalized &&
    kraEnabled &&
    saleLooksFiscalized(sale, kraData) &&
    !kraQrDataUrl
  ) {
    throw new Error(
      "KRA is enabled but the eTIMS QR code could not be generated for this receipt. Please reprint.",
    );
  }

  return { kraData, kraQrDataUrl };
}
