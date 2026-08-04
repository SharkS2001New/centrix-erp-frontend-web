/** Org-wide Centrix ERP visual theme templates (also used by Classic External POS). */

export const CLASSIC_POS_THEME_DEFAULT = "centrix";

/** Default legacy beige palette (matches globals.css fallbacks). */
export const CLASSIC_POS_LEGACY_VARS = {
  "--classic-bg": "#cdb48b",
  "--classic-panel": "#f7f1e4",
  "--classic-table": "#ffffff",
  "--classic-border": "#8a7a55",
  "--classic-text": "#1a1a1a",
  "--classic-muted": "#5c5340",
  "--classic-accent": "#fe0300",
  "--classic-header": "#b8a574",
  "--classic-footer": "#fafafa",
  "--classic-totals-bar": "#ffffff",
  "--classic-status-bar": "#f0f0f0",
  "--classic-caption": "#8b0000",
  "--classic-totals": "#800000",
  "--classic-label": "#000040",
  "--classic-th-bg": "#f3f3f3",
  "--classic-th-border": "#b0b0b0",
  "--classic-td-border": "#d0d0d0",
  "--classic-grid-border": "#8b9dc3",
  "--classic-row-entry": "#faf7f0",
  "--classic-row-selected": "#fff4c8",
  "--classic-input-bg": "#ffffff",
  "--classic-rownum": "#666666",
  "--classic-dropdown-shadow": "0 8px 24px rgba(0, 0, 0, 0.28)",
};

/**
 * Each template remaps `--classic-*` on `.pos-workspace-classic` only.
 * Same catalogue as Hotel POS for a consistent admin experience.
 */
