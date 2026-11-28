import { formatOrgCurrency } from "@/lib/format";
import { formatDisplayQty } from "@/lib/stock-uom";
import { smallPackagingLabel } from "@/lib/uom-packaging";

const LITER_UNITS = new Set(["l", "litre", "litres", "liter", "liters"]);

export function productSellByAmountPriceLabel(product) {
  const enabled =
    product?.sell_by_amount === true ||
    product?.sell_by_amount === 1 ||
    product?.sell_by_amount === "1" ||
    String(product?.sell_by_amount ?? "").toLowerCase() === "true";
  const price = Number(product?.sell_by_amount_price);
  const quantity = Number(product?.sell_by_amount_quantity);

  if (!enabled || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const smallUnit = smallPackagingLabel(product?.product_uom)
    .trim()
    .toLowerCase();
  const millilitres = LITER_UNITS.has(smallUnit) ? quantity * 1000 : quantity;

  return `${formatOrgCurrency(price)} = ${formatDisplayQty(millilitres, 4)} ml`;
}
