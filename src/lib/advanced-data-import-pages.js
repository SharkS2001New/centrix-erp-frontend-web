/** Per-organization advanced import destinations (mirrors backend erp.advanced_data_import_pages). */

/** @typedef {'vats' | 'categories' | 'uoms' | 'routes' | 'products' | 'suppliers' | 'customers' | 'retail_packages' | 'employees'} AdvancedDataImportPageKey */

/** @type {Array<{ key: AdvancedDataImportPageKey, label: string, defaultEnabled: boolean }>} */
export const ADVANCED_DATA_IMPORT_PAGE_OPTIONS = [
  { key: "vats", label: "VAT rates", defaultEnabled: true },
  { key: "categories", label: "Categories & subcategories", defaultEnabled: true },
  { key: "uoms", label: "Units of measure", defaultEnabled: true },
  { key: "routes", label: "Distribution routes", defaultEnabled: false },
  { key: "products", label: "Products", defaultEnabled: true },
  { key: "suppliers", label: "Suppliers", defaultEnabled: true },
  { key: "customers", label: "Customers", defaultEnabled: true },
  { key: "retail_packages", label: "Retail package settings", defaultEnabled: true },
  { key: "employees", label: "Employees (HR)", defaultEnabled: false },
];

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
