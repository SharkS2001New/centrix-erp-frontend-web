/** Backoffice Sales → Edit order popup layouts — platform (superadmin) controlled. */

export const BACKOFFICE_ORDER_EDIT_LAYOUTS = [
  {
    value: "modern",
    label: "Modern",
    description: "Current Centrix Edit order popup.",
  },
  {
    value: "classic",
    label: "Classic",
    description: "Classic POS-style Edit order popup — cart grid, swap, retail/wholesale mode.",
  },
];

export const BACKOFFICE_ORDER_EDIT_LAYOUT_VALUES = new Set(
  BACKOFFICE_ORDER_EDIT_LAYOUTS.map((row) => row.value),
);

export const DEFAULT_BACKOFFICE_ORDER_EDIT_LAYOUT = "modern";

export function normalizeBackofficeOrderEditLayout(value) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  return BACKOFFICE_ORDER_EDIT_LAYOUT_VALUES.has(key) ? key : DEFAULT_BACKOFFICE_ORDER_EDIT_LAYOUT;
}

/** Resolve Edit Orders UI mode from capabilities or module_settings.sales. */
export function resolveBackofficeOrderEditLayout(moduleSettingsOrCapabilities = null) {
  const sales =
    moduleSettingsOrCapabilities?.module_settings?.sales ??
    moduleSettingsOrCapabilities?.sales ??
    (moduleSettingsOrCapabilities?.backoffice_order_edit_layout != null
      ? moduleSettingsOrCapabilities
      : moduleSettingsOrCapabilities?.module_settings
        ? null
        : moduleSettingsOrCapabilities);
  return normalizeBackofficeOrderEditLayout(sales?.backoffice_order_edit_layout);
}

export function isClassicBackofficeOrderEditLayout(moduleSettingsOrCapabilities = null) {
  return resolveBackofficeOrderEditLayout(moduleSettingsOrCapabilities) === "classic";
}
