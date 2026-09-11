/**
 * Payments breakdown search: match order totals the way they appear on screen
 * (5,480.00, KES 5480) so the API can compare DECIMAL order_total / amount paid.
 */

const CURRENCY_PREFIX = /^(?:kes|kshs?\.?|sh\.?|usd|\$)\s*/i;
const CURRENCY_SUFFIX = /\s*(?:kes|kshs?\.?|sh\.?|usd|\$)$/i;
const NBSP = /[\u00A0\u202F\u2009]/g;

/** @returns {number|null} */
export function parsePaymentsBreakdownAmountQuery(query) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) return null;

  let stripped = trimmed.replace(NBSP, " ");
  stripped = stripped.replace(CURRENCY_PREFIX, "");
  stripped = stripped.replace(CURRENCY_SUFFIX, "");
  stripped = stripped.trim();
  if (!stripped) return null;
  if (!/^[\d, ]+(?:\.\d{0,2})?$/.test(stripped)) return null;

  const normalized = stripped.replace(/[^\d.]/g, "");
  if (!normalized || normalized === ".") return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;

  return Math.round(amount * 100) / 100;
}

/** Canonical `q` for the payments-breakdown API. */
export function normalizePaymentsBreakdownSearchQuery(query) {
  const q = String(query ?? "").trim();
  if (!q) return "";
  const amount = parsePaymentsBreakdownAmountQuery(q);
  if (amount == null) return q;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