export const CLASSIC_POS_THEME_TEMPLATES = [
  {
    id: "centrix",
    label: "Centrix (original)",
    description: "Default Centrix ERP look — cool indigo workspace.",
    preview: ["#4c5ba4", "#eef0f8", "#f4f5f9"],
    vars: {
      "--classic-bg": "#c8ccd8",
      "--classic-panel": "#eef0f8",
      "--classic-table": "#ffffff",
      "--classic-border": "#6b7280",
      "--classic-text": "#1c2434",
      "--classic-muted": "#64748b",
      "--classic-accent": "#dc2626",
      "--classic-header": "#4c5ba4",
      "--classic-footer": "#f4f5f9",
      "--classic-totals-bar": "#ffffff",
      "--classic-status-bar": "#e8ebf4",
      "--classic-caption": "#3d4a8c",
      "--classic-totals": "#4c5ba4",
      "--classic-label": "#1e3a5f",
      "--classic-th-bg": "#eef0f8",
      "--classic-th-border": "#94a3b8",
      "--classic-td-border": "#cbd5e1",
      "--classic-grid-border": "#4c5ba4",
      "--classic-row-entry": "#f7f8fb",
      "--classic-row-selected": "#dce3f5",
      "--classic-input-bg": "#ffffff",
      "--classic-rownum": "#64748b",
      "--classic-dropdown-shadow": "0 8px 24px rgba(76, 91, 164, 0.22)",
    },
  },
  {
    id: "legacy",
    label: "Legacy beige",
    description: "Original classic cashier — warm tan workspace.",
    preview: ["#b8a574", "#cdb48b", "#f7f1e4"],
    vars: { ...CLASSIC_POS_LEGACY_VARS },
  },
  {
    id: "ocean",
    label: "Ocean lounge",
    description: "Cool teal — fresh bar counter feel.",
    preview: ["#0d9488", "#ccfbf1", "#f0fdfa"],
    vars: {
      "--classic-bg": "#9fd4cc",
      "--classic-panel": "#ccfbf1",
      "--classic-table": "#ffffff",
      "--classic-border": "#0f766e",
      "--classic-text": "#134e4a",
      "--classic-muted": "#5b7c78",
      "--classic-accent": "#dc2626",
      "--classic-header": "#0d9488",
      "--classic-footer": "#f0fdfa",
      "--classic-totals-bar": "#ffffff",
      "--classic-status-bar": "#e6fffa",
      "--classic-caption": "#0f766e",
      "--classic-totals": "#0d9488",
      "--classic-label": "#134e4a",
      "--classic-th-bg": "#ccfbf1",
      "--classic-th-border": "#5eead4",
      "--classic-td-border": "#99f6e4",
      "--classic-grid-border": "#0d9488",
      "--classic-row-entry": "#f0fdfa",
      "--classic-row-selected": "#ccfbf1",
      "--classic-input-bg": "#ffffff",
      "--classic-rownum": "#5b7c78",
      "--classic-dropdown-shadow": "0 8px 24px rgba(13, 148, 136, 0.25)",
    },
  },
  {
    id: "midnight",
    label: "Midnight bar",
    description: "Dark night desk — low light, high contrast.",
    preview: ["#818cf8", "#1e1b4b", "#0f172a"],
    vars: {
      "--classic-bg": "#1a2338",
      "--classic-panel": "#141c2e",
      "--classic-table": "#0f172a",
      "--classic-border": "#475569",
      "--classic-text": "#e2e8f0",
      "--classic-muted": "#94a3b8",
      "--classic-accent": "#f87171",
      "--classic-header": "#312e81",
      "--classic-footer": "#0b1220",
      "--classic-totals-bar": "#141c2e",
      "--classic-status-bar": "#1e293b",
      "--classic-caption": "#c7d2fe",
      "--classic-totals": "#a5b4fc",
      "--classic-label": "#c7d2fe",
      "--classic-th-bg": "#1e293b",
      "--classic-th-border": "#475569",
      "--classic-td-border": "#334155",
      "--classic-grid-border": "#6366f1",
      "--classic-row-entry": "#1a2338",
      "--classic-row-selected": "#312e81",
      "--classic-input-bg": "#0f172a",
      "--classic-rownum": "#94a3b8",
      "--classic-dropdown-shadow": "0 8px 24px rgba(0, 0, 0, 0.55)",
    },
  },
  {
    id: "gold",
    label: "Boutique gold",
    description: "Warm gold — boutique front desk.",
    preview: ["#b45309", "#fef3c7", "#fffbeb"],
    vars: {
      "--classic-bg": "#e8c896",
      "--classic-panel": "#fef3c7",
      "--classic-table": "#ffffff",
      "--classic-border": "#92400e",
      "--classic-text": "#422006",
      "--classic-muted": "#92400e",
      "--classic-accent": "#dc2626",
      "--classic-header": "#b45309",
      "--classic-footer": "#fffbeb",
      "--classic-totals-bar": "#ffffff",
      "--classic-status-bar": "#fef9c3",
      "--classic-caption": "#92400e",
      "--classic-totals": "#b45309",
      "--classic-label": "#422006",
      "--classic-th-bg": "#fef3c7",
      "--classic-th-border": "#fcd34d",
      "--classic-td-border": "#fde68a",
      "--classic-grid-border": "#b45309",
      "--classic-row-entry": "#fffbeb",
      "--classic-row-selected": "#fef3c7",
      "--classic-input-bg": "#ffffff",
      "--classic-rownum": "#92400e",
      "--classic-dropdown-shadow": "0 8px 24px rgba(180, 83, 9, 0.25)",
    },
  },
  {
    id: "safari",
    label: "Safari earth",
    description: "Earth browns — lodge and safari resort.",
    preview: ["#92400e", "#f5e6d3", "#faf6f1"],
    vars: {
      "--classic-bg": "#c4a882",
      "--classic-panel": "#f5e6d3",
      "--classic-table": "#fffdf9",
      "--classic-border": "#78350f",
      "--classic-text": "#431407",
      "--classic-muted": "#9a3412",
      "--classic-accent": "#dc2626",
      "--classic-header": "#92400e",
      "--classic-footer": "#faf6f1",
      "--classic-totals-bar": "#fffdf9",
      "--classic-status-bar": "#f3e8dc",
      "--classic-caption": "#7c2d12",
      "--classic-totals": "#92400e",
      "--classic-label": "#431407",
      "--classic-th-bg": "#f5e6d3",
      "--classic-th-border": "#d6b896",
      "--classic-td-border": "#e8d4bc",
      "--classic-grid-border": "#92400e",
      "--classic-row-entry": "#faf6f1",
      "--classic-row-selected": "#f5e6d3",
      "--classic-input-bg": "#fffdf9",
      "--classic-rownum": "#9a3412",
      "--classic-dropdown-shadow": "0 8px 24px rgba(146, 64, 14, 0.28)",
    },
  },
  {
    id: "sunset",
    label: "Sunset F&B",
    description: "Energetic coral — restaurant rush hour.",
    preview: ["#ea580c", "#ffedd5", "#fff7ed"],
    vars: {
      "--classic-bg": "#e8b896",
      "--classic-panel": "#ffedd5",
      "--classic-table": "#ffffff",
      "--classic-border": "#c2410c",
      "--classic-text": "#7c2d12",
      "--classic-muted": "#c2410c",
      "--classic-accent": "#dc2626",
      "--classic-header": "#ea580c",
      "--classic-footer": "#fff7ed",
      "--classic-totals-bar": "#ffffff",
      "--classic-status-bar": "#ffedd5",
      "--classic-caption": "#c2410c",
      "--classic-totals": "#ea580c",
      "--classic-label": "#7c2d12",
      "--classic-th-bg": "#ffedd5",
      "--classic-th-border": "#fdba74",
      "--classic-td-border": "#fed7aa",
      "--classic-grid-border": "#ea580c",
      "--classic-row-entry": "#fff7ed",
      "--classic-row-selected": "#ffedd5",
      "--classic-input-bg": "#ffffff",
      "--classic-rownum": "#c2410c",
      "--classic-dropdown-shadow": "0 8px 24px rgba(234, 88, 12, 0.28)",
    },
  },
  {
    id: "emerald",
    label: "Emerald resort",
    description: "Fresh green — garden and eco resort.",
    preview: ["#059669", "#d1fae5", "#ecfdf5"],
    vars: {
      "--classic-bg": "#9fd4b8",
      "--classic-panel": "#d1fae5",
      "--classic-table": "#ffffff",
      "--classic-border": "#047857",
      "--classic-text": "#064e3b",
      "--classic-muted": "#047857",
      "--classic-accent": "#dc2626",
      "--classic-header": "#059669",
      "--classic-footer": "#ecfdf5",
      "--classic-totals-bar": "#ffffff",
      "--classic-status-bar": "#d1fae5",
      "--classic-caption": "#047857",
      "--classic-totals": "#059669",
      "--classic-label": "#064e3b",
      "--classic-th-bg": "#d1fae5",
      "--classic-th-border": "#6ee7b7",
      "--classic-td-border": "#a7f3d0",
      "--classic-grid-border": "#059669",
      "--classic-row-entry": "#ecfdf5",
      "--classic-row-selected": "#d1fae5",
      "--classic-input-bg": "#ffffff",
      "--classic-rownum": "#047857",
      "--classic-dropdown-shadow": "0 8px 24px rgba(5, 150, 105, 0.25)",
    },
  },
  {
    id: "slate",
    label: "Slate modern",
    description: "Cool graphite — minimal contemporary.",
    preview: ["#475569", "#e2e8f0", "#f8fafc"],
    vars: {
      "--classic-bg": "#b8c0cc",
      "--classic-panel": "#e2e8f0",
      "--classic-table": "#ffffff",
      "--classic-border": "#475569",
      "--classic-text": "#0f172a",
      "--classic-muted": "#64748b",
      "--classic-accent": "#dc2626",
      "--classic-header": "#475569",
      "--classic-footer": "#f8fafc",
      "--classic-totals-bar": "#ffffff",
      "--classic-status-bar": "#f1f5f9",
      "--classic-caption": "#334155",
      "--classic-totals": "#475569",
      "--classic-label": "#1e293b",
      "--classic-th-bg": "#e2e8f0",
      "--classic-th-border": "#94a3b8",
      "--classic-td-border": "#cbd5e1",
      "--classic-grid-border": "#475569",
      "--classic-row-entry": "#f8fafc",
      "--classic-row-selected": "#e2e8f0",
      "--classic-input-bg": "#ffffff",
      "--classic-rownum": "#64748b",
      "--classic-dropdown-shadow": "0 8px 24px rgba(71, 85, 105, 0.22)",
    },
  },
  {
    id: "rose",
    label: "Rose suite",
    description: "Soft rose — spa and boutique suites.",
    preview: ["#be185d", "#fce7f3", "#fdf2f8"],
    vars: {
      "--classic-bg": "#ddb8c8",
      "--classic-panel": "#fce7f3",
      "--classic-table": "#ffffff",
      "--classic-border": "#9d174d",
      "--classic-text": "#500724",
      "--classic-muted": "#9d174d",
      "--classic-accent": "#dc2626",
      "--classic-header": "#be185d",
      "--classic-footer": "#fdf2f8",
      "--classic-totals-bar": "#ffffff",
      "--classic-status-bar": "#fce7f3",
      "--classic-caption": "#9d174d",
      "--classic-totals": "#be185d",
      "--classic-label": "#500724",
      "--classic-th-bg": "#fce7f3",
      "--classic-th-border": "#f9a8d4",
      "--classic-td-border": "#fbcfe8",
      "--classic-grid-border": "#be185d",
      "--classic-row-entry": "#fdf2f8",
      "--classic-row-selected": "#fce7f3",
      "--classic-input-bg": "#ffffff",
      "--classic-rownum": "#9d174d",
      "--classic-dropdown-shadow": "0 8px 24px rgba(190, 24, 93, 0.22)",
    },
  },
];

