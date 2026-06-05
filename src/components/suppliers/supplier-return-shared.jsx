"use client";

import { formatPackagingLabel, packageNameFromUom } from "@/components/lpo/lpo-product-utils";

export const REASON_SCOPE = {
  ORDER: "order",
  PER_PRODUCT: "per_product",
};

export const STOCK_LOCATION = {
  SHOP: "shop",
  STORE: "store",
  BOTH: "both",
};

export const DEFAULT_RETURN_DRAFT = {
  quantity: "1",
  package_type: "full_package",
  stock_location: STOCK_LOCATION.STORE,
  reason: "",
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
      <span className="mb-1 block text-xs font-medium text-slate-500">How are you returning?</span>
      <select
        id={`${idPrefix}-type`}
        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-[#185FA5] focus:ring-2 focus:ring-[#185FA5]/20"
        value={normalized}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        {options.find((o) => o.value === normalized)?.hint ??
          "Full package = whole UOM unit. Pieces / loose = individual units."}
      </p>
    </div>
  );
}

/** Split return qty across store (first) then shop when returning from both. */
export function splitBothStockQty(qty, shopAvail, storeAvail) {
  const total = Number(qty) || 0;
  const shop = Math.max(0, Number(shopAvail) || 0);
  const store = Math.max(0, Number(storeAvail) || 0);

  let storeQty = Math.min(total, store);
  let shopQty = total - storeQty;
  if (shopQty > shop) {
    shopQty = Math.min(total, shop);
    storeQty = total - shopQty;
  }

  return {
    storeQty: Math.max(0, storeQty),
    shopQty: Math.max(0, shopQty),
  };
}

export function formatStockLocationLabel(location, line) {
  if (location === STOCK_LOCATION.BOTH && line) {
    const storeQty = line.store_qty ?? 0;
    const shopQty = line.shop_qty ?? 0;
    return `Both (store ${storeQty}, shop ${shopQty})`;
  }
  if (location === STOCK_LOCATION.SHOP) return "Shop";
  if (location === STOCK_LOCATION.STORE) return "Store";
  if (location === STOCK_LOCATION.BOTH) return "Both";
  return location ?? "—";
}

/** Expand UI lines with stock_location both into separate API lines. */
export function expandLinesForSubmit(lines, reasonScope, docNotes) {
  return lines.flatMap((l) => {
    const reason =
      reasonScope === REASON_SCOPE.PER_PRODUCT ? (l.reason ?? "").trim() : docNotes;
    const base = {
      product_code: l.product_code,
      package_type: l.package_type === "partial" ? "pieces" : l.package_type,
      uom_label: l.uom_label,
      reason,
    };

    if (l.stock_location === STOCK_LOCATION.BOTH) {
      const parts = [];
      const storeQty = Number(l.store_qty ?? 0);
      const shopQty = Number(l.shop_qty ?? 0);
      if (storeQty > 0) {
        parts.push({ ...base, stock_location: STOCK_LOCATION.STORE, quantity: storeQty });
      }
      if (shopQty > 0) {
        parts.push({ ...base, stock_location: STOCK_LOCATION.SHOP, quantity: shopQty });
      }
      return parts.length > 0 ? parts : [];
    }

    return [
      {
        ...base,
        stock_location: l.stock_location,
        quantity: Number(l.quantity),
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
