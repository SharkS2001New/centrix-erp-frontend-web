import { normalizeOrgPrintFontSizePx, normalizeOrgPrintFontWeight, ORG_PRINT_FONT_WEIGHT_DEFAULT } from "@/lib/print-typography";

/** Admin form / API keys for each printable document type. */
export const PRINT_FONT_VARIANTS = {
  receipt: {
    label: "Thermal receipt",
    typographyVariant: "thermal",
    defaultFamily: "arial",
    defaultScale: "standard",
    defaultSizePx: 11,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
  },
  invoice: {
    label: "A4 invoice",
    typographyVariant: "sale_invoice",
    defaultFamily: "times",
    defaultScale: "standard",
    defaultSizePx: 14,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
  },
  lpo: {
    label: "LPO",
    typographyVariant: "lpo",
    defaultFamily: "times",
    defaultScale: "standard",
    defaultSizePx: 14,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
  },
  loading_sheet: {
    label: "Loading sheet",
    typographyVariant: "loading_sheet",
    defaultFamily: "arial",
    defaultScale: "standard",
    defaultSizePx: 16,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
  },
  report: {
    label: "Reports",
    typographyVariant: "report",
    defaultFamily: "times",
    defaultScale: "standard",
    defaultSizePx: 14,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    fallbackVariant: "invoice",
  },
};

export const PRINT_FONT_VARIANT_KEYS = Object.keys(PRINT_FONT_VARIANTS);

export function printFontFormKeys(variantKey) {
  return {
    family: `print_font_${variantKey}_family`,
    scale: `print_font_${variantKey}_scale`,
    sizePx: `print_font_${variantKey}_size_px`,
    weight: `print_font_${variantKey}_weight`,
  };
}

function legacyPrintFont(general = {}) {
  return {
    family: general.print_font_family,
    scale: general.print_font_scale,
    size_px: general.print_font_size_px,
    weight: general.print_font_weight,
  };
}

function resolvedVariantFont(general, variantKey, visited = new Set()) {
  const config = PRINT_FONT_VARIANTS[variantKey];
  if (!config || visited.has(variantKey)) return null;
  visited.add(variantKey);

  const keys = printFontFormKeys(variantKey);
  const family = general?.[keys.family];
  const scale = general?.[keys.scale];
  const sizePx = general?.[keys.sizePx];
  const weight = general?.[keys.weight];

  if (family || scale || sizePx != null || weight) {
    return {
      family: family || config.defaultFamily,
      scale: scale || config.defaultScale,
      size_px: sizePx ?? config.defaultSizePx,
      weight: normalizeOrgPrintFontWeight(weight ?? config.defaultWeight),
    };
  }

  if (config.fallbackVariant) {
    const fallback = resolvedVariantFont(general, config.fallbackVariant, visited);
    if (fallback) return fallback;
  }

  return null;
}

/** Resolve font family / scale / size for a typography variant (thermal, sale_invoice, …). */
export function resolveOrgPrintFontSettings(generalSettings = null, typographyVariant = "a4") {
  const settingKey =
    Object.entries(PRINT_FONT_VARIANTS).find(
      ([, config]) => config.typographyVariant === typographyVariant,
    )?.[0] ?? "invoice";

  const config = PRINT_FONT_VARIANTS[settingKey] ?? PRINT_FONT_VARIANTS.invoice;
  const specific = resolvedVariantFont(generalSettings ?? {}, settingKey);
  const legacy = legacyPrintFont(generalSettings ?? {});

  const family =
    specific?.family ??
    (legacy.family || null) ??
    config.defaultFamily;
  const scale =
    specific?.scale ??
    (legacy.scale || null) ??
    config.defaultScale;
  const size_px = normalizeOrgPrintFontSizePx(
    specific?.size_px ?? legacy.size_px ?? config.defaultSizePx,
  );
  const weight = normalizeOrgPrintFontWeight(
    specific?.weight ?? legacy.weight ?? config.defaultWeight,
  );

  return { family, scale, size_px: size_px, weight, settingKey, typographyVariant };
}

