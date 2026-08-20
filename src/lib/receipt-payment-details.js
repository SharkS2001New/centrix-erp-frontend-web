import { stringifyPrintField } from "@/lib/sale-document-print-shared";

/**
 * Route payment instructions apply when the sale or customer is tied to a route
 * that has custom receipt_payment_details (not limited to mobile/POS channels).
 */
export function resolveRouteIdForPaymentDetails({ sale = null, customer = null, route = null } = {}) {
  const fromSale = sale?.route_id;
  if (fromSale != null && fromSale !== "") return Number(fromSale);

  const fromCustomer = customer?.route_id;
  if (fromCustomer != null && fromCustomer !== "") return Number(fromCustomer);

  if (route?.id != null && route?.receipt_payment_details) return Number(route.id);

  return null;
}

export { sampleReceiptPreviewSale } from "@/lib/print-preview-samples";

export const MAX_PAYMENT_DETAIL_BLOCKS = 6;
export const MAX_PAYMENT_LINES_PER_BLOCK = 10;

export const EMPTY_PAYMENT_DETAIL_BLOCK = {
  title: "",
  lines: [{ label: "", value: "" }],
};

export const EMPTY_RECEIPT_PAYMENT_DETAILS = {
  title: "Payment details",
  blocks: [{ ...EMPTY_PAYMENT_DETAIL_BLOCK, lines: [{ label: "", value: "" }] }],
  lines: [{ label: "", value: "" }],
  note: "",
};

export const DEFAULT_POS_RECEIPT_PAYMENT_LINES = [
  { label: "M-Pesa Paybill", value: "" },
  { label: "Account no.", value: "" },
  { label: "Till number", value: "" },
];

function normalizeLine(line) {
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
}

function normalizeLines(rawLines, { keepEmptyLines = false, maxLines = MAX_PAYMENT_LINES_PER_BLOCK } = {}) {
  const source = Array.isArray(rawLines) ? rawLines : [];
  let lines = source.map(normalizeLine);
  if (!keepEmptyLines) {
    lines = lines.filter((line) => line.label || line.value);
  }
  lines = lines.slice(0, maxLines);
  if (!lines.length) {
    lines = [{ label: "", value: "" }];
  }
  return lines;
}

function normalizeBlock(block, options = {}) {
  if (!block || typeof block !== "object") {
    return {
      title: "",
      lines: normalizeLines([], options),
    };
  }
  return {
    title: stringifyPrintField(block.title),
    lines: normalizeLines(block.lines, options),
  };
}

function blocksFromDetails(details, options = {}) {
  if (Array.isArray(details?.blocks) && details.blocks.length > 0) {
    return details.blocks
      .slice(0, MAX_PAYMENT_DETAIL_BLOCKS)
      .map((block) => normalizeBlock(block, options));
  }

  // Legacy single-block shape: { title, lines, note }
  const legacyLines = Array.isArray(details?.lines) ? details.lines : [];
  return [
    normalizeBlock(
      {
        title: "",
        lines: legacyLines,
      },
      options,
    ),
  ];
}

/**
 * @param {object|null|undefined} details
 * @param {{ keepEmptyLines?: boolean }} [options]
 */
export function normalizeReceiptPaymentDetails(details, options = {}) {
  const { keepEmptyLines = false } = options;

  if (!details || typeof details !== "object") {
    return {
      ...EMPTY_RECEIPT_PAYMENT_DETAILS,
      blocks: [{ title: "", lines: [{ label: "", value: "" }] }],
      lines: [{ label: "", value: "" }],
    };
  }

  const blocks = blocksFromDetails(details, { keepEmptyLines });
  const flatLines = blocks.flatMap((block) => block.lines);

  return {
    title: stringifyPrintField(details.title) || "Payment details",
    blocks,
    // Keep top-level lines for older callers / form fields that still read .lines
    lines: flatLines.length ? flatLines : [{ label: "", value: "" }],
    note: stringifyPrintField(details.note),
  };
}

export function receiptPaymentDetailsFromApi(details) {
  return normalizeReceiptPaymentDetails(details ?? EMPTY_RECEIPT_PAYMENT_DETAILS, {
    keepEmptyLines: true,
  });
}

