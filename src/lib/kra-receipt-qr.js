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

/**
 * Comstore sometimes returns the eTIMS QR payload with junk bytes in place of
 * the "20" year prefix (prints as "úb26-10-08 …" and the QR encoder rejects it).
 * Recover the scannable payload, or the https verification URL on its own.
 */
export function sanitizeKraSignatureLink(raw) {
  const text = String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const urlMatch = text.match(/https:\/\/\S+/i);
  const url = urlMatch ? urlMatch[0].replace(/[),.;]+$/, "") : null;

  const full = text.match(
    /(20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?\s+\S+\s+\S+\s+https:\/\/\S+)/i,
  );
  if (full) return full[1].replace(/[),.;]+$/, "");

  const shortYear = text.match(
    /(\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?\s+\S+\s+\S+\s+https:\/\/\S+)/i,
  );
  if (shortYear) return `20${shortYear[1].replace(/[),.;]+$/, "")}`;

  if (url) return url;
  return text;
}

/** True when text is the eTIMS QR payload (date + control unit + verification URL), not a short human signature. */
export function looksLikeEtimsQrPayload(raw) {
  const text = sanitizeKraSignatureLink(raw);
  return Boolean(text && /https:\/\/\S+/i.test(text));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Buyer PIN from a KRA device request payload (sign_structure.pinOfBuyer). */
export function extractBuyerPinFromKraRequest(requestPayload) {
  const payload =
    requestPayload && typeof requestPayload === "object" ? requestPayload : null;
  if (!payload) return null;
  const sign = payload.sign_structure ?? payload.SignStructure ?? null;
  return firstNonEmpty(
    sign?.pinOfBuyer,
    sign?.PinOfBuyer,
    payload.pinOfBuyer,
    payload.PinOfBuyer,
  );
}

/**
 * Resolve the buyer's KRA PIN for receipt print (customer record or fiscal payload).
 */
export function resolveBuyerKraPinForReceipt({ sale = null, customer = null, kraData = null } = {}) {
  return firstNonEmpty(
    customer?.kra_pin,
    sale?.customer?.kra_pin,
    sale?.customer_kra_pin,
    kraData?.buyerPin,
  );
}

/** Normalize KRA fiscal payload from checkout response, sale relation, or credit note. */
export function extractKraReceiptData(sale, kraReceipt = null) {
  const kra = kraReceipt ?? sale?.kra_response ?? sale?.kraResponse ?? null;
  if (!kra) return null;

  const payload =
    kra.response_payload && typeof kra.response_payload === "object"
      ? kra.response_payload
      : null;
  const nestedPayload =
    payload?.data && typeof payload.data === "object"
      ? payload.data
      : payload?.result && typeof payload.result === "object"
        ? payload.result
        : null;
  const requestPayload =
    kra.request_payload && typeof kra.request_payload === "object"
      ? kra.request_payload
      : null;

  const signatureCandidates = [
    kra.signature_link,
    kra.kra_signature_link,
    kra.signatureLink,
    payload?.signature_link,
    payload?.signatureLink,
    payload?.SignatureLink,
    payload?.["Signature Link"],
    payload?.qr_link,
    payload?.qr_url,
    payload?.QRCode,
    payload?.qrCode,
    payload?.qr_code,
    payload?.verification_url,
    payload?.verificationUrl,
    payload?.InvoiceUrl,
    payload?.invoice_url,
    nestedPayload?.signature_link,
    nestedPayload?.signatureLink,
    nestedPayload?.["Signature Link"],
    nestedPayload?.qr_link,
    nestedPayload?.qr_url,
    nestedPayload?.QRCode,
    nestedPayload?.qrCode,
    nestedPayload?.qr_code,
    nestedPayload?.verification_url,
    nestedPayload?.verificationUrl,
    nestedPayload?.InvoiceUrl,
    nestedPayload?.invoice_url,
  ];
  let signatureLink = sanitizeKraSignatureLink(firstNonEmpty(...signatureCandidates));
  const invoiceNumber = firstNonEmpty(
    kra.invoice_number,
    kra.kra_cu_inv_no,
    kra.kra_invoice_number,
    payload?.invoice_number,
    payload?.["cu-inv-no"],
    payload?.cu_inv_no,
  );
  const receiptSignatureRaw = firstNonEmpty(
    kra.receipt_signature,
    kra.kra_receipt_signature,
    payload?.receipt_signature,
    payload?.["Receipt Signature"],
    payload?.signature,
    nestedPayload?.receipt_signature,
    nestedPayload?.["Receipt Signature"],
    nestedPayload?.signature,
  );
  // Comstore often puts the scannable eTIMS string on Receipt Signature and leaves
  // signature_link empty. That string must become the QR, not a line of text.
  if (!looksLikeEtimsQrPayload(signatureLink) && looksLikeEtimsQrPayload(receiptSignatureRaw)) {
    signatureLink = sanitizeKraSignatureLink(receiptSignatureRaw);
  }
  const receiptSignature = looksLikeEtimsQrPayload(receiptSignatureRaw)
    ? null
    : receiptSignatureRaw;
  const serialNumber = firstNonEmpty(
    kra.serial_number,
    kra.kra_serial_number,
    payload?.serial_number,
  );
  const timestamp = firstNonEmpty(kra.kra_timestamp, payload?.timestamp);
  const scuId = firstNonEmpty(kra.scu_id, payload?.scu_id);
  const cuInvNo = firstNonEmpty(
    kra.cu_inv_no,
    kra.kra_cu_inv_no,
    payload?.cu_inv_no,
    payload?.["cu-inv-no"],
  );
  const internalData = firstNonEmpty(kra.internal_data, payload?.internal_data);
  const version = firstNonEmpty(kra.version, payload?.version);
  const buyerPin = extractBuyerPinFromKraRequest(requestPayload);

  if (!signatureLink && !receiptSignature && !invoiceNumber) return null;

  return {
    signatureLink,
    invoiceNumber,
    receiptSignature,
    serialNumber,
    timestamp,
    scuId,
    cuInvNo,
    internalData,
    version,
    buyerPin,
    status: firstNonEmpty(kra.status, payload?.status),
  };
}

function qrMatrixSvg(text, size) {
  let qr = null;
  for (const errorCorrectionLevel of ["M", "L"]) {
    try {
      qr = QRCode.create(text, { errorCorrectionLevel });
      break;
    } catch {
      qr = null;
    }
  }
  if (!qr?.modules) return "";

  const n = qr.modules.size;
  const rects = [];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (qr.modules.get(x, y)) rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  const px = Math.max(72, Number(size) || 100);
  return `<svg class="kra-etims-qr" xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="KRA verification QR code" style="${kraQrImageStyle(px)}"><rect width="${n}" height="${n}" fill="#ffffff"/><g fill="#000000">${rects.join("")}</g></svg>`;
}

/**
 * Inline SVG QR. Print Agent drops data-URL images, which left the verification
 * URL on the receipt as text. SVG paints on thermal receipts and A4 invoices.
 */
export function kraQrSvgMarkup(link, size = 100) {
  const cleaned = sanitizeKraSignatureLink(link);
  if (!cleaned) return "";
  const urlOnly = cleaned.match(/https:\/\/\S+/i)?.[0]?.replace(/[),.;]+$/, "") ?? null;
  const candidates = urlOnly && urlOnly !== cleaned ? [cleaned, urlOnly] : [cleaned];
  for (const value of candidates) {
    const svg = qrMatrixSvg(value, size);
    if (svg) return svg;
  }
  return "";
}

