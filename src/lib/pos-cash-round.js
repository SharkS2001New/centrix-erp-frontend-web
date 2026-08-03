/**
 * Light Stores POS cash rounding for line / order totals.
 *
 * Legacy (C#) behaviour:
 * - Take the last digit from the amount string (for 105.4 that digit is 4)
 * - Apply it against the truncated integer part (105)
 * - 0–1 → round down to *0, 2–6 → *5, 7–9 → next *0
 *   so 105.4 → 105 - 4 + 5 = 106
 *
 * Gated by platform setting `enable_pos_cash_rounding` (external POS + Create order).
 */
export function roundLightStoresAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;

  const asInt = Math.trunc(n);
  const fraction = Math.abs(n - asInt);
  // Prefer first decimal digit when present (matches "105.4" → last char 4).
  // Whole amounts use the ones digit (matches "107" → 7 → 110).
  const last =
    fraction > 1e-9
      ? Math.trunc(Math.abs(n) * 10 + 1e-9) % 10
      : Math.abs(asInt) % 10;

  if (last < 2) return asInt - last;
  if (last < 7) return asInt - last + 5;
  return asInt - last + 10;
}

/** Apply Light Stores rounding when enabled; otherwise cent rounding. */
export function finalizePosLineAmount(value, { cashRound = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (cashRound) return roundLightStoresAmount(n);
  return Math.round(n * 100) / 100;
}

/** Cashier-facing unit price — same Light Stores rules as line amount when enabled. */
export function finalizePosDisplayUnitPrice(value, { cashRound = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (cashRound) return roundLightStoresAmount(n);
  return Math.round(n * 100) / 100;
}

/** Per-line cash round (first pass). */
export function posCashLineAmount(value) {
  return roundLightStoresAmount(value);
}

/**
 * Light Stores order total: round each line, sum, then round the sum again
 * (matches POS footer Total / amount due).
 */
export function posCashOrderTotal(lineAmounts) {
  const amounts = (lineAmounts ?? []).map((a) => Number(a ?? 0));
  if (amounts.length === 0) return 0;
  const sum = amounts.reduce((total, amount) => total + roundLightStoresAmount(amount), 0);
  return roundLightStoresAmount(sum);
}

/**
 * Cart grid Amount column — single-line orders with no order discount show the same figure as the footer Total.
 */
export function posDisplayCartLineAmount(
  rawAmount,
  allLineAmounts,
  { cashRound = false, orderDiscount = 0 } = {},
) {
  const n = Number(rawAmount ?? 0);
  if (!cashRound) return n;
  const all = allLineAmounts ?? [rawAmount];
  if (all.length === 1 && orderDiscount === 0) {
    return posCashOrderTotal(all);
  }
  return roundLightStoresAmount(n);
}
