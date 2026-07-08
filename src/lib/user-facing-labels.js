/** User-facing labels — map internal API values like `backend` / `BACKEND_SALE` to Backoffice wording. */

export const INVENTORY_TRANSACTION_TYPE_LABELS = {
  PURCHASE: "Purchase",
  POS_SALE: "POS sale",
  MOBILE_SALE: "Mobile sale",
  BACKEND_SALE: "Backoffice sale",
  RETURN: "Return",
  DAMAGE: "Damage",
  ADJUSTMENT: "Adjustment",
  STOCK_TAKE: "Stock take",
  TRANSFER: "Transfer",
  WRITE_OFF: "Write-off",
  SUPPLIER_RETURN: "Supplier return",
};

export const SALES_CHANNEL_LABELS = {
  pos: "POS",
  mobile: "Mobile",
  erp: "ERP",
  backend: "ERP",
  backoffice: "ERP",
  wholesale: "Wholesale",
  online: "Online",
  route: "Route",
};

export function humanizeBackendTerm(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const upper = raw.toUpperCase();
  if (upper === "BACKEND_SALE") return "Backoffice sale";
  if (upper === "BACKEND") return "Backoffice";
  const lower = raw.toLowerCase();
  if (lower === "backend" || lower === "backoffice") return "Backoffice";
  if (/\bbackend\b/i.test(raw)) {
    return raw.replace(/\bbackend\b/gi, "Backoffice");
  }
  return null;
}

export function inventoryTransactionTypeLabel(type) {
  const key = String(type ?? "").toUpperCase();
  return INVENTORY_TRANSACTION_TYPE_LABELS[key] ?? humanizeBackendTerm(type) ?? type ?? "—";
}

export function salesChannelLabel(channel) {
  const key = String(channel ?? "").toLowerCase();
  return SALES_CHANNEL_LABELS[key] ?? humanizeBackendTerm(channel) ?? channel ?? "—";
}
