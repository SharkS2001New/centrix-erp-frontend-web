/** Stock quantities in the database are stored in small-packaging units (pcs, kg, litres, etc.). */

import {
  fullPackageLabel,
  middlePackagingLabel,
  smallPackagingLabel,
  uomHasFullPack,
  uomHasMiddlePack,
  uomIsFullPackageOnly,
  uomStockTakeLevels,
  uomUsesSmallPackaging,
} from "./uom-packaging";

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
  if (uomIsFullPackageOnly(uom)) {
    return fullPackageLabel(uom);
  }
  return (uom.full_name || uom.uom_type || "units").trim();
}

/** Convert damage entry quantity to base pieces for the ledger. */
export function normalizeDamageLevel(packageType, uom) {
  if (packageType === "full_package" || packageType === "partial" || packageType === "full") {
    if (uomHasFullPack(uom)) return "full";
    return "small";
  }
  if (packageType === "pieces" || packageType === "small") return "small";
  if (packageType === "middle") return "middle";
  return defaultDamageMeasureLevel(uom);
}

export function defaultDamageMeasureLevel(uom) {
  const levels = uomStockTakeLevels(uom);
  return levels.find((l) => l.key === "full")?.key ?? levels[0]?.key ?? "small";
}

export function damageMeasureLabel(uom, packageType) {
  const level = normalizeDamageLevel(packageType, uom);
  const match = uomStockTakeLevels(uom).find((l) => l.key === level);
  return match?.label ?? level;
}

export function damageQtyToBase(displayQty, packageType, uomOrFactor) {
  const qty = Number(displayQty ?? 0);
  const uom = uomOrFactor != null && typeof uomOrFactor === "object" ? uomOrFactor : null;
  const level = normalizeDamageLevel(packageType, uom);

  if (level === "small") return qty;
  if (level === "middle") {
    const mid = Number(uom?.middle_factor ?? 0);
    return mid > 0 ? qty * mid : qty;
  }
  return displayToBaseQty(qty, uomOrFactor);
}

