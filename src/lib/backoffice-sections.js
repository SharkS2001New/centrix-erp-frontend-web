/** Platform switches for the Backoffice sidebar. Missing keys stay on. */

export const BACKOFFICE_SECTION_CATALOG = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Products" },
  { key: "pos", label: "Till operations" },
  { key: "pricing_tax", label: "Pricing & tax" },
  { key: "sales_orders", label: "Sales & orders" },
  { key: "shop_debtors", label: "Shop debtors" },
  { key: "field_sales", label: "Field sales" },
  { key: "after_sales", label: "After sales" },
  { key: "promotions", label: "Promotions & loyalty" },
  { key: "customers", label: "Customers" },
  { key: "expenses", label: "Expenses" },
  { key: "investors", label: "Investors" },
  { key: "inventory", label: "Inventory" },
  { key: "stock_movements", label: "Stock movements" },
  { key: "suppliers", label: "Suppliers & purchases" },
  { key: "reports", label: "Reports" },
];

export const BACKOFFICE_SECTION_DEFAULTS = Object.fromEntries(
  BACKOFFICE_SECTION_CATALOG.map((section) => [section.key, true]),
);

export function normalizeBackofficeSections(raw) {
  const out = { ...BACKOFFICE_SECTION_DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(out)) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = Boolean(raw[key]);
    }
  }
  return out;
}

export function backofficeSectionsFromCapabilities(capabilitiesOrSettings) {
  const sales =
    capabilitiesOrSettings?.module_settings?.sales ??
    capabilitiesOrSettings?.sales ??
    null;
  const raw =
    sales?.backoffice_sections ??
    capabilitiesOrSettings?.backoffice_sections ??
    null;
  return normalizeBackofficeSections(raw);
}

/** External POS or backoffice create-order is using an operating float. */
export function usesTillFloat(capabilitiesOrSettings) {
  const sales =
    capabilitiesOrSettings?.module_settings?.sales ??
    capabilitiesOrSettings?.sales ??
    capabilitiesOrSettings ??
    {};
  return Boolean(sales.require_pos_till_float || sales.require_backoffice_till_float);
}

/** A section the organization was not given is hidden. Unknown ids stay visible. */
export function isBackofficeSectionEnabled(capabilitiesOrSettings, sectionId) {
  if (!sectionId) return true;
  if (sectionId === "pos" && usesTillFloat(capabilitiesOrSettings)) return true;
  const sections = backofficeSectionsFromCapabilities(capabilitiesOrSettings);
  if (!Object.prototype.hasOwnProperty.call(sections, sectionId)) return true;
  return sections[sectionId] !== false;
}
