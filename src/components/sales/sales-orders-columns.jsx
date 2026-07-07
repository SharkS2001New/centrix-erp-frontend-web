"use client";

import { formatShortDate } from "@/components/catalog/catalog-shared";
import { formatSaleKes } from "@/lib/sales";

export function orderTableColumnCount({
  showBranchColumn = false,
  showRouteColumn = false,
  showDeliveryDateColumn = false,
  showConnectivityColumn = false,
  showSourceColumn = true,
  showDiscountColumn = false,
}) {
  let count = showSourceColumn ? 10 : 9;
  if (showBranchColumn) count += 1;
  if (showRouteColumn) count += 1;
  if (showDeliveryDateColumn) count += 1;
  if (showConnectivityColumn) count += 1;
  if (showDiscountColumn) count += 1;
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

export function saleConnectivityLabel(sale) {
  const connectivity =
    sale?.order_connectivity ??
    (sale?.is_offline_order === true
      ? "offline"
      : sale?.is_offline_order === false
        ? "online"
        : sale?.fulfillment_meta?.location_check?.offline_order === true
          ? "offline"
          : sale?.fulfillment_meta?.location_check?.offline_order === false
            ? "online"
            : null);

  if (connectivity === "offline") return "Offline";
  if (connectivity === "online") return "Online";
  return "—";
}

export function saleConnectivityCell(sale) {
  const label = saleConnectivityLabel(sale);
  if (label === "Offline") {
    return <span className="font-medium text-amber-800">Offline</span>;
  }
  if (label === "Online") {
    return <span className="text-slate-700">Online</span>;
  }
  return <span className="text-slate-400">—</span>;
}

export function saleVatCell(sale) {
  return formatSaleKes(sale.total_vat);
}

export function saleCreatedByLabel(sale) {
  return (
    sale?.created_by_name ??
    sale?.cashier_name ??
    sale?.cashier?.full_name ??
    sale?.cashier?.username ??
    sale?.user?.full_name ??
    sale?.user?.username ??
    "—"
  );
}

export function saleCreatedOnValue(sale) {
  return sale?.created_at ?? null;
}

export function SaleCreatedByCell({ sale }) {
  return (
    <div>
      <p className="font-medium text-slate-800">{saleCreatedByLabel(sale)}</p>
      <p className="text-xs text-slate-500">Created on {formatShortDate(saleCreatedOnValue(sale))}</p>
    </div>
  );
}
