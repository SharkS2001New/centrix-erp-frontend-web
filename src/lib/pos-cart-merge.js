export function findMergeableCartLine(
  cartLines,
  productCode,
  computed,
  posSalesConfig,
  sellWholesale,
  excludeLineId = null,
) {
  if (!cartLines?.length || !productCode || !computed) return null;
  const nextRetail = posSalesConfig?.perLineStockRouting
    ? sellWholesale === false
    : Boolean(computed.isRetail);
  const nextUom = String(computed.uomLabel ?? "").trim();

  return (
    cartLines.find((line) => {
      if (excludeLineId != null && line.id === excludeLineId) return false;
      if (line.product_code !== productCode) return false;
      const lineRetail = Number(line.on_wholesale_retail) === 1;
      if (lineRetail !== nextRetail) return false;
      const lineUom = String(line.uom ?? "").trim();
      if (lineUom && nextUom && lineUom !== nextUom) return false;
      return true;
    }) ?? null
  );
}

/** True when search query exactly matches a product barcode / SKU (product_code). */
export function isExactProductCodeQuery(query, productCode) {
  const q = String(query ?? "").trim();
  const code = String(productCode ?? "").trim();
  return q.length > 0 && code.length > 0 && q.toLowerCase() === code.toLowerCase();
}
