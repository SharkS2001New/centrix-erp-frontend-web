/** Stock quantities in the database are stored in base pieces. */

/** True when one display unit equals one piece in stock (conversion factor 1). */
export function isSinglePieceUom(uomOrFactor) {
  return uomConversionFactor(uomOrFactor) === 1;
}

export function uomConversionFactor(uomOrFactor) {
  if (uomOrFactor != null && typeof uomOrFactor === "object") {
    const f = Number(uomOrFactor.conversion_factor ?? 1);
    return f > 0 ? f : 1;
  }
  const f = Number(uomOrFactor ?? 1);
  return f > 0 ? f : 1;
}

export function baseToDisplayQty(baseQty, conversionFactor) {
  const factor = uomConversionFactor(conversionFactor);
  return Number(baseQty ?? 0) / factor;
}

export function displayToBaseQty(displayQty, conversionFactor) {
  const factor = uomConversionFactor(conversionFactor);
  return Number(displayQty ?? 0) * factor;
}

export function uomLabelFrom(uom) {
  if (!uom) return "units";
  return (uom.full_name || uom.uom_type || "units").trim();
}

/** Convert damage entry quantity to base pieces for the ledger. */
export function damageQtyToBase(displayQty, packageType, conversionFactor) {
  const qty = Number(displayQty ?? 0);
  if (packageType === "pieces") return qty;
  return displayToBaseQty(qty, conversionFactor);
}

/** Prefer whole numbers in UI when the value is effectively an integer. */
export function formatDisplayQty(displayQty, maxDecimals = 3) {
  const n = Number(displayQty ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 0.0001) {
    return Math.round(n).toLocaleString("en-KE");
  }
  return n.toLocaleString("en-KE", {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  });
}

/** Split base pieces into full packs and leftover loose pieces. */
export function splitBaseToMixed(baseQty, conversionFactor) {
  const base = Number(baseQty ?? 0);
  const factor = uomConversionFactor(conversionFactor);
  if (factor <= 1) {
    return { packs: 0, loose: base, factor };
  }
  const packs = Math.floor(base / factor);
  const loose = Math.round((base - packs * factor) * 10000) / 10000;
  return { packs, loose, factor };
}

/** Combine pack count + loose pieces into base pieces for storage. */
export function mixedToBase(packs, loose, conversionFactor) {
  const factor = uomConversionFactor(conversionFactor);
  if (factor <= 1) return Number(loose ?? packs ?? 0);
  return Number(packs ?? 0) * factor + Number(loose ?? 0);
}

export function formatStockDisplay(baseQty, uomOrFactor, label) {
  const factor = uomConversionFactor(uomOrFactor);
  const display = baseToDisplayQty(baseQty, factor);
  const unit =
    label ??
    (uomOrFactor && typeof uomOrFactor === "object" ? uomLabelFrom(uomOrFactor) : "units");
  return {
    display,
    base: Number(baseQty ?? 0),
    factor,
    unit,
    text: `${formatDisplayQty(display)} ${unit}`,
  };
}

/** e.g. "1 Carton (12s) + 2 pcs" when stock does not divide evenly into packs. */
export function formatMixedStockDisplay(baseQty, uomOrFactor, packLabel) {
  const factor = uomConversionFactor(uomOrFactor);
  const packName =
    packLabel ??
    (uomOrFactor && typeof uomOrFactor === "object"
      ? (uomOrFactor.full_name || uomOrFactor.uom_type || "pack").trim()
      : "pack");
  const unit =
    uomOrFactor && typeof uomOrFactor === "object" ? uomLabelFrom(uomOrFactor) : "units";

  if (factor <= 1) {
    const single = formatStockDisplay(baseQty, factor, unit);
    return { ...single, packs: 0, loose: single.display };
  }

  const { packs, loose } = splitBaseToMixed(baseQty, factor);
  const parts = [];
  if (packs > 0) parts.push(`${formatDisplayQty(packs)} ${packName}`);
  if (loose > 0.0001) parts.push(`${formatDisplayQty(loose)} pcs`);
  if (!parts.length) parts.push(`0 ${packName}`);

  return {
    display: baseToDisplayQty(baseQty, factor),
    base: Number(baseQty ?? 0),
    factor,
    unit: packName,
    packs,
    loose,
    text: parts.join(", "),
  };
}
