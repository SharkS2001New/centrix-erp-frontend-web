/** External POS (/pos) UI layouts — platform (superadmin) controlled. */

export const EXTERNAL_POS_LAYOUTS = [
  {
    value: "modern",
    label: "Modern",
    description: "Current Centrix External POS layout.",
  },
  {
    value: "classic",
    label: "Classic",
    description: "Legacy cashier layout — cart on top, Find product window, beige workspace.",
  },
];

export const EXTERNAL_POS_LAYOUT_VALUES = new Set(EXTERNAL_POS_LAYOUTS.map((row) => row.value));

export const DEFAULT_EXTERNAL_POS_LAYOUT = "modern";

/** Classic palette sampled from the legacy POS reference screenshot. */
export const CLASSIC_POS_COLORS = {
  workspaceBg: "#cdb48b",
  panelBg: "#f7f1e4",
  tableBg: "#ffffff",
  border: "#8a7a55",
  text: "#1a1a1a",
  muted: "#5c5340",
  /** Negative stock rows + totals emphasis */
  accent: "#fe0300",
  accentSoft: "#ffe5e5",
  headerBg: "#b8a574",
  footerBg: "#fafafa",
  totalsBarBg: "#ffffff",
  statusBarBg: "#f5f5f5",
};

export function normalizeExternalPosLayout(value) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  return EXTERNAL_POS_LAYOUT_VALUES.has(key) ? key : DEFAULT_EXTERNAL_POS_LAYOUT;
}

/** Layout for External POS only — backoffice create order always uses modern. */
export function resolveExternalPosLayout(moduleSettingsOrCapabilities = null) {
  const sales =
    moduleSettingsOrCapabilities?.module_settings?.sales ??
    moduleSettingsOrCapabilities?.sales ??
    (moduleSettingsOrCapabilities?.external_pos_layout != null
      ? moduleSettingsOrCapabilities
      : moduleSettingsOrCapabilities?.module_settings
        ? null
        : moduleSettingsOrCapabilities);
  return normalizeExternalPosLayout(sales?.external_pos_layout);
}

export function isClassicExternalPosLayout(moduleSettingsOrCapabilities = null) {
  return resolveExternalPosLayout(moduleSettingsOrCapabilities) === "classic";
}
