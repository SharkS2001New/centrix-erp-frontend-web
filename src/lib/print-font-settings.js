import {
  normalizeOrgPrintFontSizePx,
  normalizeOrgPrintFontWeight,
  ORG_PRINT_FONT_WEIGHT_DEFAULT,
} from "@/lib/print-typography";

/** Admin form / API keys for each printable document type. */
export const PRINT_FONT_VARIANTS = {
  receipt: {
    label: "Thermal receipt",
    typographyVariant: "thermal",
    defaultFamily: "arial",
    defaultScale: "standard",
    defaultSizePx: 11,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultHeaderScale: "large",
    defaultHeaderWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultFooterScale: "standard",
    defaultFooterWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
  },
  invoice: {
    label: "A4 invoice",
    typographyVariant: "sale_invoice",
    defaultFamily: "times",
    defaultScale: "standard",
    defaultSizePx: 14,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultHeaderScale: "large",
    defaultHeaderWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultFooterScale: "standard",
    defaultFooterWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
  },
  lpo: {
    label: "LPO",
    typographyVariant: "lpo",
    defaultFamily: "times",
    defaultScale: "standard",
    defaultSizePx: 14,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultHeaderScale: "large",
    defaultHeaderWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultFooterScale: "standard",
    defaultFooterWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
  },
  loading_sheet: {
    label: "Loading sheet",
    typographyVariant: "loading_sheet",
    defaultFamily: "arial",
    defaultScale: "standard",
    defaultSizePx: 16,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultHeaderScale: "large",
    defaultHeaderWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultFooterScale: "standard",
    defaultFooterWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
  },
  picking_list: {
    label: "Picking list",
    typographyVariant: "picking_list",
    defaultFamily: "arial",
    defaultScale: "standard",
    defaultSizePx: 16,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultHeaderScale: "large",
    defaultHeaderWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultFooterScale: "standard",
    defaultFooterWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    fallbackVariant: "loading_sheet",
  },
  trip_chart: {
    label: "Trip chart list",
    typographyVariant: "trip_chart",
    defaultFamily: "arial",
    defaultScale: "standard",
    defaultSizePx: 16,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultHeaderScale: "large",
    defaultHeaderWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultFooterScale: "standard",
    defaultFooterWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    fallbackVariant: "loading_sheet",
  },
  report: {
    label: "Reports",
    typographyVariant: "report",
    defaultFamily: "times",
    defaultScale: "standard",
    defaultSizePx: 14,
    defaultWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultHeaderScale: "large",
    defaultHeaderWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    defaultFooterScale: "standard",
    defaultFooterWeight: ORG_PRINT_FONT_WEIGHT_DEFAULT,
    fallbackVariant: "invoice",
  },
};

export const PRINT_FONT_VARIANT_KEYS = Object.keys(PRINT_FONT_VARIANTS);

function variantDefaultHeaderSizePx(config) {
  return config.defaultHeaderSizePx ?? config.defaultSizePx;
}

function variantDefaultFooterSizePx(config) {
  return config.defaultFooterSizePx ?? Math.max(8, config.defaultSizePx - 2);
}

