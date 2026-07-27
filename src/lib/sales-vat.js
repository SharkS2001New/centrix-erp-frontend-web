/** VAT helpers — mirrors backend SalesVatCalculator (Kenya inclusive pricing). */

export function vatRateFromProduct(product) {
  const vat = product?.vat ?? null;
  if (vat && vat.vat_percentage != null) {
    return Math.max(0, Number(vat.vat_percentage));
  }
  if (product?.vat_rate != null) {
    return Math.max(0, Number(product.vat_rate));
  }
  if (product?.vat_percentage != null) {
    return Math.max(0, Number(product.vat_percentage));
  }
  return 0;
}

/** Extract VAT portion from a VAT-inclusive gross line amount. */
export function vatFromInclusiveGross(gross, vatRate) {
  const amount = Number(gross ?? 0);
  const rate = Number(vatRate ?? 0);
  if (amount <= 0 || rate <= 0) return 0;
  const net = amount / (1 + rate / 100);
  return Math.round(Math.max(0, amount - net) * 100) / 100;
}

export function lineProductVat(product, lineAmountAfterDiscount) {
  return vatFromInclusiveGross(lineAmountAfterDiscount, vatRateFromProduct(product));
}

function resolveLineVatRate(line) {
  const explicit = Number(
    line?.vat_rate ??
      line?.tax_rate ??
      line?.product?.vat?.vat_percentage ??
      line?.product?.vat_rate ??
      line?.product?.vat_percentage,
  );
  if (Number.isFinite(explicit) && explicit >= 0) {
    return Math.round(explicit * 100) / 100;
  }

  const amount = Number(line?.amount ?? line?.line_total ?? 0);
  const vat = Number(line?.product_vat ?? line?.vat_amount ?? 0);
  if (vat > 0.0001 && amount > vat) {
    return Math.round((vat / (amount - vat)) * 10000) / 100;
  }
  return 0;
}

function resolveLineVatAmount(line, rate) {
  const stored = Number(line?.product_vat ?? line?.vat_amount ?? 0);
  if (stored > 0.0001) return Math.round(stored * 100) / 100;

  const amount = Number(line?.amount ?? line?.line_total ?? 0);
  return vatFromInclusiveGross(amount, rate);
}

function formatVatRatePercent(rate) {
  const n = Number(rate ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * Group sale lines into thermal receipt VAT buckets: A(16%), B(8%), …
 * Non-vatable sales return a single Non-Vatable / 0 row.
 */
export function buildThermalVatChargeGroups(items = [], { totalVat = 0 } = {}) {
  const groups = new Map();

  for (const line of items ?? []) {
    const rate = resolveLineVatRate(line);
    const vat = resolveLineVatAmount(line, rate);
    const key = rate;
    const existing = groups.get(key) ?? { rate: key, amount: 0 };
    existing.amount = Math.round((existing.amount + vat) * 100) / 100;
    groups.set(key, existing);
  }

  if (!groups.size && Number(totalVat) > 0.0001) {
    // No line detail — fall back to a single standard-rate bucket.
    groups.set(16, { rate: 16, amount: Math.round(Number(totalVat) * 100) / 100 });
  }

  const sorted = [...groups.values()].sort((a, b) => b.rate - a.rate);
  const hasPositiveRate = sorted.some((g) => g.rate > 0.0001);

  if (!hasPositiveRate) {
    return [{ label: "Non-Vatable", amount: 0 }];
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return sorted.map((group, index) => ({
    label: `${letters[index] ?? String(index + 1)}(${formatVatRatePercent(group.rate)}%)`,
    amount: Math.round(group.amount * 100) / 100,
  }));
}
