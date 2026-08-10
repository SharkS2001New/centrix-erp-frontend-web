/** Platform-controlled Hotel & Bar POS visual theme templates. */

export const HOTEL_POS_THEME_DEFAULT = "centrix";

/**
 * Each template remaps CSS variables on `.hotel-pos-root` only
 * (backoffice keeps the global Centrix theme).
 */
export const HOTEL_POS_THEME_TEMPLATES = [
  {
    id: "centrix",
    label: "Centrix (original)",
    description: "Default Centrix look — cool indigo.",
    preview: ["#4c5ba4", "#eef0f8", "#f7f8fb"],
    vars: {
      "--theme-primary": "#4c5ba4",
      "--theme-primary-hover": "#434f91",
      "--theme-primary-fg": "#ffffff",
      "--theme-primary-subtle": "rgba(76, 91, 164, 0.14)",
      "--theme-primary-muted": "#eef0f8",
      "--theme-accent-text": "#3d4a8c",
      "--theme-page-bg": "#f4f5f9",
      "--theme-surface": "#ffffff",
      "--theme-surface-muted": "#f0f2f8",
      "--theme-input-bg": "#ffffff",
      "--theme-border": "rgba(76, 91, 164, 0.16)",
      "--theme-text": "#1c2434",
      "--theme-text-muted": "#64748b",
      "--hotel-pos-glow": "rgba(76, 91, 164, 0.22)",
      "--hotel-pos-tile-radius": "1.15rem",
      "--hotel-pos-check-bg": "color-mix(in srgb, #ffffff 92%, #f4f5f9)",
    },
  },
  {
    id: "ocean",
    label: "Ocean lounge",
    description: "Cool teal — bar and poolside.",
    preview: ["#0d9488", "#ccfbf1", "#f0fdfa"],
    vars: {
      "--theme-primary": "#0d9488",
      "--theme-primary-hover": "#0f766e",
      "--theme-primary-fg": "#ffffff",
      "--theme-primary-subtle": "rgba(13, 148, 136, 0.14)",
      "--theme-primary-muted": "#ccfbf1",
      "--theme-accent-text": "#0f766e",
      "--theme-page-bg": "#f0fdfa",
      "--theme-surface": "#ffffff",
      "--theme-surface-muted": "#e6fffa",
      "--theme-input-bg": "#ffffff",
      "--theme-border": "rgba(13, 148, 136, 0.18)",
      "--theme-text": "#134e4a",
      "--theme-text-muted": "#5b7c78",
      "--hotel-pos-glow": "rgba(13, 148, 136, 0.28)",
      "--hotel-pos-tile-radius": "1.25rem",
      "--hotel-pos-check-bg": "color-mix(in srgb, #ffffff 90%, #f0fdfa)",
    },
  },
  {
    id: "midnight",
    label: "Midnight bar",
    description: "Dark night desk — low light, high contrast.",
    preview: ["#818cf8", "#1e1b4b", "#0f172a"],
    vars: {
      "--theme-primary": "#818cf8",
      "--theme-primary-hover": "#a5b4fc",
      "--theme-primary-fg": "#0f172a",
      "--theme-primary-subtle": "rgba(129, 140, 248, 0.2)",
      "--theme-primary-muted": "#1e1b4b",
      "--theme-accent-text": "#c7d2fe",
      "--theme-page-bg": "#0b1220",
      "--theme-surface": "#141c2e",
      "--theme-surface-muted": "#1a2338",
      "--theme-input-bg": "#1a2338",
      "--theme-border": "rgba(129, 140, 248, 0.22)",
      "--theme-text": "#e2e8f0",
      "--theme-text-muted": "#94a3b8",
      "--hotel-pos-glow": "rgba(129, 140, 248, 0.35)",
      "--hotel-pos-tile-radius": "1rem",
      "--hotel-pos-check-bg": "#121a2b",
    },
  },
  {
    id: "gold",
    label: "Boutique gold",
    description: "Warm gold — boutique hotel front desk.",
    preview: ["#b45309", "#fef3c7", "#fffbeb"],
    vars: {
      "--theme-primary": "#b45309",
      "--theme-primary-hover": "#92400e",
      "--theme-primary-fg": "#fffbeb",
      "--theme-primary-subtle": "rgba(180, 83, 9, 0.14)",
      "--theme-primary-muted": "#fef3c7",
      "--theme-accent-text": "#92400e",
      "--theme-page-bg": "#fffbeb",
      "--theme-surface": "#ffffff",
      "--theme-surface-muted": "#fef9c3",
      "--theme-input-bg": "#ffffff",
      "--theme-border": "rgba(180, 83, 9, 0.18)",
      "--theme-text": "#422006",
      "--theme-text-muted": "#92400e",
      "--hotel-pos-glow": "rgba(245, 158, 11, 0.3)",
      "--hotel-pos-tile-radius": "1.1rem",
      "--hotel-pos-check-bg": "color-mix(in srgb, #ffffff 88%, #fffbeb)",
    },
  },
  {
    id: "safari",
    label: "Safari earth",
    description: "Earth browns — lodge and safari resort.",
    preview: ["#92400e", "#f5e6d3", "#faf6f1"],
    vars: {
      "--theme-primary": "#92400e",
      "--theme-primary-hover": "#78350f",
      "--theme-primary-fg": "#fff7ed",
      "--theme-primary-subtle": "rgba(146, 64, 14, 0.14)",
      "--theme-primary-muted": "#f5e6d3",
      "--theme-accent-text": "#7c2d12",
      "--theme-page-bg": "#faf6f1",
      "--theme-surface": "#fffdf9",
      "--theme-surface-muted": "#f3e8dc",
      "--theme-input-bg": "#fffdf9",
      "--theme-border": "rgba(146, 64, 14, 0.2)",
      "--theme-text": "#431407",
      "--theme-text-muted": "#9a3412",
      "--hotel-pos-glow": "rgba(180, 83, 9, 0.25)",
      "--hotel-pos-tile-radius": "0.95rem",
      "--hotel-pos-check-bg": "#f7f0e6",
    },
  },
  {
    id: "sunset",
    label: "Sunset F&B",
    description: "Energetic coral — restaurant rush hour.",
    preview: ["#ea580c", "#ffedd5", "#fff7ed"],
    vars: {
      "--theme-primary": "#ea580c",
      "--theme-primary-hover": "#c2410c",
      "--theme-primary-fg": "#ffffff",
      "--theme-primary-subtle": "rgba(234, 88, 12, 0.14)",
      "--theme-primary-muted": "#ffedd5",
      "--theme-accent-text": "#c2410c",
      "--theme-page-bg": "#fff7ed",
      "--theme-surface": "#ffffff",
      "--theme-surface-muted": "#ffedd5",
      "--theme-input-bg": "#ffffff",
      "--theme-border": "rgba(234, 88, 12, 0.18)",
      "--theme-text": "#7c2d12",
      "--theme-text-muted": "#c2410c",
      "--hotel-pos-glow": "rgba(249, 115, 22, 0.32)",
      "--hotel-pos-tile-radius": "1.35rem",
      "--hotel-pos-check-bg": "color-mix(in srgb, #ffffff 90%, #fff7ed)",
    },
  },
  {
    id: "emerald",
    label: "Emerald resort",
    description: "Fresh green — garden and eco resort.",
    preview: ["#059669", "#d1fae5", "#ecfdf5"],
    vars: {
      "--theme-primary": "#059669",
      "--theme-primary-hover": "#047857",
      "--theme-primary-fg": "#ffffff",
      "--theme-primary-subtle": "rgba(5, 150, 105, 0.14)",
      "--theme-primary-muted": "#d1fae5",
      "--theme-accent-text": "#047857",
      "--theme-page-bg": "#ecfdf5",
      "--theme-surface": "#ffffff",
      "--theme-surface-muted": "#d1fae5",
      "--theme-input-bg": "#ffffff",
      "--theme-border": "rgba(5, 150, 105, 0.18)",
      "--theme-text": "#064e3b",
      "--theme-text-muted": "#047857",
      "--hotel-pos-glow": "rgba(16, 185, 129, 0.28)",
      "--hotel-pos-tile-radius": "1.2rem",
      "--hotel-pos-check-bg": "color-mix(in srgb, #ffffff 90%, #ecfdf5)",
    },
  },
  {
    id: "slate",
    label: "Slate modern",
    description: "Cool graphite — minimal contemporary hotel.",
    preview: ["#475569", "#e2e8f0", "#f8fafc"],
    vars: {
      "--theme-primary": "#475569",
      "--theme-primary-hover": "#334155",
      "--theme-primary-fg": "#f8fafc",
      "--theme-primary-subtle": "rgba(71, 85, 105, 0.14)",
      "--theme-primary-muted": "#e2e8f0",
      "--theme-accent-text": "#334155",
      "--theme-page-bg": "#f8fafc",
      "--theme-surface": "#ffffff",
      "--theme-surface-muted": "#f1f5f9",
      "--theme-input-bg": "#ffffff",
      "--theme-border": "rgba(71, 85, 105, 0.16)",
      "--theme-text": "#0f172a",
      "--theme-text-muted": "#64748b",
      "--hotel-pos-glow": "rgba(71, 85, 105, 0.2)",
      "--hotel-pos-tile-radius": "0.85rem",
      "--hotel-pos-check-bg": "#f1f5f9",
    },
  },
  {
    id: "rose",
    label: "Rose suite",
    description: "Soft rose — spa and boutique suites.",
    preview: ["#be185d", "#fce7f3", "#fdf2f8"],
    vars: {
      "--theme-primary": "#be185d",
      "--theme-primary-hover": "#9d174d",
      "--theme-primary-fg": "#ffffff",
      "--theme-primary-subtle": "rgba(190, 24, 93, 0.12)",
      "--theme-primary-muted": "#fce7f3",
      "--theme-accent-text": "#9d174d",
      "--theme-page-bg": "#fdf2f8",
      "--theme-surface": "#ffffff",
      "--theme-surface-muted": "#fce7f3",
      "--theme-input-bg": "#ffffff",
      "--theme-border": "rgba(190, 24, 93, 0.16)",
      "--theme-text": "#500724",
      "--theme-text-muted": "#9d174d",
      "--hotel-pos-glow": "rgba(219, 39, 119, 0.25)",
      "--hotel-pos-tile-radius": "1.4rem",
      "--hotel-pos-check-bg": "color-mix(in srgb, #ffffff 90%, #fdf2f8)",
    },
  },
];

