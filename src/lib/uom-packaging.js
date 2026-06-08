/** UOM packaging hierarchy helpers (full / middle / small). */

/** Category + default small-unit label for each UOM type. */
export const UOM_TYPE_DEFINITIONS = [
  { value: "piece", category: "count", defaultSmall: "piece" },
  { value: "carton", category: "count", defaultSmall: "piece" },
  { value: "bag", category: "count", defaultSmall: "kg" },
  { value: "bale", category: "count", defaultSmall: "piece" },
  { value: "box", category: "count", defaultSmall: "piece" },
  { value: "crate", category: "count", defaultSmall: "piece" },
  { value: "bundle", category: "count", defaultSmall: "piece" },
  { value: "dozen", category: "count", defaultSmall: "piece" },
  { value: "pack", category: "count", defaultSmall: "piece" },
  { value: "pallet", category: "count", defaultSmall: "piece" },
  { value: "roll", category: "count", defaultSmall: "piece" },
  { value: "sheet", category: "count", defaultSmall: "piece" },
  { value: "kg", category: "weight", defaultSmall: "kg" },
  { value: "g", category: "weight", defaultSmall: "g" },
  { value: "tonne", category: "weight", defaultSmall: "kg" },
  { value: "lb", category: "weight", defaultSmall: "lb" },
  { value: "l", category: "volume", defaultSmall: "litres" },
  { value: "litre", category: "volume", defaultSmall: "litres" },
  { value: "ml", category: "volume", defaultSmall: "ml" },
  { value: "m", category: "length", defaultSmall: "m" },
  { value: "cm", category: "length", defaultSmall: "cm" },
];

const UOM_TYPE_BY_VALUE = Object.fromEntries(
  UOM_TYPE_DEFINITIONS.map((d) => [d.value, d]),
);

const CATEGORY_LABELS = {
  count: "count",
  weight: "weight",
  volume: "volume",
  length: "length",
};

export const UOM_TYPE_OPTIONS = UOM_TYPE_DEFINITIONS.map((d) => ({
  value: d.value,
  label: `${d.value} — ${CATEGORY_LABELS[d.category] ?? d.category}`,
}));

export const UOM_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "count", label: "Count" },
  { value: "weight", label: "Weight" },
  { value: "volume", label: "Volume" },
  { value: "length", label: "Length" },
];

export function uomCategory(uomType) {
  const t = String(uomType ?? "").toLowerCase();
  const def = UOM_TYPE_BY_VALUE[t];
  if (def) return def.category;

  if (["piece", "pcs", "unit", "count"].includes(t)) return "count";
  if (["kilogram", "gram"].includes(t)) return "weight";
  if (["liter", "millilitre", "milliliter"].includes(t)) return "volume";
  if (["meter", "metre", "mm"].includes(t)) return "length";
  return "other";
}

export function defaultSmallLabelForType(uomType) {
  const t = String(uomType ?? "").toLowerCase();
  const def = UOM_TYPE_BY_VALUE[t];
  if (def) return def.defaultSmall;
  if (t === "bag") return "kg";
  if (["kg", "kilogram"].includes(t)) return "kg";
  if (["l", "litre", "liter"].includes(t)) return "litres";
  if (["piece", "pcs"].includes(t)) return "piece";
  return t || "piece";
}

export function uomHasMiddlePack(uom) {
  return Boolean(middlePackagingLabel(uom) && Number(uom?.middle_factor ?? 0) > 1);
}

export function uomHasFullPack(uom) {
  return Number(uom?.conversion_factor ?? 1) > 1;
}

/**
 * Packaging levels used when counting stock (stock take, reconciliation).
 * - Small unit only (factor 1): count in {piece, kg, …}
 * - Full + middle + small: e.g. bale, outers, pieces (3 fields)
 * - Full + small (no middle): e.g. bag + kg, carton + pieces (2 fields)
 */
export function uomStockTakeLevels(uom) {
  if (!uomHasFullPack(uom)) {
    return [{ level: "small", key: "small", label: smallPackagingLabel(uom) }];
  }

  const levels = [{ level: "full", key: "full", label: fullPackageLabel(uom) }];

  if (uomHasMiddlePack(uom)) {
    levels.push({ level: "middle", key: "middle", label: middlePackagingLabel(uom) });
  }

  levels.push({ level: "small", key: "small", label: smallPackagingLabel(uom) });
  return levels;
}

export function uomStockTakeHint(uom) {
  const levels = uomStockTakeLevels(uom);
  if (levels.length === 1) {
    return `Count in ${levels[0].label} only.`;
  }
  if (levels.length === 2) {
    return `Count ${levels[0].label} and any remaining ${levels[1].label}.`;
  }
  return `Count ${levels.map((l) => l.label).join(", ")}.`;
}

export function smallPackagingLabel(uom) {
  if (!uom) return "pcs";
  return (uom.small_packaging_label || uom.uom_type || "pcs").trim();
}

export function fullPackageLabel(uom, fallback = "pack") {
  return (uom?.full_name || fallback || "pack").trim();
}

export function middlePackagingLabel(uom) {
  return uom?.middle_packaging_label?.trim() || null;
}

/** Measure levels available for retail pricing tiers (from product UOM). */
export function uomMeasureLevels(uom) {
  if (!uom) {
    return [{ level: "small", label: "pcs" }];
  }

  const levels = [{ level: "small", label: smallPackagingLabel(uom) }];
  const middle = middlePackagingLabel(uom);
  if (middle) {
    levels.push({ level: "middle", label: middle });
  }
  if (Number(uom.conversion_factor ?? 1) > 1) {
    levels.push({ level: "full", label: fullPackageLabel(uom) });
  }
  return levels;
}

