/** Expected profit margin % = (sell − cost) / sell × 100 */
export function computeProfitMarginPercent(sellPrice, costPrice) {
  const sell = Number(sellPrice);
  const cost = Number(costPrice);
  if (!Number.isFinite(sell) || sell <= 0) return null;
  if (!Number.isFinite(cost) || cost < 0) return null;
  return Math.round(((sell - cost) / sell) * 100);
}

export function formatProfitMarginPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value)}%`;
}
