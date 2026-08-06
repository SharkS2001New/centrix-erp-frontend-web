import { apiRequest } from "@/lib/api";
import { isKraDeviceConfigured } from "@/lib/finance-settings";

/** Submit KRA registration (returns 202 + task_id when queued). */
export async function submitKraProductRegistration({
  productCodes,
  all = false,
  sync = false,
} = {}) {
  const body = all ? { all: true } : { product_codes: productCodes };
  if (sync) {
    body.sync = true;
  }
  return apiRequest("/kra/register-products", {
    method: "POST",
    body,
  });
}

/** Unique product codes on a cart / sale snapshot. */
export function productCodesFromCartLines(cartOrLines) {
  const lines = Array.isArray(cartOrLines) ? cartOrLines : cartOrLines?.lines ?? [];
  return [
    ...new Set(
      lines
        .map((line) => String(line?.product_code ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Register one or more products on the KRA device when fiscalization is enabled.
 * Uses synchronous API (immediate success/failure).
 */
export async function registerProductsOnKraDevice({
  productCodes,
  moduleSettings,
  capabilities,
} = {}) {
  if (!isKraDeviceConfigured(moduleSettings, capabilities)) {
    return { skipped: true };
  }
  const codes = (productCodes ?? []).map((code) => String(code).trim()).filter(Boolean);
  if (!codes.length) {
    return { skipped: true };
  }
  const result = await submitKraProductRegistration({ productCodes: codes, sync: true });
  return { skipped: false, result };
}