export function printFontFormDefaults() {
  const defaults = {
    print_font_family: "times",
    print_font_scale: "standard",
    print_font_size_px: "14",
    print_font_weight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
  };

  for (const [variantKey, config] of Object.entries(PRINT_FONT_VARIANTS)) {
    const keys = printFontFormKeys(variantKey);
    defaults[keys.family] = config.defaultFamily;
    defaults[keys.scale] = config.defaultScale;
    defaults[keys.sizePx] = String(config.defaultSizePx);
    defaults[keys.weight] = config.defaultWeight;
  }

  return defaults;
}

export function printFontFormFromGeneral(general = {}) {
  const merged = { ...printFontFormDefaults(), ...general };
  const result = {
    print_font_family: merged.print_font_family ?? "times",
    print_font_scale: merged.print_font_scale ?? "standard",
    print_font_size_px: String(merged.print_font_size_px ?? 14),
    print_font_weight: normalizeOrgPrintFontWeight(merged.print_font_weight),
  };

  for (const variantKey of PRINT_FONT_VARIANT_KEYS) {
    const keys = printFontFormKeys(variantKey);
    const config = PRINT_FONT_VARIANTS[variantKey];
    const resolved = resolvedVariantFont(merged, variantKey);
    result[keys.family] =
      resolved?.family ?? merged.print_font_family ?? config.defaultFamily;
    result[keys.scale] =
      resolved?.scale ?? merged.print_font_scale ?? config.defaultScale;
    result[keys.sizePx] = String(
      normalizeOrgPrintFontSizePx(
        resolved?.size_px ?? merged.print_font_size_px ?? config.defaultSizePx,
      ),
    );
    result[keys.weight] = normalizeOrgPrintFontWeight(
      resolved?.weight ?? merged.print_font_weight ?? config.defaultWeight,
    );
  }

  return result;
}

export function printFontPayloadFromForm(form = {}) {
  const payload = {
    print_font_family: form.print_font_invoice_family || form.print_font_family || "times",
    print_font_scale: form.print_font_invoice_scale || form.print_font_scale || "standard",
    print_font_size_px: normalizeOrgPrintFontSizePx(
      form.print_font_invoice_size_px ?? form.print_font_size_px,
    ),
    print_font_weight: normalizeOrgPrintFontWeight(
      form.print_font_invoice_weight ?? form.print_font_weight,
    ),
  };

  for (const variantKey of PRINT_FONT_VARIANT_KEYS) {
    const keys = printFontFormKeys(variantKey);
    const config = PRINT_FONT_VARIANTS[variantKey];
    payload[keys.family] = form[keys.family] || config.defaultFamily;
    payload[keys.scale] = form[keys.scale] || config.defaultScale;
    payload[keys.sizePx] = normalizeOrgPrintFontSizePx(form[keys.sizePx] ?? config.defaultSizePx);
    payload[keys.weight] = normalizeOrgPrintFontWeight(form[keys.weight] ?? config.defaultWeight);
  }

  return payload;
}

/** Merge live preview / print form values into general settings for a document type. */
export function mergePreviewGeneralWithPrintFonts(form, moduleSettings, typographyVariant) {
  const base = {
    ...(moduleSettings?.general ?? {}),
    ...(form ?? {}),
    ...printFontPayloadFromForm(form ?? {}),
  };
  const resolved = resolveOrgPrintFontSettings(base, typographyVariant);
  const keys = printFontFormKeys(resolved.settingKey);
  return {
    ...base,
    print_font_family: resolved.family,
    print_font_scale: resolved.scale,
    print_font_size_px: resolved.size_px,
    print_font_weight: resolved.weight,
    [keys.family]: resolved.family,
    [keys.scale]: resolved.scale,
    [keys.sizePx]: resolved.size_px,
    [keys.weight]: resolved.weight,
  };
}
