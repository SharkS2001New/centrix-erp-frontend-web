/**
 * Light Stores POS cash rounding for line / order totals.
 * Integer last digit: 0–1 → 0, 2–6 → 5, 7–9 → next 10.
 * Gated by platform setting `enable_pos_cash_rounding` (external POS only).
 */
export function roundLightStoresAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const asInt = Math.round(n);
  const last = asInt % 10;
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
