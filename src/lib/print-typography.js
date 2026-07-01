import { resolveOrgPrintFontSettings } from "@/lib/print-font-settings";

export const ORG_PRINT_FONT_FAMILIES = [
  { id: "times", label: "Times New Roman", css: "'Times New Roman', Times, serif" },
  { id: "georgia", label: "Georgia", css: "Georgia, 'Times New Roman', serif" },
  { id: "palatino", label: "Palatino Linotype", css: "'Palatino Linotype', Palatino, serif" },
  { id: "garamond", label: "Garamond", css: "Garamond, 'Times New Roman', serif" },
  { id: "arial", label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { id: "helvetica", label: "Helvetica", css: "Helvetica, Arial, sans-serif" },
  { id: "verdana", label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { id: "tahoma", label: "Tahoma", css: "Tahoma, Geneva, sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", css: "'Trebuchet MS', Helvetica, sans-serif" },
  { id: "calibri", label: "Calibri", css: "Calibri, 'Segoe UI', sans-serif" },
  { id: "courier", label: "Courier New", css: "'Courier New', Courier, monospace" },
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

function orgPrintSizeMultiplier(fontSettings, variant = "a4") {
  if (fontSettings?.scale === "custom") {
    const customPx = normalizeOrgPrintFontSizePx(fontSettings?.size_px);
    const standardPx = VARIANT_STANDARD_BODY_PX[variant] ?? VARIANT_STANDARD_BODY_PX.a4;
    return customPx / standardPx;
  }
  return orgPrintFontScale(fontSettings?.scale).multiplier ?? 1;
}

export function orgPrintBodyPx(generalSettings, { variant = "a4", print = false } = {}) {
  const bases = VARIANT_BODY_BASE[variant] ?? VARIANT_BODY_BASE.a4;
  const fontSettings = resolveOrgPrintFontSettings(generalSettings, variant);
  const multiplier = orgPrintSizeMultiplier(fontSettings, variant);
  const base = print ? bases.print : bases.screen;
  return Math.round(base * multiplier * 10) / 10;
}

/** Scale a template px value relative to the variant body size. */
export function orgPrintPx(basePx, generalSettings, { variant = "a4", print = false } = {}) {
  const bases = VARIANT_BODY_BASE[variant] ?? VARIANT_BODY_BASE.a4;
  const stdBody = print ? bases.print : bases.screen;
  const bodyPx = orgPrintBodyPx(generalSettings, { variant, print });
  return `${Math.round(basePx * (bodyPx / stdBody) * 10) / 10}px`;
}

export function orgPrintFontFamilyFromSettings(generalSettings, variant = "a4") {
  const fontSettings = resolveOrgPrintFontSettings(generalSettings, variant);
  return orgPrintFontFamilyCss(fontSettings.family);
}

/** Strong black text for physical / PDF prints — avoids faint browser output. */
export function orgPrintInkStyles() {
  return `
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color: #000;
    -webkit-font-smoothing: antialiased;
  `;
}
