/** Packaging label: UOM full name and conversion factor, e.g. "Carton (20)". */

export function packageNameFromUom(uom) {
  if (!uom) return "package";
  return (uom.full_name || uom.uom_type || "package").trim();
}

export function measureUnitFromUom(uom) {
  if (!uom) return "units";
  const t = String(uom.uom_type || "units").trim();
  const labels = {
    piece: "pieces",
    pcs: "pieces",
    kg: "kg",
    g: "g",
    l: "litres",
    ml: "ml",
    m: "m",
    cm: "cm",
    carton: "cartons",
    bag: "bags",
  };
  return labels[t.toLowerCase()] ?? t;
}

export function formatPackagingLabel(uom) {
  if (!uom) return "—";
  const packageName = packageNameFromUom(uom);
  return `${packageName} (${formatFactor(uom.conversion_factor ?? 1)})`;
}

export function formatFactor(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "1";
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("en-KE", { maximumFractionDigits: 3 });
}

/** @param {object} product @param {Map<number, object>} uomById @param {Map<number, object>} vatById */
export function enrichProductForLpo(product, uomById, vatById) {
  const uom = uomById.get(product.unit_id);
  const vat = vatById.get(product.vat_id);
  const packaging = formatPackagingLabel(uom);
  const packName = packageNameFromUom(uom);

  return {
    ...product,
    uom,
    packaging_label: packaging,
    conversion_factor: Number(uom?.conversion_factor ?? 1),
    package_name: packName,
    measure_unit: measureUnitFromUom(uom),
    uom_label: packName,
    vat_rate: vat?.vat_percentage != null ? Number(vat.vat_percentage) : 0,
    unit_price_display: Number(product.unit_price ?? 0),
    stock_in_shop: Number(product.stock_in_shop ?? 0),
    stock_in_store: Number(product.stock_in_store ?? 0),
  };
}

export function lineFromEnrichedProduct(product) {
  const cost =
    product.last_cost_price != null && product.last_cost_price !== ""
      ? Number(product.last_cost_price)
      : 0;
  const uom = product.uom;
  const packName = product.package_name ?? packageNameFromUom(uom);

  return {
    product_code: product.product_code,
    product_name: product.product_name ?? product.product_code,
    packaging_label: product.packaging_label ?? formatPackagingLabel(uom),
    conversion_factor: Number(product.conversion_factor ?? uom?.conversion_factor ?? 1),
    package_name: packName,
    measure_unit: product.measure_unit ?? measureUnitFromUom(uom),
    uom: packName,
    unit_id: product.unit_id,
    vat_rate: product.vat_rate ?? 0,
    ordered_qty: "1",
    cost_price: cost > 0 ? String(Math.trunc(cost)) : "",
  };
}