export function receiptPaymentDetailsToPayload(details) {
  const normalized = normalizeReceiptPaymentDetails(details, { keepEmptyLines: false });
  const blocks = normalized.blocks
    .map((block) => ({
      title: block.title,
      lines: block.lines.filter((line) => line.label || line.value),
    }))
    .filter((block) => block.lines.length > 0 || Boolean(block.title));

  if (!blocks.length && !normalized.note.trim()) {
    return null;
  }

  const lines = blocks.flatMap((block) => block.lines);

  return {
    title: normalized.title,
    blocks: blocks.length
      ? blocks
      : [{ title: "", lines: [] }],
    lines,
    note: normalized.note,
  };
}

export function hasReceiptPaymentDetailsContent(details) {
  const payload = receiptPaymentDetailsToPayload(details);
  return Boolean(payload?.lines?.length || payload?.note);
}

/**
 * Resolve printable payment instructions for a sale.
 * @param {object} options
 * @param {object|null} options.moduleSettings
 * @param {object|null} options.route
 * @param {object|null} options.sale
 * @param {object|null} options.customer
 * @param {object|null} options.overrideDetails - admin preview / unsaved form
 * @param {"receipt"|"invoice"|"proforma"} [options.documentType]
 */
export function resolveReceiptPaymentDetails({
  moduleSettings = null,
  route = null,
  sale = null,
  customer = null,
  overrideDetails = null,
  documentType = "receipt",
} = {}) {
  if (overrideDetails) {
    return receiptPaymentDetailsToPayload(overrideDetails);
  }

  const sales = moduleSettings?.sales ?? moduleSettings ?? {};

  // Each document type has its own bank / paybill block.
  if (documentType === "proforma") {
    return receiptPaymentDetailsToPayload(sales.proforma_payment_details);
  }

  const routeId = resolveRouteIdForPaymentDetails({ sale, customer, route });
  const routeMatches =
    routeId != null && (route?.id == null || Number(route.id) === Number(routeId));
  const useRoutePaymentDetails = Boolean(routeMatches && route);

  if (useRoutePaymentDetails && route?.receipt_payment_details) {
    const routeDetails = receiptPaymentDetailsToPayload(route.receipt_payment_details);
    if (routeDetails) return routeDetails;
  }

  if (documentType === "invoice") {
    const rawSales = moduleSettings?.sales ?? {};
    // Prefer dedicated invoice block when saved; otherwise keep legacy POS details.
    if (Object.prototype.hasOwnProperty.call(rawSales, "invoice_payment_details")) {
      return receiptPaymentDetailsToPayload(rawSales.invoice_payment_details);
    }
    return receiptPaymentDetailsToPayload(sales.pos_receipt_payment_details);
  }

  if (useRoutePaymentDetails && sales.use_same_payment_details_for_routes === false) {
    return receiptPaymentDetailsToPayload(sales.route_receipt_payment_details);
  }

  return receiptPaymentDetailsToPayload(sales.pos_receipt_payment_details);
}

export function shouldShowReceiptPaymentDetails(moduleSettings, documentType = "receipt") {
  const sales = moduleSettings?.sales ?? moduleSettings ?? {};
  if (documentType === "proforma") {
    return sales.show_proforma_payment_details !== false;
  }
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

  const blocks =
    Array.isArray(payload.blocks) && payload.blocks.length > 0
      ? payload.blocks
      : [{ title: "", lines: payload.lines ?? [] }];

  const blocksHtml = blocks
    .map((block) => {
      const blockTitle = block.title
        ? `<div class="pay-block-title">${escapeHtml(block.title)}</div>`
        : "";
      const lineRows = (block.lines ?? [])
        .map(
          (line) =>
            `<div class="pay-line"><span class="pay-label">${escapeHtml(line.label)}${
              line.label ? ":" : ""
            }</span> <span class="pay-value">${escapeHtml(line.value || "—")}</span></div>`,
        )
        .join("");
      return `<div class="pay-block">${blockTitle}${lineRows}</div>`;
    })
    .join("");

  const note = payload.note ? `<div class="pay-note">${escapeHtml(payload.note)}</div>` : "";

  if (layout === "a4") {
    return `<div class="pay-instructions">
      <p class="pay-title">${escapeHtml(payload.title || "Payment details")}</p>
      ${blocksHtml}
      ${note}
    </div>`;
  }

  return `<div class="pay-instructions">
    <div class="payment-title">${escapeHtml(payload.title || "Payment details")}</div>
    <div class="pay-lines">${blocksHtml}${note}</div>
  </div>`;
}