/** Convert stored base quantity back to the damage form display value. */
export function damageBaseToDisplay(baseQty, packageType, uomOrFactor) {
  const base = Number(baseQty ?? 0);
  const uom = uomOrFactor != null && typeof uomOrFactor === "object" ? uomOrFactor : null;
  const level = normalizeDamageLevel(packageType, uom);

  if (level === "small") return formatDisplayQty(base);
  if (level === "middle") {
    const mid = Number(uom?.middle_factor ?? 0);
    return formatDisplayQty(mid > 0 ? base / mid : base);
  }
  return formatDisplayQty(baseToDisplayQty(base, uomOrFactor));
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

/** Split base qty into full / middle / small packaging parts. */
export function splitBaseToHierarchy(baseQty, uomOrFactor) {
  const uom = uomOrFactor != null && typeof uomOrFactor === "object" ? uomOrFactor : null;
  const factor = uomConversionFactor(uomOrFactor);
  let remaining = Number(baseQty ?? 0);

  if (uomIsFullPackageOnly(uom)) {
    const fullLabel = fullPackageLabel(uom);
    const qty = factor > 1 ? baseToDisplayQty(remaining, factor) : remaining;
    return [{ label: fullLabel, qty }];
  }

  const smallLabel = smallPackagingLabel(uom);
  const parts = [];

  if (factor <= 1) {
    if (remaining > 0.0001 || remaining === 0) {
      parts.push({ label: smallLabel, qty: remaining });
    }
    return parts.length ? parts : [{ label: smallLabel, qty: 0 }];
  }

  const fullLabel = fullPackageLabel(uom);
  const fullCount = Math.floor(remaining / factor);
  remaining = Math.round((remaining - fullCount * factor) * 10000) / 10000;
  if (fullCount > 0) {
    parts.push({ label: fullLabel, qty: fullCount });
  }

  const middleLabel = middlePackagingLabel(uom);
  const middleFactor = Number(uom?.middle_factor ?? 0);
  if (middleLabel && middleFactor > 1) {
    const midCount = Math.floor(remaining / middleFactor);
    remaining = Math.round((remaining - midCount * middleFactor) * 10000) / 10000;
    if (midCount > 0) {
      parts.push({ label: middleLabel, qty: midCount });
    }
  }

  if (remaining > 0.0001) {
    parts.push({ label: smallLabel, qty: remaining });
  }
  if (!parts.length) {
    parts.push({ label: fullLabel, qty: 0 });
  }

  return parts;
}

/** @deprecated use splitBaseToHierarchy */
export function splitBaseToMixed(baseQty, conversionFactor) {
  const factor = uomConversionFactor(conversionFactor);
  const parts = splitBaseToHierarchy(baseQty, { conversion_factor: factor });
  const full = parts[0]?.qty ?? 0;
  const loose = parts.length > 1 ? parts[parts.length - 1].qty : 0;
  return { packs: factor > 1 ? full : 0, loose: factor <= 1 ? full : loose, factor };
}

/** Combine pack count + loose pieces into base pieces for storage. */
export function mixedToBase(packs, loose, conversionFactor) {
  const factor = uomConversionFactor(conversionFactor);
  if (factor <= 1) return Number(loose ?? packs ?? 0);
  return Number(packs ?? 0) * factor + Number(loose ?? 0);
}

/** Counted quantities at each packaging level → base (small) units. */
export function hierarchyToBase(fullQty, middleQty, looseQty, uomOrFactor) {
  const uom = uomOrFactor != null && typeof uomOrFactor === "object" ? uomOrFactor : null;
  const factor = uomConversionFactor(uomOrFactor);
  if (factor <= 1) {
    return Number(looseQty ?? fullQty ?? 0);
  }
  const midFactor = Number(uom?.middle_factor ?? 0);
  const mid = middlePackagingLabel(uom) && midFactor > 1 ? midFactor : 0;
  return (
    Number(fullQty ?? 0) * factor +
    Number(middleQty ?? 0) * mid +
    Number(looseQty ?? 0)
  );
}

/** Split stored base qty into counts per level (for forms / stock take load). */
export function baseToHierarchyCounts(baseQty, uomOrFactor) {
  const uom = uomOrFactor != null && typeof uomOrFactor === "object" ? uomOrFactor : null;
  const parts = splitBaseToHierarchy(baseQty, uom);
  const fullLabel = fullPackageLabel(uom);
  const midLabel = middlePackagingLabel(uom);
  const smallLabel = smallPackagingLabel(uom);
  return {
    full: parts.find((p) => p.label === fullLabel)?.qty ?? 0,
    middle: midLabel ? parts.find((p) => p.label === midLabel)?.qty ?? 0 : 0,
    small: parts.find((p) => p.label === smallLabel)?.qty ?? 0,
    /** @deprecated use small */
    loose: parts.find((p) => p.label === smallLabel)?.qty ?? 0,
  };
}

/** Map stock-take level keys → base (small) units using the product UOM. */
export function stockTakeCountsToBase(countsByKey, uomOrFactor) {
  const uom = uomOrFactor != null && typeof uomOrFactor === "object" ? uomOrFactor : null;
  const factor = uomConversionFactor(uomOrFactor);

  if (uomIsFullPackageOnly(uom)) {
    const full = Number(countsByKey.full ?? 0);
    return factor > 1 ? full * factor : full;
  }

  if (factor <= 1) {
    return Number(countsByKey.small ?? countsByKey.full ?? 0);
  }
  return hierarchyToBase(
    countsByKey.full,
    countsByKey.middle,
    countsByKey.small,
    uom,
  );
}

/** Cap hierarchy total to maxBase, preserving the edited level and adjusting larger packs first. */
export function clampHierarchyCountsToMaxBase(byKey, changedLevelKey, uom, maxBase) {
  const max = Math.max(0, Number(maxBase ?? 0));
  const result = {
    full: Number(byKey.full ?? 0),
    middle: Number(byKey.middle ?? 0),
    small: Number(byKey.small ?? 0),
  };

  if (stockTakeCountsToBase(result, uom) <= max + 0.0001) {
    return result;
  }

  const changedVal = result[changedLevelKey];
  const changedOnly = {
    full: changedLevelKey === "full" ? changedVal : 0,
    middle: changedLevelKey === "middle" ? changedVal : 0,
    small: changedLevelKey === "small" ? changedVal : 0,
  };
  const changedBase = stockTakeCountsToBase(changedOnly, uom);
  const factor = uomConversionFactor(uom);
  const midFactor = Number(uom?.middle_factor ?? 0);

  if (changedBase > max + 0.0001) {
    const capped = { full: 0, middle: 0, small: 0 };
    if (changedLevelKey === "full" && factor > 1) {
      capped.full = Math.floor(max / factor + 0.0001);
    } else if (changedLevelKey === "middle" && uomHasMiddlePack(uom) && midFactor > 1) {
      capped.middle = Math.floor(max / midFactor + 0.0001);
    } else {
      capped.small = max;
    }
    return capped;
  }

  let budget = max - changedBase;

  for (const key of ["full", "middle", "small"]) {
    if (key === changedLevelKey) continue;

    if (key === "full" && factor > 1) {
      const maxFull = Math.floor(budget / factor + 0.0001);
      result.full = Math.min(result.full, maxFull);
      budget -= result.full * factor;
    } else if (key === "middle" && uomHasMiddlePack(uom) && midFactor > 1) {
      const maxMiddle = Math.floor(budget / midFactor + 0.0001);
      result.middle = Math.min(result.middle, maxMiddle);
      budget -= result.middle * midFactor;
    } else if (key === "small") {
      result.small = Math.min(result.small, Math.max(0, budget));
      budget -= result.small;
    }
  }

  return result;
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

/** e.g. "2 Bag, 40 kg" or "1 Carton, 3 Outers, 5 pcs" */
export function formatMixedStockDisplay(baseQty, uomOrFactor, packLabel) {
  const uom =
    uomOrFactor != null && typeof uomOrFactor === "object"
      ? uomOrFactor
      : { conversion_factor: uomOrFactor, full_name: packLabel };
  const factor = uomConversionFactor(uom);
  const hierarchy = splitBaseToHierarchy(baseQty, uom);
  const text = hierarchy.map((p) => `${formatDisplayQty(p.qty)} ${p.label}`).join(", ");

  const packs = factor > 1 ? (hierarchy[0]?.qty ?? 0) : 0;
  const loose =
    factor <= 1
      ? Number(baseQty ?? 0)
      : (hierarchy.find((p) => p.label === smallPackagingLabel(uom))?.qty ?? 0);

  return {
    display: baseToDisplayQty(baseQty, factor),
    base: Number(baseQty ?? 0),
    factor,
    unit: fullPackageLabel(uom, packLabel),
    packs,
    loose,
    parts: hierarchy,
    text: text || `0 ${smallPackagingLabel(uom)}`,
  };
}

/** Compact cart qty from stored base (smallest UOM) — display only, not used for stock. */
export function formatPosCartQty(baseQty, uom) {
  const parts = splitBaseToHierarchy(baseQty, uom).filter((p) => p.qty > 0.0001);
  if (!parts.length) {
    const factor = uomConversionFactor(uom);
    const label = factor > 1 ? fullPackageLabel(uom) : smallPackagingLabel(uom);
    return `0 ${label}`;
  }
  return parts.map((p) => `${formatDisplayQty(p.qty)} ${p.label}`).join(", ");
}

/** @deprecated use formatPosCartQty */
export function formatSmallUnitTotal(baseQty, uom) {
  return formatPosCartQty(baseQty, uom);
}