const THEME_BY_ID = Object.fromEntries(HOTEL_POS_THEME_TEMPLATES.map((t) => [t.id, t]));

export const HOTEL_POS_THEME_IDS = new Set(HOTEL_POS_THEME_TEMPLATES.map((t) => t.id));

export function normalizeHotelPosThemeTemplate(value) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (key === "default") return HOTEL_POS_THEME_DEFAULT;
  return HOTEL_POS_THEME_IDS.has(key) ? key : HOTEL_POS_THEME_DEFAULT;
}

export function getHotelPosThemeTemplate(id) {
  return THEME_BY_ID[normalizeHotelPosThemeTemplate(id)] ?? THEME_BY_ID[HOTEL_POS_THEME_DEFAULT];
}

export function hotelPosThemeCssVars(id) {
  return { ...(getHotelPosThemeTemplate(id).vars ?? {}) };
}

export function resolveHotelPosThemeTemplate(moduleSettingsOrCapabilities = null) {
  const root = moduleSettingsOrCapabilities ?? {};
  const moduleSettings = root.module_settings ?? root;
  const hospitality = moduleSettings?.hospitality ?? root.hospitality ?? {};
  const sales = moduleSettings?.sales ?? root.sales ?? {};
  const bag = { ...sales, ...hospitality };
  return normalizeHotelPosThemeTemplate(
    bag?.hotel_pos_theme_template ?? root?.hotel_pos_theme_template,
  );
}
