import { saleCustomerLabel } from "@/lib/sales";

/** In-memory customer details keyed by POS order number (edit session). */
const customersByOrderNum = new Map();

export function rememberPosOrderCustomerName(orderNum, name) {
  const num = Number(orderNum);
  const trimmed = String(name ?? "").trim();
  if (!Number.isFinite(num) || num <= 0 || !trimmed) return;
  if (trimmed.toLowerCase() === "walk-in") return;

  const existing = customersByOrderNum.get(num) ?? {};
  customersByOrderNum.set(num, { ...existing, name: trimmed });
}

export function rememberPosOrderCustomer(orderNum, { name, customerNum } = {}) {
  const num = Number(orderNum);
  if (!Number.isFinite(num) || num <= 0) return;

  const trimmedName = String(name ?? "").trim();
  const parsedNum = customerNum != null && customerNum !== "" ? Number(customerNum) : null;
  const hasName = trimmedName && trimmedName.toLowerCase() !== "walk-in";
  const hasCustomerNum = Number.isFinite(parsedNum) && parsedNum > 0;

  if (!hasName && !hasCustomerNum) return;

  const existing = customersByOrderNum.get(num) ?? {};
  customersByOrderNum.set(num, {
    name: hasName ? trimmedName : existing.name ?? "",
    customerNum: hasCustomerNum ? parsedNum : existing.customerNum ?? null,
  });
}

export function getPosOrderCustomerName(orderNum) {
  return getPosOrderCustomer(orderNum).name;
}

export function getPosOrderCustomer(orderNum) {
  const num = Number(orderNum);
  if (!Number.isFinite(num) || num <= 0) {
    return { name: "", customerNum: null };
  }
  const entry = customersByOrderNum.get(num);
  return {
    name: entry?.name ?? "",
    customerNum: entry?.customerNum ?? null,
  };
}

export function extractSaleCustomerName(sale) {
  if (!sale) return "";
  const label = saleCustomerLabel(sale);
  if (!label || label.toLowerCase() === "walk-in") return "";
  return label;
}

export function extractSaleCustomerMemory(sale) {
  if (!sale) return { name: "", customerNum: null };
  const customerNum = sale.customer_num ?? sale.customer?.customer_num ?? null;
  return {
    name: extractSaleCustomerName(sale),
    customerNum: customerNum != null && customerNum !== "" ? Number(customerNum) : null,
  };
}