function kraQrGraphic(link, qrDataUrl, size) {
  const svg = kraQrSvgMarkup(link, size);
  if (svg) return svg;
  if (!qrDataUrl) return "";
  const px = Math.max(72, Number(size) || 100);
  return `<img class="kra-etims-qr" src="${qrDataUrl}" alt="KRA verification QR code" width="${px}" height="${px}" style="${kraQrImageStyle(px)}" />`;
}

/** Build a data-URL QR image for the KRA ERA verification link. */
export async function kraReceiptQrDataUrl(link, { size = 120 } = {}) {
  const cleaned = sanitizeKraSignatureLink(link);
  if (!cleaned) return null;
  const urlOnly = cleaned.match(/https:\/\/\S+/i)?.[0] ?? null;
  const candidates = urlOnly && urlOnly !== cleaned ? [cleaned, urlOnly] : [cleaned];
  const width = Math.max(72, Number(size) || 120);
  for (const value of candidates) {
    try {
      return await QRCode.toDataURL(value, {
        width,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
    } catch {
      // Try the bare https link if the full payload cannot be encoded.
    }
  }
  return null;
}

export function escapeKraHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildKraBuyerDetailHtml(
  kra,
  { buyerPin = null, layout = "thermal", includeInvoiceFallback = true } = {},
) {
  const pin = firstNonEmpty(buyerPin, kra?.buyerPin);
  const invoice = firstNonEmpty(kra?.invoiceNumber, kra?.cuInvNo);
  if (!pin && !(includeInvoiceFallback && invoice)) return "";

  const isThermal = layout === "thermal";
  const fontSize = isThermal ? "9px" : "10px";
  if (pin) {
    return `<div class="kra-buyer-pin" style="font-size:${fontSize};font-weight:700;margin-top:4px;line-height:1.35;">Customer KRA PIN: ${escapeKraHtml(pin)}</div>`;
  }
  return `<div class="kra-buyer-detail" style="font-size:${fontSize};font-weight:700;margin-top:4px;line-height:1.35;">CU Invoice: ${escapeKraHtml(invoice)}</div>`;
}

/** KRA fiscal block with optional QR scan area for thermal or A4 documents. */
export function buildKraFiscalBlockHtml(
  kra,
  { layout = "thermal", qrDataUrl = null, title = "KRA FISCAL RECEIPT", buyerPin = null } = {},
) {
  if (!kra) return "";

  const isThermal = layout === "thermal";
  const qrSize = isThermal ? 100 : 130;
  const border = isThermal ? "1px dashed #475569" : "1px solid #cbd5e1";
  // CU invoice is already listed above the QR in this block — only append buyer PIN after QR.
  const buyerDetailHtml = buildKraBuyerDetailHtml(kra, {
    buyerPin,
    layout,
    includeInvoiceFallback: false,
  });

  let html = `<div class="kra-block" style="margin-top:12px;padding-top:10px;border-top:${border};text-align:center;line-height:1.45;">`;
  html += `<div style="font-weight:700;font-size:${isThermal ? "10px" : "11px"};letter-spacing:0.06em;margin-bottom:6px;">${escapeKraHtml(title)}</div>`;

  if (kra.invoiceNumber) {
    html += `<div style="font-size:${isThermal ? "9px" : "10px"};">CU Invoice: ${escapeKraHtml(kra.invoiceNumber)}</div>`;
  }
  if (kra.serialNumber) {
    html += `<div style="font-size:${isThermal ? "9px" : "10px"};">SCU: ${escapeKraHtml(kra.serialNumber)}</div>`;
  }

  const qrGraphic = kra.signatureLink ? kraQrGraphic(kra.signatureLink, qrDataUrl, qrSize) : "";
  if (qrGraphic) {
    html += `<div style="margin:10px 0 6px;">
      ${qrGraphic}
      <div style="font-size:${isThermal ? "9px" : "9px"};margin-top:4px;color:#000;font-weight:700;line-height:1.35;">Scan to verify on KRA eTIMS</div>
      ${buyerDetailHtml}
    </div>`;
  } else {
    html += buyerDetailHtml;
  }

  if (kra.receiptSignature && !looksLikeEtimsQrPayload(kra.receiptSignature)) {
    html += `<div style="font-size:8px;word-break:break-all;margin-top:6px;">${escapeKraHtml(kra.receiptSignature)}</div>`;
  }
  if (kra.timestamp) {
    html += `<div style="font-size:${isThermal ? "9px" : "10px"};margin-top:4px;">${escapeKraHtml(kra.timestamp)}</div>`;
  }

  html += "</div>";
  return html;
}

/**
 * Fixed pixel box for the QR bitmap.
 * wkhtmltopdf (Print Agent) lays out `img { max-width: 100% }` at 0×0, so the
 * code is in the HTML but never paints on receipts or A4 invoices.
 */
function kraQrImageStyle(size) {
  const px = Math.max(72, Number(size) || 100);
  return `display:block;margin:0 auto;width:${px}px;height:${px}px;max-width:none;max-height:none;overflow:visible;`;
}

/** Centered KRA eTIMS QR for printed sale documents. */
export function buildKraDocumentQrHtml(
  kra,
  qrDataUrl,
  { size = 100, layout = "thermal", buyerPin = null } = {},
) {
  if (!kra?.signatureLink) return "";
  const qrGraphic = kraQrGraphic(kra.signatureLink, qrDataUrl, Math.max(72, Number(size) || 100));
  if (!qrGraphic) return "";

  const isThermal = layout === "thermal";
  const fontSize = isThermal ? "9px" : "10px";
  // A4 keeps QR compact so it fits above the fixed print edge footer on page 1.
  const padding = isThermal ? "4px 0" : "6px 0";
  const margin = isThermal ? "4px 0 0" : "8px 0";
  const border = isThermal ? "1px dashed #000" : "1px dashed #999";
  const captionClass = isThermal ? "kra-etims-caption" : "";
  const captionStyle = isThermal
    ? ""
    : `margin-top:4px;font-size:${fontSize};font-family:Arial,Helvetica,sans-serif;color:#334155;line-height:1.3;`;
  const buyerDetailHtml = buildKraBuyerDetailHtml(kra, {
    buyerPin,
    layout,
    includeInvoiceFallback: true,
  });

  return `<div class="kra-etims-block" style="margin:${margin};padding:${padding};border-top:${border};border-bottom:none;text-align:center;page-break-inside:avoid;break-inside:avoid;overflow:visible;box-sizing:border-box;">
      ${qrGraphic}
      <div class="${captionClass}" style="${captionStyle}${isThermal ? "max-width:100%;padding:0 1px;overflow-wrap:anywhere;word-break:break-word;" : ""}">
        Scan to verify this invoice on KRA eTIMS platform
      </div>
      ${buyerDetailHtml}
    </div>`;
}

/** Centered KRA eTIMS QR for thermal receipts. */
export function buildKraThermalQrHtml(kra, qrDataUrl, options = {}) {
  return buildKraDocumentQrHtml(kra, qrDataUrl, { size: 100, layout: "thermal", ...options });
}

function kraRawStatus(sale, kraReceipt = null) {
  const raw = kraReceipt ?? sale?.kra_response ?? sale?.kraResponse ?? null;
  return String(raw?.status ?? "").toLowerCase();
}

/** Failed / skipped fiscalization — print a normal receipt; do not wait on QR. */
export function kraFailedWithoutVerificationLink(sale, kraReceipt = null) {
  const status = kraRawStatus(sale, kraReceipt);
  if (!["failed", "error", "skipped", "bypassed"].includes(status)) return false;
  return !extractKraReceiptData(sale, kraReceipt)?.signatureLink;
}

/**
 * Load KRA fiscal data for a sale (checkout relation, embedded payload, or API lookup).
 *
 * Prefer GET /sales/{id} — cashiers can view their orders and the sale includes kra_response.
 * Do NOT rely on /kra-responses for POS: that list requires admin.kra_responses.view or
 * reports.kra_receipts.view, so till users without those permissions never get a QR when the
 * checkout payload was dropped on refresh.
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
 * Resolve KRA fiscal data + QR image for print (best-effort).
 * When a verification link exists, build the QR. When KRA failed / has no
 * eTIMS link / QR generation fails, print a normal receipt — never throw.
 */
export async function ensureKraQrForPrint(
  sale,
  {
    kraReceipt = null,
    moduleSettings = null,
    capabilities = null,
    allowNetwork = true,
    qrSize = 100,
    /** @deprecated Ignored — missing QR never blocks print. */
    requireQrWhenFiscalized: _requireQrWhenFiscalized = false,
  } = {},
) {
  try {
    // Soft-fail / skip / bypass — print immediately without QR or retries.
    if (kraFailedWithoutVerificationLink(sale, kraReceipt)) {
      return { kraData: null, kraQrDataUrl: null };
    }

    const kraEnabled = isKraDeviceConfigured(moduleSettings, capabilities);

    // KRA off: never contact the API — print from inline sale / kraReceipt only.
    if (!kraEnabled) {
      const kraData = extractKraReceiptData(sale, kraReceipt);
      let kraQrDataUrl = null;
      if (kraData?.signatureLink) {
        for (let attempt = 0; attempt < 3 && !kraQrDataUrl; attempt += 1) {
          kraQrDataUrl = await kraReceiptQrDataUrl(kraData.signatureLink, { size: qrSize });
        }
      }
      return { kraData, kraQrDataUrl };
    }

    const tryFetch =
      isKraFiscalizationActive(moduleSettings, capabilities) &&
      !isKraBypassedForOrderTotal(moduleSettings, sale?.order_total) &&
      String(sale?.status ?? "").toLowerCase() !== "pending_approval";

    let kraData = extractKraReceiptData(sale, kraReceipt);

    if (allowNetwork && sale?.id && !kraData?.signatureLink) {
      const attempts = tryFetch || kraEnabled ? 4 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        kraData = await resolveKraReceiptDataForSale(sale, kraReceipt);
        if (kraData?.signatureLink) break;
        const resolvedStatus = String(kraData?.status ?? "").toLowerCase();
        if (
          ["failed", "error", "skipped", "bypassed"].includes(resolvedStatus) ||
          kraFailedWithoutVerificationLink(sale, kraReceipt)
        ) {
          return { kraData: null, kraQrDataUrl: null };
        }
        if (!(tryFetch || kraEnabled) || attempt >= attempts - 1) break;
        await sleep(300 * (attempt + 1));
      }
    }

    let kraQrDataUrl = null;
    if (kraData?.signatureLink) {
      for (let attempt = 0; attempt < 3 && !kraQrDataUrl; attempt += 1) {
        kraQrDataUrl = await kraReceiptQrDataUrl(kraData.signatureLink, { size: qrSize });
      }
    }

    // Keep fiscal metadata even when the QR bitmap fails so CU invoice / PIN still print.
    if (kraData?.signatureLink || kraData?.invoiceNumber || kraData?.receiptSignature) {
      return { kraData, kraQrDataUrl };
    }

    return { kraData: null, kraQrDataUrl: null };
  } catch {
    return { kraData: null, kraQrDataUrl: null };
  }
}