const THEME_BY_ID = Object.fromEntries(CLASSIC_POS_THEME_TEMPLATES.map((t) => [t.id, t]));

export const CLASSIC_POS_THEME_IDS = new Set(CLASSIC_POS_THEME_TEMPLATES.map((t) => t.id));

export function normalizeClassicPosThemeTemplate(value) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (key === "default") return CLASSIC_POS_THEME_DEFAULT;
  return CLASSIC_POS_THEME_IDS.has(key) ? key : CLASSIC_POS_THEME_DEFAULT;
}

export function getClassicPosThemeTemplate(id) {
  return THEME_BY_ID[normalizeClassicPosThemeTemplate(id)] ?? THEME_BY_ID[CLASSIC_POS_THEME_DEFAULT];
}

function parseHexColor(hex) {
  const raw = String(hex ?? "").trim().replace(/^#/, "");
  if (!raw) return null;
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.length === 6
        ? raw
        : null;
  if (!expanded || !/^[0-9a-f]{6}$/i.test(expanded)) return null;
  const value = Number.parseInt(expanded, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Readable header copy (company name, wordmark) for each template header bar. */
export function classicHeaderForegroundVars(vars) {
  const header = vars["--classic-header"];
  const rgb = parseHexColor(header);
  if (!rgb) {
    return {
      "--classic-header-fg": vars["--classic-text"] ?? "#1a1a1a",
      "--classic-header-muted": vars["--classic-muted"] ?? "#5c5340",
    };
  }
  const lightHeader = relativeLuminance(rgb) > 0.35;
  if (lightHeader) {
    return {
      "--classic-header-fg": vars["--classic-text"] ?? "#1a1a1a",
      "--classic-header-muted": vars["--classic-muted"] ?? "#5c5340",
    };
  }
  return {
    "--classic-header-fg": "#f8fafc",
    "--classic-header-muted": "#cbd5e1",
  };
}

/** Org-admin customizable Classic POS color slots (on top of a base template). */
export const CLASSIC_POS_COLOR_OVERRIDE_FIELDS = [
  {
    key: "workspace",
    label: "Workspace",
    description: "Main Classic POS background.",
    cssVar: "--classic-bg",
  },
  {
    key: "header",
    label: "Header",
    description: "Top bar and Find window chrome.",
    cssVar: "--classic-header",
  },
  {
    key: "footer",
    label: "Footer",
    description: "Bottom status / footer strip.",
    cssVar: "--classic-footer",
  },
  {
    key: "button",
    label: "Buttons",
    description: "Primary actions (Save, Add, Find). Defaults to header when empty.",
    cssVar: "--classic-button",
  },
  {
    key: "select",
    label: "Select",
    description: "Highlighted row in Find / search dropdowns when scrolling or selecting.",
    cssVar: "--classic-select",
  },
];

export function normalizeClassicPosHexColor(value) {
  const rgb = parseHexColor(value);
  if (!rgb) return null;
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** @returns {Record<string, string>} only valid override keys with #rrggbb values */
export function normalizeClassicPosThemeColors(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const field of CLASSIC_POS_COLOR_OVERRIDE_FIELDS) {
    const hex = normalizeClassicPosHexColor(raw[field.key]);
    if (hex) out[field.key] = hex;
  }
  return out;
}

export function classicPosThemeColorsEqual(a, b) {
  const left = normalizeClassicPosThemeColors(a);
  const right = normalizeClassicPosThemeColors(b);
  const keys = CLASSIC_POS_COLOR_OVERRIDE_FIELDS.map((f) => f.key);
  return keys.every((key) => (left[key] ?? "") === (right[key] ?? ""));
}

function mixHexToward(hex, towardRgb, amount) {
  const rgb = parseHexColor(hex);
  if (!rgb) return hex;
  const t = Math.min(1, Math.max(0, amount));
  const mixed = rgb.map((c, i) => Math.round(c + (towardRgb[i] - c) * t));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgba(hex, alpha) {
  const rgb = parseHexColor(hex);
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function classicPosThemeCssVars(id, colorOverrides = null) {
  const vars = { ...(getClassicPosThemeTemplate(id).vars ?? CLASSIC_POS_LEGACY_VARS) };
  const overrides = normalizeClassicPosThemeColors(colorOverrides);

  if (overrides.workspace) vars["--classic-bg"] = overrides.workspace;
  if (overrides.header) vars["--classic-header"] = overrides.header;
  if (overrides.footer) {
    vars["--classic-footer"] = overrides.footer;
    vars["--classic-status-bar"] = overrides.footer;
  }
  // Button defaults to header (after header override); explicit button wins.
  vars["--classic-button"] = overrides.button || vars["--classic-header"];
  // Select highlight defaults to header; explicit select wins (also soft row tint).
  if (overrides.select) {
    vars["--classic-select"] = overrides.select;
    vars["--classic-row-selected"] = overrides.select;
  } else {
    vars["--classic-select"] = vars["--classic-header"];
  }

  const withHeaderFg = { ...vars, ...classicHeaderForegroundVars(vars) };
  const selectRgb = parseHexColor(withHeaderFg["--classic-select"]);
  if (selectRgb && relativeLuminance(selectRgb) > 0.35) {
    withHeaderFg["--classic-select-fg"] = withHeaderFg["--classic-text"] ?? "#1a1a1a";
  } else {
    withHeaderFg["--classic-select-fg"] = "#f8fafc";
  }
  return withHeaderFg;
}

/**
 * Bridge Classic POS palette onto `--theme-*` tokens for the Classic External POS
 * workspace (full surfaces, text, borders, buttons).
 */
export function classicPosThemeBridgeVars(id, colorOverrides = null) {
  const classic = classicPosThemeCssVars(id, colorOverrides);
  const header = classic["--classic-header"];
  const button = classic["--classic-button"] || header;
  const panel = classic["--classic-panel"];
  const table = classic["--classic-table"];
  const border = classic["--classic-border"];
  const text = classic["--classic-text"];
  const muted = classic["--classic-muted"];
  const footer = classic["--classic-footer"];
  const input = classic["--classic-input-bg"];
  const selected = classic["--classic-row-selected"];
  const caption = classic["--classic-caption"];
  const buttonRgb = parseHexColor(button);
  const buttonFg =
    buttonRgb && relativeLuminance(buttonRgb) > 0.35
      ? classic["--classic-text"] ?? "#1a1a1a"
      : "#f8fafc";
  const primaryHover = mixHexToward(button, [0, 0, 0], 0.12);

  return {
    ...classic,
    "--theme-primary": button,
    "--theme-primary-hover": primaryHover,
    "--theme-primary-fg": buttonFg,
    "--theme-primary-subtle": hexToRgba(button, 0.14),
    "--theme-primary-muted": panel,
    "--theme-accent-text": caption ?? header,
    "--theme-page-bg": panel,
    "--theme-surface": table,
    "--theme-surface-muted": panel,
    "--theme-surface-subtle": footer,
    "--theme-border": border,
    "--theme-border-strong": mixHexToward(border, [0, 0, 0], 0.2),
    "--theme-text": text,
    "--theme-text-muted": muted,
    "--theme-text-subtle": muted,
    "--theme-input-bg": input,
    "--theme-hover": selected,
  };
}

/** Button primary tokens shared by org chrome and Classic POS. */
function orgErpButtonThemeVars(classic) {
  const header = classic["--classic-header"] || "#405189";
  const button = classic["--classic-button"] || header;
  const panel = classic["--classic-panel"] || "#eef0f8";
  const buttonRgb = parseHexColor(button);
  const buttonFg =
    buttonRgb && relativeLuminance(buttonRgb) > 0.35
      ? classic["--classic-text"] ?? "#1a1a1a"
      : "#f8fafc";
  return {
    "--theme-primary": button,
    "--theme-primary-hover": mixHexToward(button, [0, 0, 0], 0.12),
    "--theme-primary-fg": buttonFg,
    "--theme-primary-subtle": hexToRgba(button, 0.14),
    "--theme-primary-muted": panel,
  };
}

/**
 * Backoffice / non-POS modules: sidebar background + primary button colors only.
 * Does not recolor page surfaces, footers, panels, or text.
 */
export function orgErpSidebarThemeVars(id, colorOverrides = null) {
  const classic = classicPosThemeCssVars(id, colorOverrides);
  const header = classic["--classic-header"] || "#405189";
  return {
    "--erp-sidebar-bg": header,
    "--erp-sidebar-border": mixHexToward(header, [0, 0, 0], 0.12),
    ...orgErpButtonThemeVars(classic),
  };
}

const CLASSIC_POS_DOCUMENT_STYLE_KEYS = new Set();

function writeDocumentThemeVars(vars, { classicPosActive = false, themeId } = {}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const key of CLASSIC_POS_DOCUMENT_STYLE_KEYS) {
    if (!(key in vars)) root.style.removeProperty(key);
  }
  CLASSIC_POS_DOCUMENT_STYLE_KEYS.clear();
  for (const [key, value] of Object.entries(vars)) {
    if (value == null || value === "") continue;
    root.style.setProperty(key, String(value));
    CLASSIC_POS_DOCUMENT_STYLE_KEYS.add(key);
  }
  const normalized = normalizeClassicPosThemeTemplate(themeId);
  root.dataset.erpTheme = normalized;
  if (classicPosActive) {
    root.dataset.classicPosActive = "true";
    root.dataset.classicPosTheme = normalized;
  } else {
    delete root.dataset.classicPosActive;
    delete root.dataset.classicPosTheme;
  }
}

/** Apply org theme to sidebar + primary buttons (backoffice / non-Classic-POS). */
export function applyOrgErpSidebarTheme(id, colorOverrides = null) {
  writeDocumentThemeVars(orgErpSidebarThemeVars(id, colorOverrides), {
    classicPosActive: false,
    themeId: id,
  });
}

/** Apply full Classic POS palette on `html` while the Classic External POS desk is open. */
export function applyClassicPosDocumentTheme(id, colorOverrides = null) {
  const sidebar = orgErpSidebarThemeVars(id, colorOverrides);
  const full = classicPosThemeBridgeVars(id, colorOverrides);
  writeDocumentThemeVars({ ...full, ...sidebar }, {
    classicPosActive: true,
    themeId: id,
  });
}

export function clearClassicPosDocumentTheme() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const key of CLASSIC_POS_DOCUMENT_STYLE_KEYS) {
    root.style.removeProperty(key);
  }
  CLASSIC_POS_DOCUMENT_STYLE_KEYS.clear();
  delete root.dataset.classicPosActive;
  delete root.dataset.classicPosTheme;
  delete root.dataset.erpTheme;
}

export function resolveClassicPosThemeTemplate(moduleSettingsOrCapabilities = null) {
  const sales =
    moduleSettingsOrCapabilities?.module_settings?.sales ??
    moduleSettingsOrCapabilities?.sales ??
    moduleSettingsOrCapabilities?.module_settings ??
    moduleSettingsOrCapabilities ??
    {};
  return normalizeClassicPosThemeTemplate(sales?.classic_pos_theme_template);
}

export function resolveClassicPosThemeColors(moduleSettingsOrCapabilities = null) {
  const sales =
    moduleSettingsOrCapabilities?.module_settings?.sales ??
    moduleSettingsOrCapabilities?.sales ??
    moduleSettingsOrCapabilities?.module_settings ??
    moduleSettingsOrCapabilities ??
    {};
  return normalizeClassicPosThemeColors(sales?.classic_pos_theme_colors);
}

export function isDarkClassicPosTheme(id) {
  return normalizeClassicPosThemeTemplate(id) === "midnight";
}