export function measureLevelLabel(uom, level) {
  const match = uomMeasureLevels(uom).find((l) => l.level === level);
  return match?.label ?? level;
}

export const EMPTY_PRICING_TIER = {
  min_qty: "",
  max_qty: "",
  measure_level: "small",
  markup_price: "",
};

/** API / DB may return tiers as an array, JSON string, or keyed object. */
export function coercePricingTiersInput(tiers) {
  if (tiers == null) return [];
  if (Array.isArray(tiers)) return tiers;

  if (typeof tiers === "string") {
    const trimmed = tiers.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return Object.values(parsed);
      return [];
    } catch {
      return [];
    }
  }

  if (typeof tiers === "object") return Object.values(tiers);
  return [];
}

export function normalizePricingTiers(tiers) {
  return coercePricingTiersInput(tiers).map((t) => ({
    min_qty: t.min_qty ?? "",
    max_qty: t.max_qty ?? "",
    measure_level: t.measure_level ?? "small",
    markup_price: t.markup_price ?? "",
  }));
}

export function pricingTiersToApi(tiers) {
  return coercePricingTiersInput(tiers)
    .filter((t) => t.min_qty !== "" && t.min_qty != null)
    .map((t) => ({
      min_qty: Number(t.min_qty),
      max_qty: t.max_qty === "" || t.max_qty == null ? null : Number(t.max_qty),
      measure_level: t.measure_level || "small",
      markup_price: Number(t.markup_price ?? 0),
    }));
}

export function uomMeasureName(uom) {
  return uom?.measure_name?.trim() || null;
}

/** True when small-unit qty should be whole numbers (pieces, cartons, etc.). */
export function uomSmallUnitIsWholeNumber(uom) {
  const small = smallPackagingLabel(uom).toLowerCase();
  if (["piece", "pieces", "pcs", "pc", "unit", "units", "dozen"].includes(small)) {
    return true;
  }
  return uomCategory(uom?.uom_type) === "count";
}

/** e.g. "1 bale = 12 pcs · 1 outer = 10 pcs" */
export function uomConversionSummary(uom) {
  const factor = Number(uom?.conversion_factor ?? 1);
  if (factor <= 1) return null;

  const full = fullPackageLabel(uom);
  const small = smallPackagingLabel(uom);
  const factorText = uomSmallUnitIsWholeNumber(uom)
    ? String(Math.round(factor))
    : String(factor);

  const parts = [`1 ${full} = ${factorText} ${small}`];

  if (uomHasMiddlePack(uom)) {
    const mid = Number(uom.middle_factor ?? 0);
    parts.push(`1 ${middlePackagingLabel(uom)} = ${mid} ${small}`);
  }

  return parts.join(" · ");
}

/** Human-readable chain e.g. "Sugars: Bale → outer → piece" */
export function uomHierarchyChain(uom) {
  if (!uom) return "piece";
  const parts = [smallPackagingLabel(uom)];
  if (uomHasMiddlePack(uom)) {
    parts.unshift(middlePackagingLabel(uom));
  }
  if (uomHasFullPack(uom)) {
    parts.unshift(fullPackageLabel(uom));
  }
  const chain = parts.join(" → ");
  const name = uomMeasureName(uom);
  return name ? `${name}: ${chain}` : chain;
}

/** Build a UOM-like object from the form for live preview. */
export function uomFromForm(form) {
  const hasMiddle = Boolean(form.has_middle_pack && form.middle_packaging_label?.trim());
  return {
    full_name: form.full_name,
    measure_name: form.measure_name?.trim() || null,
    small_packaging_label: form.small_packaging_label || defaultSmallLabelForType(form.uom_type),
    middle_packaging_label: hasMiddle ? form.middle_packaging_label.trim() : null,
    middle_factor: hasMiddle && form.middle_factor !== "" ? Number(form.middle_factor) : null,
    conversion_factor: Number(form.conversion_factor ?? 1),
    uom_type: form.uom_type,
  };
}

/** Example stock lines for the UOM editor (always uses sensible whole-number remainders). */
export function uomStockReportExamples(uom) {
  const small = smallPackagingLabel(uom);
  const full = fullPackageLabel(uom);
  const factor = Number(uom?.conversion_factor ?? 1);
  const mid = Number(uom?.middle_factor ?? 0);
  const hasMiddle = uomHasMiddlePack(uom);
  const wholeSmall = uomSmallUnitIsWholeNumber(uom);

  if (factor <= 1) {
    return [{ base: 25, note: `Stock counted in ${small} only` }];
  }

  const loose = wholeSmall
    ? Math.min(10, Math.max(1, Math.floor(factor) - 1))
    : Math.min(10, Math.max(1, factor * 0.2));
  const baseWithRemainder = Math.floor(factor) + loose;

  const examples = [
    {
      base: factor,
      note: `Exactly 1 ${full} (${factor} ${small})`,
    },
    {
      base: baseWithRemainder,
      note: `${baseWithRemainder} ${small} in stock`,
    },
  ];

  if (hasMiddle) {
    const midLoose = wholeSmall ? 2 : 2;
    examples.push({
      base: factor + mid * 10 + midLoose,
      note: `Full + middle + ${small}`,
    });
  }

  return examples;
}

