/** @typedef {import('@/contexts/auth-context').AuthContextValue['hasPermission']} HasPermissionFn */

export const SHOP_DEBTORS_BUCKETS = ["unpaid", "partial", "paid"];

const LEGACY_CODES = {
  unpaid: [
    "shop_debtors.unpaid.view",
    "customers.shop_debtors_unpaid.view",
    "customers.shop_debtors.view",
  ],
  partial: [
    "shop_debtors.partial.view",
    "customers.shop_debtors_partial.view",
    "customers.shop_debtors.view",
  ],
  paid: [
    "shop_debtors.paid.view",
    "customers.shop_debtors_paid.view",
    "customers.shop_debtors.view",
  ],
};

export function shopDebtorsPermissionCode(bucket) {
  const key = String(bucket ?? "unpaid")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  const normalized =
    key === "partially_paid" || key === "pending_payment" ? "partial" : key;
  const safe = SHOP_DEBTORS_BUCKETS.includes(normalized) ? normalized : "unpaid";
  return `shop_debtors.${safe}.view`;
}

/** @param {string} bucket @param {HasPermissionFn} hasPermission */
export function canViewShopDebtorsBucket(bucket, hasPermission) {
  if (typeof hasPermission !== "function") return false;
  const key = String(bucket ?? "unpaid")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  const normalized =
    key === "partially_paid" || key === "pending_payment" ? "partial" : key;
  const safe = SHOP_DEBTORS_BUCKETS.includes(normalized) ? normalized : "unpaid";
  return (LEGACY_CODES[safe] ?? []).some((code) => hasPermission(code));
}

/** @param {HasPermissionFn} hasPermission */
export function canViewAnyShopDebtorsBucket(hasPermission) {
  if (typeof hasPermission !== "function") return false;
  return SHOP_DEBTORS_BUCKETS.some((bucket) => canViewShopDebtorsBucket(bucket, hasPermission));
}

/** First bucket the user may open (sidebar default / legacy redirect). */
export function defaultShopDebtorsBucket(hasPermission) {
  for (const bucket of SHOP_DEBTORS_BUCKETS) {
    if (canViewShopDebtorsBucket(bucket, hasPermission)) return bucket;
  }
  return null;
}
