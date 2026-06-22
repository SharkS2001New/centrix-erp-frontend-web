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
