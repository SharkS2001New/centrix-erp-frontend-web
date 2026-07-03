"use client";

import { formatPackagingLabel, packageNameFromUom } from "@/components/lpo/lpo-product-utils";
import { inputClassName } from "@/components/catalog/catalog-shared";

export const REASON_SCOPE = {
  ORDER: "order",
  PER_PRODUCT: "per_product",
};

export const STOCK_LOCATION = {
  SHOP: "shop",
  STORE: "store",
};

import { RETURN_REASONS } from "@/components/sales/customer-returns-shared";

export const DEFAULT_RETURN_DRAFT = {
  quantity: "1",
  package_type: "full_package",
  stock_location: STOCK_LOCATION.STORE,
  reasonPreset: RETURN_REASONS[0],
  reasonOther: "",
};

/** UOM label for package dropdown, e.g. "Carton (20)". */
export function packagingLabelFromProduct(product, uomById) {
  if (!product) return "package";
  if (product.packaging_label) return product.packaging_label;
  const uom = product.uom ?? uomById?.get?.(product.unit_id);
  return formatPackagingLabel(uom) || packageNameFromUom(uom);
}

export function packageTypeOptions(packagingLabel) {
  const pack = packagingLabel && packagingLabel !== "—" ? packagingLabel : "per product UOM";

  return [
    {
      value: "full_package",
      label: `Full package (${pack})`,
      hint: "Return whole selling units exactly as stocked (bag, carton, dozen, etc.).",
    },
    {
      value: "pieces",
      label: "Pieces / loose",
      hint: "Return individual units not in a full package (loose pieces, kg, litres, etc.).",
    },
  ];
}

export function PackageTypeField({ value, onChange, packagingLabel, idPrefix = "pkg" }) {
  const options = packageTypeOptions(packagingLabel);
  const normalized = value === "partial" ? "pieces" : value;

  return (
    <div>
      <span className="theme-accent-label mb-1 block text-xs font-bold uppercase tracking-wide">
        How are you returning?
      </span>
      <select
        id={`${idPrefix}-type`}
        className={inputClassName()}
        value={normalized}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="theme-subtext mt-1 text-[11px] leading-snug">
        {options.find((o) => o.value === normalized)?.hint ??
          "Full package = whole UOM unit. Pieces / loose = individual units."}
      </p>
    </div>
  );
}

/** LPO line receive locations from API summary. */
export function lpoReceivedLocationMeta(line) {
  const byLoc = line?.received_qty_by_location ?? {};
  const shop = Number(byLoc.shop ?? 0);
  const store = Number(byLoc.store ?? 0);
  const options = [];
  if (shop > 0) options.push(STOCK_LOCATION.SHOP);
  if (store > 0) options.push(STOCK_LOCATION.STORE);

  const primary =
    (line?.received_location_options?.length === 1
      ? line.received_location_options[0]
      : null) ??
    line?.received_stock_location ??
    (options.length === 1 ? options[0] : STOCK_LOCATION.STORE);

  return { options, primary, shop, store, locked: options.length === 1 };
}

export function formatStockLocationLabel(location) {
  if (location === STOCK_LOCATION.SHOP) return "Shop";
  if (location === STOCK_LOCATION.STORE) return "Store";
  return location ?? "—";
}

export function stockLocationSelectOptions({ mode, lpoLine, manual = false } = {}) {
  if (manual || mode !== "lpo" || !lpoLine) {
    return [
      { value: STOCK_LOCATION.STORE, label: "Store" },
      { value: STOCK_LOCATION.SHOP, label: "Shop" },
    ];
  }

  const { options, primary } = lpoReceivedLocationMeta(lpoLine);
  if (options.length === 0) {
    return [
      { value: STOCK_LOCATION.STORE, label: "Store" },
      { value: STOCK_LOCATION.SHOP, label: "Shop" },
    ];
  }

  return options.map((value) => ({
    value,
    label: formatStockLocationLabel(value),
    selected: value === primary,
  }));
}

/** Map UI lines to API payload — one line per product, single location. */
export function expandLinesForSubmit(lines, reasonScope, docNotes) {
  return lines.flatMap((l) => {
    const reason =
      reasonScope === REASON_SCOPE.PER_PRODUCT ? (l.reason ?? "").trim() : docNotes;
    const qty = Number(l.quantity);
    if (!qty || qty <= 0) return [];

    return [
      {
        product_code: l.product_code,
        package_type: l.package_type === "partial" ? "pieces" : l.package_type,
        uom_label: l.uom_label,
        reason,
        stock_location: l.stock_location,
        quantity: qty,
      },
    ];
  });
}

export function formatReturnQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toLocaleString("en-KE", { maximumFractionDigits: 3 });
}

export function statusBadgeClass(status) {
  if (status === "approved") return "bg-emerald-50 text-emerald-800";
  if (status === "rejected") return "bg-red-50 text-red-800";
  return "bg-amber-50 text-amber-900";
}
