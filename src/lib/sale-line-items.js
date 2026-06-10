import { cartLineDisplayUnitPrice } from "@/lib/pos-line";
import { formatMixedStockDisplay, formatPosCartQty } from "@/lib/stock-uom";

function saleLineUom(line, uomById) {
  if (line?.product?.unit_id != null && uomById?.get) {
    return uomById.get(line.product.unit_id) ?? null;
  }
  return line?.product?.unit ?? line?.product?.uom ?? null;
}

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

/** Display sale line quantity with packaging labels when UOM data is available. */
/** Unit price shown per pack (wholesale) or per retail measure — matches live POS cart. */
export function saleLineDisplayUnitPrice(line, uomById) {
  const uom = saleLineUom(line, uomById);
  const isRetailLine = Number(line?.on_wholesale_retail) === 1;
  return cartLineDisplayUnitPrice({ unit_price: line?.selling_price }, uom, isRetailLine);
}

export function saleLineQtyLabel(line, uomById) {
  const uom = saleLineUom(line, uomById);

  if (uom) {
    return formatPosCartQty(line?.quantity, uom);
  }

  if (line?.uom) {
    return `${line.quantity} ${line.uom}`;
  }

  return formatMixedStockDisplay(line?.quantity, 1).text;
}

/** Build { [product_code]: product } from /products list response. */
export function indexProductsByCode(products) {
  const map = {};
  for (const p of products ?? []) {
    if (p?.product_code) map[p.product_code] = p;
  }
  return map;
}
