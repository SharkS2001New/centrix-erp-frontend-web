import { resolveOrgPrintFontSettings, resolveOrgPrintSectionSettings } from "@/lib/print-font-settings";

export const ORG_PRINT_FONT_FAMILIES = [
  { id: "times", label: "Times New Roman", css: "'Times New Roman', Times, serif" },
  { id: "georgia", label: "Georgia", css: "Georgia, 'Times New Roman', serif" },
  { id: "palatino", label: "Palatino Linotype", css: "'Palatino Linotype', Palatino, serif" },
  { id: "garamond", label: "Garamond", css: "Garamond, 'Times New Roman', serif" },
  { id: "book_antiqua", label: "Book Antiqua", css: "'Book Antiqua', Palatino, serif" },
  { id: "cambria", label: "Cambria", css: "Cambria, Georgia, serif" },
  { id: "constantia", label: "Constantia", css: "Constantia, Georgia, serif" },
  { id: "arial", label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { id: "helvetica", label: "Helvetica", css: "Helvetica, Arial, sans-serif" },
  { id: "verdana", label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { id: "tahoma", label: "Tahoma", css: "Tahoma, Geneva, sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", css: "'Trebuchet MS', Helvetica, sans-serif" },
  { id: "calibri", label: "Calibri", css: "Calibri, 'Segoe UI', sans-serif" },
  { id: "segoe_ui", label: "Segoe UI", css: "'Segoe UI', system-ui, sans-serif" },
  { id: "aptos", label: "Aptos", css: "Aptos, 'Segoe UI', Calibri, sans-serif" },
  { id: "lucida_sans", label: "Lucida Sans", css: "'Lucida Sans', 'Lucida Grande', sans-serif" },
  { id: "franklin_gothic", label: "Franklin Gothic", css: "'Franklin Gothic Medium', Arial, sans-serif" },
  { id: "century_gothic", label: "Century Gothic", css: "'Century Gothic', Arial, sans-serif" },
  { id: "courier", label: "Courier New", css: "'Courier New', Courier, monospace" },
  { id: "lucida_console", label: "Lucida Console", css: "'Lucida Console', 'Courier New', monospace" },
  { id: "system", label: "System sans-serif", css: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
];

export const ORG_PRINT_FONT_SCALES = [
  { id: "compact", label: "Compact", multiplier: 0.9 },
  { id: "standard", label: "Standard (recommended)", multiplier: 1 },
  { id: "large", label: "Large", multiplier: 1.15 },
  { id: "extra_large", label: "Extra large", multiplier: 1.3 },
  { id: "custom", label: "Custom size" },
];

export const ORG_PRINT_FONT_SIZE_LIMITS = { min: 8, max: 24, default: 14 };

export const ORG_PRINT_FONT_WEIGHTS = [
  { id: "normal", label: "Normal", value: 400 },
  { id: "medium", label: "Medium", value: 500 },
  { id: "semibold", label: "Semibold (recommended)", value: 600 },
  { id: "bold", label: "Bold", value: 700 },
  { id: "extra_bold", label: "Extra bold", value: 800 },
];

export const ORG_PRINT_FONT_WEIGHT_DEFAULT = "semibold";

export const ORG_PRINT_SECTIONS = ["header", "body", "footer"];

const VARIANT_BODY_BASE = {
  a4: { screen: 12, print: 15 },
  sale_invoice: { screen: 12, print: 15 },
  lpo: { screen: 12, print: 15 },
  loading_sheet: { screen: 12, print: 16 },
  thermal: { screen: 10, print: 11 },
  report: { screen: 12, print: 15 },
};

const VARIANT_STANDARD_BODY_PX = {
  a4: 14,
  sale_invoice: 14,
  lpo: 14,
  loading_sheet: 16,
  thermal: 11,
  report: 14,
};

export function orgPrintFontFamilyCss(fontId) {
  return (
    ORG_PRINT_FONT_FAMILIES.find((row) => row.id === fontId)?.css
    ?? ORG_PRINT_FONT_FAMILIES.find((row) => row.id === "times")?.css
  );
}

export function orgPrintFontScale(scaleId) {
  return (
    ORG_PRINT_FONT_SCALES.find((row) => row.id === scaleId)
    ?? ORG_PRINT_FONT_SCALES.find((row) => row.id === "standard")
  );
}

export function normalizeOrgPrintFontSizePx(value) {
  const { min, max, default: fallback } = ORG_PRINT_FONT_SIZE_LIMITS;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(Math.min(max, Math.max(min, num)));
}

export function normalizeOrgPrintFontWeight(weightId) {
  const id = String(weightId ?? "").trim();
  if (ORG_PRINT_FONT_WEIGHTS.some((row) => row.id === id)) return id;
  return ORG_PRINT_FONT_WEIGHT_DEFAULT;
}

export function orgPrintFontWeightNumeric(weightId) {
  return (
    ORG_PRINT_FONT_WEIGHTS.find((row) => row.id === normalizeOrgPrintFontWeight(weightId))?.value
    ?? 600
  );
}

export function orgPrintFontWeightFromSettings(generalSettings, variant = "a4") {
  return orgPrintSectionWeight(generalSettings, variant, "body");
}

export function orgPrintSectionWeight(generalSettings, variant = "a4", section = "body") {
  const sectionSettings = resolveOrgPrintSectionSettings(generalSettings, variant, section);
  return orgPrintFontWeightNumeric(sectionSettings.weight);
}

/** Heading / label weight relative to configured body weight. */
export function orgPrintRelativeWeight(baseWeight, delta = 100) {
  return Math.min(800, Math.max(400, baseWeight + delta));
}

function sectionSizeMultiplier(sectionSettings, variant = "a4") {
  if (sectionSettings?.scale === "custom") {
    const customPx = normalizeOrgPrintFontSizePx(sectionSettings?.size_px);
    const standardPx = VARIANT_STANDARD_BODY_PX[variant] ?? VARIANT_STANDARD_BODY_PX.a4;
    return customPx / standardPx;
  }
  return orgPrintFontScale(sectionSettings?.scale).multiplier ?? 1;
}

function sectionBodyPx(sectionSettings, variant = "a4", print = false) {
  const bases = VARIANT_BODY_BASE[variant] ?? VARIANT_BODY_BASE.a4;
  const multiplier = sectionSizeMultiplier(sectionSettings, variant);
  const base = print ? bases.print : bases.screen;
  return Math.round(base * multiplier * 10) / 10;
}

export function orgPrintBodyPx(generalSettings, { variant = "a4", print = false } = {}) {
  const sectionSettings = resolveOrgPrintSectionSettings(generalSettings, variant, "body");
  return sectionBodyPx(sectionSettings, variant, print);
}

/** Scale a template px value for header, body, or footer section. */
export function orgPrintSectionPx(
  basePx,
  generalSettings,
  { variant = "a4", section = "body", print = false } = {},
) {
  const bases = VARIANT_BODY_BASE[variant] ?? VARIANT_BODY_BASE.a4;
  const stdBody = print ? bases.print : bases.screen;
  const bodyPx = sectionBodyPx(resolveOrgPrintSectionSettings(generalSettings, variant, section), variant, print);
  return `${Math.round(basePx * (bodyPx / stdBody) * 10) / 10}px`;
}

/** Scale a template px value relative to the body section (legacy helper). */
export function orgPrintPx(basePx, generalSettings, { variant = "a4", print = false } = {}) {
  return orgPrintSectionPx(basePx, generalSettings, { variant, section: "body", print });
}

export function createOrgPrintPx(generalSettings, variant = "a4") {
  const weights = {
    body: orgPrintSectionWeight(generalSettings, variant, "body"),
    header: orgPrintSectionWeight(generalSettings, variant, "header"),
    footer: orgPrintSectionWeight(generalSettings, variant, "footer"),
  };
  return {
    body: (basePx, print = false) =>
      orgPrintSectionPx(basePx, generalSettings, { variant, section: "body", print }),
    header: (basePx, print = false) =>
      orgPrintSectionPx(basePx, generalSettings, { variant, section: "header", print }),
    footer: (basePx, print = false) =>
      orgPrintSectionPx(basePx, generalSettings, { variant, section: "footer", print }),
    weights,
  };
}

export function orgPrintFontFamilyFromSettings(generalSettings, variant = "a4") {
  const fontSettings = resolveOrgPrintFontSettings(generalSettings, variant);
  return orgPrintFontFamilyCss(fontSettings.family);
}

/** Strong black text for physical / PDF prints — avoids faint browser output. */
export function orgPrintInkStyles(generalSettings = null, variant = "a4") {
  const bodyWeight = generalSettings
    ? orgPrintSectionWeight(generalSettings, variant, "body")
    : orgPrintFontWeightNumeric(ORG_PRINT_FONT_WEIGHT_DEFAULT);
  const headerWeight = generalSettings
    ? orgPrintSectionWeight(generalSettings, variant, "header")
    : bodyWeight;
  const footerWeight = generalSettings
    ? orgPrintSectionWeight(generalSettings, variant, "footer")
    : bodyWeight;
  return `
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color: #000;
    font-weight: ${bodyWeight};
    -webkit-font-smoothing: antialiased;
    --print-w-body: ${bodyWeight};
    --print-w-header: ${headerWeight};
    --print-w-footer: ${footerWeight};
    --print-w-emphasis: ${orgPrintRelativeWeight(bodyWeight, 100)};
    --print-w-strong: ${orgPrintRelativeWeight(bodyWeight, 200)};
  `;
}
