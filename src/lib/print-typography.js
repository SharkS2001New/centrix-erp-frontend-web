/** Organization print font and text size — Admin → Settings → Printouts. */

export const ORG_PRINT_FONT_FAMILIES = [
  { id: "times", label: "Times New Roman", css: "'Times New Roman', Times, serif" },
  { id: "georgia", label: "Georgia", css: "Georgia, 'Times New Roman', serif" },
  { id: "arial", label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { id: "helvetica", label: "Helvetica", css: "Helvetica, Arial, sans-serif" },
  { id: "verdana", label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { id: "system", label: "System sans-serif", css: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
];

export const ORG_PRINT_FONT_SCALES = [
  { id: "compact", label: "Compact", multiplier: 0.9 },
  { id: "standard", label: "Standard (recommended)", multiplier: 1 },
  { id: "large", label: "Large", multiplier: 1.15 },
  { id: "extra_large", label: "Extra large", multiplier: 1.3 },
];

const VARIANT_BODY_BASE = {
  a4: { screen: 10, print: 14 },
  sale_invoice: { screen: 11, print: 14 },
  lpo: { screen: 11, print: 14 },
  loading_sheet: { screen: 12, print: 16 },
  thermal: { screen: 10, print: 11 },
  report: { screen: 11, print: 14 },
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

export function orgPrintBodyPx(generalSettings, { variant = "a4", print = false } = {}) {
  const bases = VARIANT_BODY_BASE[variant] ?? VARIANT_BODY_BASE.a4;
  const multiplier = orgPrintFontScale(generalSettings?.print_font_scale).multiplier;
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

export function orgPrintFontFamilyFromSettings(generalSettings) {
  return orgPrintFontFamilyCss(generalSettings?.print_font_family);
}
