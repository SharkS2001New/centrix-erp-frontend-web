/** Leaf helpers shared by print-font-settings and print-typography (no cycles). */

export const ORG_PRINT_FONT_SIZE_LIMITS = { min: 8, max: 24, default: 14 };

export const ORG_PRINT_FONT_WEIGHTS = [
  { id: "normal", label: "Normal", value: 400 },
  { id: "medium", label: "Medium", value: 500 },
  { id: "semibold", label: "Semibold (recommended)", value: 600 },
  { id: "bold", label: "Bold", value: 700 },
  { id: "extra_bold", label: "Extra bold", value: 800 },
];

export const ORG_PRINT_FONT_WEIGHT_DEFAULT = "semibold";

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
