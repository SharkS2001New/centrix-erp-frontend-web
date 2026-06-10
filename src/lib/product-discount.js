/** Whether the product has a non-zero discount configured. */
export function productHasConfiguredDiscount(product) {
  if (!product) return false;
  const type = product.discount_type === "fixed" ? "fixed" : "percentage";
  if (type === "fixed") {
    return Number(product.discount_value ?? 0) > 0;
  }
  return Number(product.discount_percentage ?? 0) > 0;
}

/** Discount amount for a POS line from product settings. */
export function computeProductLineDiscount(product, lineAmountBeforeDiscount, packQty = 1) {
  if (!product || lineAmountBeforeDiscount <= 0) return 0;

  const type = product.discount_type === "fixed" ? "fixed" : "percentage";
  if (type === "fixed") {
    const perPack = Number(product.discount_value ?? 0);
    if (perPack <= 0) return 0;
    return Math.round(Math.max(0, packQty * perPack) * 100) / 100;
  }

  const pct = Number(product.discount_percentage ?? 0);
  if (pct <= 0) return 0;
  return Math.round(Math.max(0, lineAmountBeforeDiscount * (pct / 100)) * 100) / 100;
}

export function formatProductDiscountLabel(product) {
  if (!product || !productHasConfiguredDiscount(product)) return "—";
  const type = product.discount_type === "fixed" ? "fixed" : "percentage";
  if (type === "fixed") {
    return `KES ${Number(product.discount_value ?? 0).toLocaleString()} per pack`;
  }
  return `${Number(product.discount_percentage ?? 0)}%`;
}
