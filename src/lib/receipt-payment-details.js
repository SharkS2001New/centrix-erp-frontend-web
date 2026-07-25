import { isRouteOrderSale } from "@/lib/sales";
import { stringifyPrintField } from "@/lib/sale-document-print-shared";

export { sampleReceiptPreviewSale } from "@/lib/print-preview-samples";

export const EMPTY_RECEIPT_PAYMENT_DETAILS = {
  title: "Payment details",
  lines: [{ label: "", value: "" }],
  note: "",
};

export const DEFAULT_POS_RECEIPT_PAYMENT_LINES = [
  { label: "M-Pesa Paybill", value: "" },
  { label: "Account no.", value: "" },
  { label: "Till number", value: "" },
];

export function normalizeReceiptPaymentDetails(details) {
  if (!details || typeof details !== "object") {
    return { ...EMPTY_RECEIPT_PAYMENT_DETAILS, lines: [{ label: "", value: "" }] };
  }

  const rawLines = Array.isArray(details.lines) ? details.lines : [];
  const lines = rawLines
    .map((line) => {
      if (typeof line === "string") {
        const text = line.trim();
        if (!text) return { label: "", value: "" };
        const split = text.match(/^([^:]+):\s*(.*)$/);
        if (split) {
          return { label: split[1].trim(), value: split[2].trim() };
        }
        return { label: "", value: text };
      }
      if (Array.isArray(line)) {
        return {
          label: stringifyPrintField(line[0]),
          value: stringifyPrintField(line[1]),
        };
      }
      return {
        label: stringifyPrintField(line?.label),
        value: stringifyPrintField(line?.value),
      };
    })
    .filter((line) => line.label || line.value)
    .slice(0, 12);

  return {
    title: stringifyPrintField(details.title) || "Payment details",
    lines: lines.length ? lines : [{ label: "", value: "" }],
    note: stringifyPrintField(details.note),
  };
}

export function receiptPaymentDetailsFromApi(details) {
  return normalizeReceiptPaymentDetails(details ?? EMPTY_RECEIPT_PAYMENT_DETAILS);
}

export function receiptPaymentDetailsToPayload(details) {
  const normalized = normalizeReceiptPaymentDetails(details);
  const lines = normalized.lines.filter((line) => line.label || line.value);
  if (!lines.length && !normalized.note.trim()) {
    return null;
  }
  return {
    title: normalized.title,
    lines,
    note: normalized.note,
  };
}

export function hasReceiptPaymentDetailsContent(details) {
  const normalized = normalizeReceiptPaymentDetails(details);
  return normalized.lines.some((line) => line.label || line.value) || Boolean(normalized.note);
}

/**
 * Resolve printable payment instructions for a sale.
 * @param {object} options
 * @param {object|null} options.moduleSettings
 * @param {object|null} options.route
 * @param {object|null} options.sale
 * @param {object|null} options.overrideDetails - admin preview / unsaved form
 */
export function resolveReceiptPaymentDetails({
  moduleSettings = null,
  route = null,
  sale = null,
  overrideDetails = null,
} = {}) {
  if (overrideDetails) {
    const payload = receiptPaymentDetailsToPayload(overrideDetails);
    return payload;
  }

  const sales = moduleSettings?.sales ?? moduleSettings ?? {};
  const routeContext = sale ? isRouteOrderSale(sale) || sale.channel === "mobile" : false;

  if (routeContext && route?.receipt_payment_details) {
    const routeDetails = receiptPaymentDetailsToPayload(route.receipt_payment_details);
    if (routeDetails) return routeDetails;
  }

  if (routeContext && sales.use_same_payment_details_for_routes === false) {
    return receiptPaymentDetailsToPayload(sales.route_receipt_payment_details);
  }

  return receiptPaymentDetailsToPayload(sales.pos_receipt_payment_details);
}

export function shouldShowReceiptPaymentDetails(moduleSettings, documentType = "receipt") {
  const sales = moduleSettings?.sales ?? moduleSettings ?? {};
  if (documentType === "invoice") {
    return sales.show_invoice_payment_details !== false;
  }
  return sales.show_receipt_payment_details !== false;
}

export function buildReceiptPaymentDetailsHtml(details, { layout = "thermal" } = {}) {
  const payload = receiptPaymentDetailsToPayload(details);
  if (!payload?.lines?.length && !payload?.note) return "";

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const lineRows = (payload.lines ?? [])
    .map(
      (line) =>
        `<div class="pay-line"><span class="pay-label">${escapeHtml(line.label)}${line.label ? ":" : ""}</span> <span class="pay-value">${escapeHtml(line.value || "—")}</span></div>`,
    )
    .join("");

  const note = payload.note
    ? `<div class="pay-note">${escapeHtml(payload.note)}</div>`
    : "";

  if (layout === "a4") {
    return `<div class="pay-instructions">
      <p class="pay-title">${escapeHtml(payload.title || "Payment details")}</p>
      ${lineRows}
      ${note}
    </div>`;
  }

  return `<div class="pay-instructions">
    <div class="payment-title">${escapeHtml(payload.title || "Payment details")}</div>
    <div class="pay-lines">${lineRows}${note}</div>
  </div>`;
}
