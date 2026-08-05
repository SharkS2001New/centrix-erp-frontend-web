/** Per-document logo show / position / size for printouts. */

export const DOCUMENT_LOGO_POSITIONS = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "center", label: "Center (above company)" },
];

export const DOCUMENT_LOGO_SIZES = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
  { id: "extra_large", label: "Extra large" },
];

/** CSS max dimensions for A4 / professional headers (Menengai-style prominence). */
export const DOCUMENT_LOGO_A4_SIZE_PX = {
  small: { maxHeight: 72, maxWidth: 180 },
  medium: { maxHeight: 96, maxWidth: 220 },
  large: { maxHeight: 128, maxWidth: 280 },
  extra_large: { maxHeight: 160, maxWidth: 340 },
};

/** CSS max dimensions for thermal receipts. */
export const DOCUMENT_LOGO_THERMAL_SIZE_PX = {
  small: { maxHeight: 24, maxWidth: 120 },
  medium: { maxHeight: 34, maxWidth: 160 },
  large: { maxHeight: 48, maxWidth: 200 },
  extra_large: { maxHeight: 60, maxWidth: 220 },
};

/**
 * @typedef {{ label: string, defaultShow: boolean, defaultPosition: string, defaultSize: string, positions?: string[] }} DocumentLogoVariant
 */

/** @type {Record<string, DocumentLogoVariant>} */
export const DOCUMENT_LOGO_VARIANTS = {
  receipt: {
    label: "Thermal receipt",
    defaultShow: false,
    defaultPosition: "center",
    defaultSize: "small",
    positions: ["center", "left", "right"],
  },
  hospitality_check: {
    label: "Hotel check receipt",
    defaultShow: false,
    defaultPosition: "center",
    defaultSize: "small",
    positions: ["center", "left", "right"],
  },
  invoice: {
    label: "A4 invoice",
    defaultShow: true,
    defaultPosition: "right",
    defaultSize: "large",
  },
  proforma: {
    label: "Proforma invoice",
    defaultShow: true,
    defaultPosition: "right",
    defaultSize: "large",
    /** Commercial PFI logos; "small" is omitted (legacy small maps to large). */
    sizes: ["medium", "large", "extra_large"],
  },
  lpo: {
    label: "LPO",
    defaultShow: true,
    defaultPosition: "right",
    defaultSize: "medium",
  },
  loading_sheet: {
    label: "Loading sheet",
    defaultShow: true,
    defaultPosition: "center",
    defaultSize: "medium",
  },
  picking_list: {
    label: "Picking list",
    defaultShow: true,
    defaultPosition: "center",
    defaultSize: "medium",
  },
  trip_chart: {
    label: "Trip chart list",
    defaultShow: true,
    defaultPosition: "center",
    defaultSize: "medium",
  },
  payroll_receipt: {
    label: "Payroll receipt",
    defaultShow: true,
    defaultPosition: "center",
    defaultSize: "medium",
  },
};

export const DOCUMENT_LOGO_VARIANT_KEYS = Object.keys(DOCUMENT_LOGO_VARIANTS);

export function documentLogoFormKeys(variantKey) {
  return {
    show: `print_logo_${variantKey}_show`,
    position: `print_logo_${variantKey}_position`,
    size: `print_logo_${variantKey}_size`,
  };
}

export function normalizeDocumentLogoPosition(value, variantKey = "invoice") {
  const allowed =
    DOCUMENT_LOGO_VARIANTS[variantKey]?.positions ??
    DOCUMENT_LOGO_POSITIONS.map((row) => row.id);
  const fallback = DOCUMENT_LOGO_VARIANTS[variantKey]?.defaultPosition ?? "right";
  return allowed.includes(value) ? value : fallback;
}

export function normalizeDocumentLogoSize(value, variantKey = "invoice") {
  const config = DOCUMENT_LOGO_VARIANTS[variantKey];
  const allowed = config?.sizes ?? DOCUMENT_LOGO_SIZES.map((row) => row.id);
  const fallback = config?.defaultSize ?? "medium";
  return allowed.includes(value) ? value : fallback;
}

/**
 * @returns {{ show: boolean, position: string, size: string }}
 */
export function resolveDocumentLogoSettings(generalSettings = {}, variantKey = "invoice") {
  const config = DOCUMENT_LOGO_VARIANTS[variantKey] ?? DOCUMENT_LOGO_VARIANTS.invoice;
  const keys = documentLogoFormKeys(variantKey);
  const raw = generalSettings ?? {};
  const showRaw = raw[keys.show];
  return {
    show: showRaw === undefined || showRaw === null ? config.defaultShow : Boolean(showRaw),
    position: normalizeDocumentLogoPosition(raw[keys.position], variantKey),
    size: normalizeDocumentLogoSize(raw[keys.size], variantKey),
  };
}

/**
 * Apply per-document logo show flag onto resolved branding display.
 * Position/size are attached as `logoLayout` for header builders.
 */
export function brandingWithDocumentLogo(branding, generalSettings, variantKey) {
  if (!branding) return branding;
  const logoLayout = resolveDocumentLogoSettings(generalSettings, variantKey);
  let display = branding.display;

  if (!logoLayout.show) {
    if (display === "logo" || display === "logo_and_name") {
      display = "name";
    }
  } else if (branding.logoUrl) {
    if (display === "name") {
      display = "logo_and_name";
    } else if (display !== "logo" && display !== "logo_and_name") {
      display = "logo_and_name";
    }
  }

  return {
    ...branding,
    display,
    logoLayout,
  };
}

export function documentLogoFormDefaults() {
  const out = {};
  for (const key of DOCUMENT_LOGO_VARIANT_KEYS) {
    const config = DOCUMENT_LOGO_VARIANTS[key];
    const keys = documentLogoFormKeys(key);
    out[keys.show] = config.defaultShow;
    out[keys.position] = config.defaultPosition;
    out[keys.size] = config.defaultSize;
  }
  return out;
}

export function documentLogoFormFromGeneral(general = {}) {
  const out = {};
  for (const key of DOCUMENT_LOGO_VARIANT_KEYS) {
    const resolved = resolveDocumentLogoSettings(general, key);
    const keys = documentLogoFormKeys(key);
    out[keys.show] = resolved.show;
    out[keys.position] = resolved.position;
    out[keys.size] = resolved.size;
  }
  return out;
}

export function documentLogoPayloadFromForm(form = {}) {
  const out = {};
  for (const key of DOCUMENT_LOGO_VARIANT_KEYS) {
    const resolved = resolveDocumentLogoSettings(form, key);
    const keys = documentLogoFormKeys(key);
    out[keys.show] = Boolean(resolved.show);
    out[keys.position] = resolved.position;
    out[keys.size] = resolved.size;
  }
  return out;
}

export function documentLogoSizeCss(size, layout = "a4") {
  const table = layout === "thermal" ? DOCUMENT_LOGO_THERMAL_SIZE_PX : DOCUMENT_LOGO_A4_SIZE_PX;
  const dims = table[size] ?? table.medium;
  return `max-height:${dims.maxHeight}px;max-width:${dims.maxWidth}px;`;
}
