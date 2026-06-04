/** Product display name from nested API relation or a code → product map. */
export function saleLineProductName(line, productByCode) {
  const fromRelation = line?.product?.product_name;
  if (fromRelation) return fromRelation;
  const code = line?.product_code;
  if (code && productByCode?.[code]?.product_name) {
    return productByCode[code].product_name;
  }
  return null;
}

export function saleLineProductLabel(line, productByCode) {
  return saleLineProductName(line, productByCode) || line?.product_code || "—";
}

/** Build { [product_code]: product } from /products list response. */
export function indexProductsByCode(products) {
  const map = {};
  for (const p of products ?? []) {
    if (p?.product_code) map[p.product_code] = p;
  }
  return map;
}
