/** Per-organization advanced import destinations (mirrors backend erp.advanced_data_import_pages). */

/** @typedef {'vats' | 'categories' | 'uoms' | 'routes' | 'products' | 'suppliers' | 'customers' | 'retail_packages' | 'employees'} AdvancedDataImportPageKey */

/** @type {Array<{ key: AdvancedDataImportPageKey, label: string, hospitalityLabel?: string, defaultEnabled: boolean, hospitality?: boolean }>} */
export const ADVANCED_DATA_IMPORT_PAGE_OPTIONS = [
  { key: "vats", label: "VAT rates", defaultEnabled: true, hospitality: true },
  { key: "categories", label: "Categories & subcategories", defaultEnabled: true, hospitality: true },
  { key: "uoms", label: "Units of measure", hospitalityLabel: "Serving & stock units", defaultEnabled: true, hospitality: true },
  { key: "routes", label: "Distribution routes", defaultEnabled: false, hospitality: false },
  { key: "products", label: "Products", hospitalityLabel: "Menu products", defaultEnabled: true, hospitality: true },
  { key: "suppliers", label: "Suppliers", defaultEnabled: true, hospitality: true },
  { key: "customers", label: "Customers", defaultEnabled: true, hospitality: false },
  { key: "retail_packages", label: "Retail package settings", defaultEnabled: true, hospitality: false },
  { key: "employees", label: "Employees (HR)", defaultEnabled: false, hospitality: true },
];

export function advancedDataImportPageOptionsForIndustry(industry) {
  if (industry !== "hospitality") return ADVANCED_DATA_IMPORT_PAGE_OPTIONS;
  return ADVANCED_DATA_IMPORT_PAGE_OPTIONS.filter((item) => item.hospitality !== false).map((item) => ({
    ...item,
    label: item.hospitalityLabel ?? item.label,
  }));
}

/** @returns {Record<AdvancedDataImportPageKey, boolean>} */
export function defaultAdvancedDataImportPages() {
  return Object.fromEntries(
    ADVANCED_DATA_IMPORT_PAGE_OPTIONS.map(({ key, defaultEnabled }) => [key, defaultEnabled]),
  );
}

/**
 * @param {Record<string, boolean> | null | undefined} apiPages
 * @returns {Record<AdvancedDataImportPageKey, boolean>}
 */
export function advancedDataImportPagesFromApi(apiPages) {
  const defaults = defaultAdvancedDataImportPages();
  if (!apiPages || typeof apiPages !== "object") return defaults;
  const merged = { ...defaults };
  for (const { key } of ADVANCED_DATA_IMPORT_PAGE_OPTIONS) {
    if (Object.prototype.hasOwnProperty.call(apiPages, key)) {
      merged[key] = Boolean(apiPages[key]);
    }
  }
  return merged;
}
