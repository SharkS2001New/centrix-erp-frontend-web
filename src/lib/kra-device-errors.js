/**
 * Turn raw Comstore / KRA middleware errors into cashier-facing copy.
 * Mirrors backend config/kra_device_errors.php for older API builds.
 */
const KRA_DEVICE_OFFLINE_MESSAGE =
  "The KRA fiscal device is not communicating with the system. Check that Comstore is running, the device is powered on and connected, then try again.";

const KRA_DEVICE_TIMEOUT_MESSAGE =
  "The KRA fiscal device stopped responding. Check that the device is powered on, connected to the network, and Comstore is running, then try again.";

const CODE_MESSAGES = {
  518: "The KRA fiscal device timed out. Check the device connection and try again.",
  519: KRA_DEVICE_OFFLINE_MESSAGE,
  520: "The KRA fiscal device closed the connection. Check that the device is online and try again.",
  96: "Could not reach the KRA device. Check that it is powered on and on the same network.",
  90: "The KRA device has no internet connection. Connect the device to the internet and try again.",
  337: "One or more products are not on the KRA device. Upload them to the device, then retry the sale.",
  13: "A product on this sale is not registered on the KRA device. Register it first, then retry.",
  321: "A product tax type on the KRA device does not match this sale. Re-upload the product with the correct VAT, then retry.",
};

const KRA_PRODUCT_NOT_REGISTERED_PATTERNS = [
  /\b337\b/,
  /\b13\b/,
  /not found on the kra device/i,
  /not registered on the kra device/i,
  /no\s+find\s+plu\s+data/i,
  /upload products to the device/i,
  /register the product first/i,
];

/**
 * @param {unknown} raw
 * @returns {string | null} clearer message, or null when unchanged
 */
export function humanizeKraDeviceErrorMessage(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const codeMatch =
    text.match(/\b(\d{3})\s+error\s*code\b/i) ||
    text.match(/\berror\s*code\s*[,:]?\s*(\d{3})\b/i) ||
    text.match(/\(Code\s+(\d+)\)/i) ||
    text.match(/\bCode\s+(\d+)\b/i) ||
    text.match(/\bE(\d{3})\b/i);
  if (codeMatch) {
    const mapped = CODE_MESSAGES[codeMatch[1]];
    if (mapped) return mapped;
  }

  if (/aborted without a reason|signal is aborted|operation was aborted/i.test(text)) {
    return KRA_DEVICE_TIMEOUT_MESSAGE;
  }

  if (/could not reach kra|connection refused|failed to connect|cURL error/i.test(text)) {
    return "Could not connect to the KRA device. Check network connectivity and the device URL in Finance settings.";
  }

  return null;
}

/** True when the KRA device rejected the sale because a PLU/product is missing. */
export function isKraProductNotRegisteredError(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return false;

  const codeMatch =
    text.match(/\b(\d{3})\s+error\s*code\b/i) ||
    text.match(/\berror\s*code\s*[,:]?\s*(\d{3})\b/i) ||
    text.match(/\(Code\s+(\d+)\)/i) ||
    text.match(/\bCode\s+(\d+)\b/i) ||
    text.match(/\bE(\d{3})\b/i);
  if (codeMatch && ["337", "13", "321"].includes(codeMatch[1])) {
    return true;
  }

  return KRA_PRODUCT_NOT_REGISTERED_PATTERNS.some((pattern) => pattern.test(text));
}

function extractKraErrorCode(text) {
  const match =
    String(text ?? "").match(/\b(\d{3})\s+error\s*code\b/i) ||
    String(text ?? "").match(/\berror\s*code\s*[,:]?\s*(\d{3})\b/i) ||
    String(text ?? "").match(/\(Code\s+(\d+)\)/i) ||
    String(text ?? "").match(/\bCode\s+(\d+)\b/i) ||
    String(text ?? "").match(/\bE(\d{3})\b/i);
  return match?.[1] ?? null;
}

/**
 * Actionable fix hint for a failed / skipped KRA row.
 * @param {unknown} rawError
 * @param {{ culpritNames?: string[] }} [options]
 * @returns {string | null}
 */
