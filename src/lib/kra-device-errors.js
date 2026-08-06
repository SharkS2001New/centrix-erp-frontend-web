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
