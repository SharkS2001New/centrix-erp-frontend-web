"use client";

import { formatShortDate } from "@/components/catalog/catalog-shared";
import { formatSaleKes } from "@/lib/sales";

export function orderTableColumnCount({
  showBranchColumn = false,
  showRouteColumn = false,
  showDeliveryDateColumn = false,
  showSourceColumn = true,
}) {
  let count = showSourceColumn ? 10 : 9;
  if (showBranchColumn) count += 1;
  if (showRouteColumn) count += 1;
  if (showDeliveryDateColumn) count += 1;
  return count;
}

export function saleRouteLabel(sale, routeById) {
  const id = sale?.route_id;
  if (id != null && routeById?.has(id)) {
    return routeById.get(id).route_name ?? "—";
  }
  return "—";
}

export function salePaymentReferenceLabel(refs) {
  const list = [...new Set((refs ?? []).map((r) => String(r).trim()).filter(Boolean))];
  if (!list.length) return "";
  return list.join(" · ");
}

export function saleRouteCell(sale, routeById) {
  return saleRouteLabel(sale, routeById);
}

export function saleDeliveryDateCell(sale) {
  return formatShortDate(sale.delivery_date);
}

export function saleVatCell(sale) {
  return formatSaleKes(sale.total_vat);
}