export function suggestKraFailureFix(rawError, options = {}) {
  const text = String(rawError ?? "").trim();
  if (!text) return null;

  const code = extractKraErrorCode(text);
  const names = (options.culpritNames ?? []).map((n) => String(n ?? "").trim()).filter(Boolean);
  const productLabel =
    names.length === 1
      ? `"${names[0]}"`
      : names.length > 1
        ? `the highlighted products (${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""})`
        : "the affected product";

  if (
    code === "337" ||
    code === "13" ||
    /no\s+find\s+plu\s+data|not found on the kra device|not registered on the kra device/i.test(text)
  ) {
    return `Open Catalog / Pricing & tax → upload ${productLabel} to the KRA device (PLU register), then retry this sale from KRA invoices or Unfiscalized sales.`;
  }

  if (
    code === "321" ||
    code === "341" ||
    /tax rate|tax bracket|vat fields|tax type|tax classification|plu\s+sales\s+sum/i.test(text)
  ) {
    return `Check the VAT / tax type on ${productLabel} in the product catalog so it matches the KRA device PLU, re-upload the product to the device, then retry.`;
  }

  if (code === "353" || /the same name|already registered/i.test(text)) {
    return `Give ${productLabel} a unique product name on the catalog (or update the existing PLU on the device), re-upload, then retry.`;
  }

  if (code === "351" || /insufficient stock|change_qty/i.test(text)) {
    return `Increase stock / change_qty for ${productLabel} when uploading the PLU to the KRA device, then retry.`;
  }

  if (
    code === "519" ||
    code === "518" ||
    code === "520" ||
    code === "96" ||
    code === "90" ||
    /not communicating|timed out|closed the connection|could not reach|no internet|aborted without a reason/i.test(
      text,
    )
  ) {
    return "Confirm Comstore is running and the KRA device is powered on and on the network, then use Retry on this row.";
  }

  if (code === "358" || code === "880" || /pinofbuyer|customer kra pin|buyer pin/i.test(text)) {
    return "Correct the customer KRA PIN on the sale / customer record, then retry fiscalization.";
  }

  if (code === "325" || code === "10" || code === "32" || /pinofshop|shop kra pin|trader/i.test(text)) {
    return "Verify the shop KRA PIN and device serial in Finance settings, then retry.";
  }

  if (code === "313" || /relevantinvoicenumber|original invoice reference/i.test(text)) {
    return "Use the original sale’s CU invoice number when issuing the credit note, then retry.";
  }

  if (code === "314" || code === "12" || code === "994" || /receiptno|duplicate invoice|invoice number/i.test(text)) {
    return "Retry the submission so a fresh receipt reference is assigned. If it still fails, check for a duplicate CU on KRA invoices.";
  }

  if (/amount bypass|skipped|below.*threshold|fiscalization.*disabled|kra.*disabled/i.test(text)) {
    return "This sale was intentionally skipped for KRA. Adjust the amount-bypass / KRA settings in Finance if it should be fiscalized, then retry.";
  }

  return "Fix the issue described above (product setup or device), then use Retry on KRA invoices or Unfiscalized sales.";
}

/**
 * Cashier-facing reason that names the exact sale line(s) when KRA rejects a missing PLU.
 * @param {unknown} rawError
 * @param {{ lines?: Array<{ name?: string, barcode?: string | null }>, culpritIndexes?: number[], suspectsAll?: boolean }} [context]
 * @returns {string}
 */
export function formatKraFailureReasonWithItems(rawError, context = {}) {
  const raw = String(rawError ?? "").trim();
  const lines = Array.isArray(context.lines) ? context.lines : [];
  const indexes = Array.isArray(context.culpritIndexes) ? context.culpritIndexes : [];
  const suspectsAll = Boolean(context.suspectsAll);

  const base =
    humanizeKraDeviceErrorMessage(raw) ||
    raw ||
    "No failure reason was recorded for this KRA submission.";

  if (!isKraProductNotRegisteredError(raw || base) || lines.length === 0) {
    return base;
  }

  // Only rename the reason when we identified specific SKU-matched culprits.
  if (indexes.length === 0 || suspectsAll) {
    return base;
  }

  const labels = indexes
    .map((i) => lines[i])
    .filter(Boolean)
    .map((line) => {
      const name = String(line.name ?? "Item").trim() || "Item";
      const code = String(line.productCode ?? line.barcode ?? "").trim();
      return code ? `${name} (${code})` : name;
    });

  if (labels.length === 0) return base;

  if (labels.length === 1) {
    return `Product not found on the KRA device: ${labels[0]}. Upload it to the device, then retry.`;
  }

  return `These products were not found on the KRA device:\n• ${labels.join("\n• ")}`;
}

/** First N words of a reason for compact table cells. */
export function snippetKraErrorReason(raw, wordCount = 4) {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  const words = text.split(" ");
  if (words.length <= wordCount) return text;
  return `${words.slice(0, wordCount).join(" ")}…`;
}
