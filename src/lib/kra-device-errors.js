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
};

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