export function printFontFormKeys(variantKey) {
  return {
    family: `print_font_${variantKey}_family`,
    scale: `print_font_${variantKey}_scale`,
    sizePx: `print_font_${variantKey}_size_px`,
    weight: `print_font_${variantKey}_weight`,
    headerScale: `print_font_${variantKey}_header_scale`,
    headerSizePx: `print_font_${variantKey}_header_size_px`,
    headerWeight: `print_font_${variantKey}_header_weight`,
    footerScale: `print_font_${variantKey}_footer_scale`,
    footerSizePx: `print_font_${variantKey}_footer_size_px`,
    footerWeight: `print_font_${variantKey}_footer_weight`,
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

function readSectionSettings(general, variantKey, section, bodyResolved) {
  const config = PRINT_FONT_VARIANTS[variantKey];
  const keys = printFontFormKeys(variantKey);
  const prefix = section === "header" ? "header" : section === "footer" ? "footer" : null;

  if (!prefix) {
    return bodyResolved;
  }

  const scaleKey = keys[`${prefix}Scale`];
  const sizeKey = keys[`${prefix}SizePx`];
  const weightKey = keys[`${prefix}Weight`];
  const defaultScaleKey = `default${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}Scale`;
  const defaultWeightKey = `default${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}Weight`;

  const scale = general?.[scaleKey] || config?.[defaultScaleKey] || bodyResolved.scale;
  const size_px = normalizeOrgPrintFontSizePx(
    general?.[sizeKey] ?? bodyResolved.size_px ?? config?.defaultSizePx,
  );
  const weight = normalizeOrgPrintFontWeight(
    general?.[weightKey] ?? config?.[defaultWeightKey] ?? bodyResolved.weight,
  );

  return {
    family: bodyResolved.family,
    scale,
    size_px,
    weight,
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
  const hasHeaderFooter =
    general?.[keys.headerScale] ||
    general?.[keys.headerSizePx] != null ||
    general?.[keys.headerWeight] ||
    general?.[keys.footerScale] ||
    general?.[keys.footerSizePx] != null ||
    general?.[keys.footerWeight];

  if (family || scale || sizePx != null || weight || hasHeaderFooter) {
    const body = {
      family: family || config.defaultFamily,
      scale: scale || config.defaultScale,
      size_px: sizePx ?? config.defaultSizePx,
      weight: normalizeOrgPrintFontWeight(weight ?? config.defaultWeight),
    };
    return body;
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

  return { family, scale, size_px, weight, settingKey, typographyVariant };
}

export function resolveOrgPrintSectionSettings(
  generalSettings = null,
  typographyVariant = "a4",
  section = "body",
) {
  const body = resolveOrgPrintFontSettings(generalSettings, typographyVariant);
  const general = generalSettings ?? {};
  return readSectionSettings(general, body.settingKey, section, body);
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
    defaults[keys.headerScale] = config.defaultHeaderScale;
    defaults[keys.headerSizePx] = String(variantDefaultHeaderSizePx(config));
    defaults[keys.headerWeight] = config.defaultHeaderWeight;
    defaults[keys.footerScale] = config.defaultFooterScale;
    defaults[keys.footerSizePx] = String(variantDefaultFooterSizePx(config));
    defaults[keys.footerWeight] = config.defaultFooterWeight;
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
    result[keys.headerScale] =
      merged[keys.headerScale] ?? config.defaultHeaderScale;
    result[keys.headerSizePx] = String(
      normalizeOrgPrintFontSizePx(
        merged[keys.headerSizePx] ?? variantDefaultHeaderSizePx(config),
      ),
    );
    result[keys.headerWeight] = normalizeOrgPrintFontWeight(
      merged[keys.headerWeight] ?? config.defaultHeaderWeight,
    );
    result[keys.footerScale] =
      merged[keys.footerScale] ?? config.defaultFooterScale;
    result[keys.footerSizePx] = String(
      normalizeOrgPrintFontSizePx(
        merged[keys.footerSizePx] ?? variantDefaultFooterSizePx(config),
      ),
    );
    result[keys.footerWeight] = normalizeOrgPrintFontWeight(
      merged[keys.footerWeight] ?? config.defaultFooterWeight,
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
    payload[keys.headerScale] = form[keys.headerScale] || config.defaultHeaderScale;
    payload[keys.headerSizePx] = normalizeOrgPrintFontSizePx(
      form[keys.headerSizePx] ?? variantDefaultHeaderSizePx(config),
    );
    payload[keys.headerWeight] = normalizeOrgPrintFontWeight(
      form[keys.headerWeight] ?? config.defaultHeaderWeight,
    );
    payload[keys.footerScale] = form[keys.footerScale] || config.defaultFooterScale;
    payload[keys.footerSizePx] = normalizeOrgPrintFontSizePx(
      form[keys.footerSizePx] ?? variantDefaultFooterSizePx(config),
    );
    payload[keys.footerWeight] = normalizeOrgPrintFontWeight(
      form[keys.footerWeight] ?? config.defaultFooterWeight,
    );
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
    [keys.headerScale]: base[keys.headerScale],
    [keys.headerSizePx]: base[keys.headerSizePx],
    [keys.headerWeight]: base[keys.headerWeight],
    [keys.footerScale]: base[keys.footerScale],
    [keys.footerSizePx]: base[keys.footerSizePx],
    [keys.footerWeight]: base[keys.footerWeight],
  };
}
