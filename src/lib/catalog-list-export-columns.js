import {
  CUSTOMER_CATALOG_EXPORT_COLUMNS,
  PRODUCT_CATALOG_EXPORT_COLUMNS,
  SUPPLIER_CATALOG_EXPORT_COLUMNS,
} from "@/lib/report-export-api";

/**
 * Build export/PDF column definitions from the user's visible table column ids.
 *
 * @param {string[]} visibleColumnIds
 * @param {Record<string, { key: string, label: string, align?: string } | Array<{ key: string, label: string, align?: string }>>} defs
 * @param {{ skipIds?: string[], fallback?: Array<{ key: string, label: string, align?: string }> }} [options]
 */
export function exportColumnsFromVisibleIds(visibleColumnIds, defs, options = {}) {
  const skipIds = new Set(options.skipIds ?? ["actions"]);
  const columns = [];

  for (const id of visibleColumnIds ?? []) {
    if (skipIds.has(id)) continue;
    const def = defs[id];
    if (!def) continue;
    if (Array.isArray(def)) {
      columns.push(...def);
    } else {
      columns.push(def);
    }
  }

  if (columns.length) return columns;
  return options.fallback ?? [];
}

export const PRODUCT_LIST_EXPORT_COLUMN_DEFS = {
  product: [
    { key: "product_code", label: "Product code" },
    { key: "product_name", label: "Product name" },
  ],
  unit_price: { key: "unit_price", label: "Unit price", align: "right" },
  cost_price: { key: "last_cost_price", label: "Cost price", align: "right" },
  discount: { key: "discount", label: "Discount" },
  shop: { key: "shop_qty", label: "Shop stock", align: "right" },
  store: { key: "store_qty", label: "Store stock", align: "right" },
  supplier: { key: "supplier_name", label: "Supplier" },
  vat: { key: "vat_treatment", label: "VAT" },
  pricing: { key: "pricing", label: "Pricing" },
};

export const CUSTOMER_LIST_EXPORT_COLUMN_DEFS = {
  customer_num: { key: "customer_num", label: "Customer #" },
  customer_name: { key: "customer_name", label: "Name" },
  customer_type: { key: "customer_type", label: "Type" },
  phone_number: { key: "phone_number", label: "Phone" },
  additional_phone: { key: "additional_phone", label: "Alt. phone" },
  town: { key: "town", label: "Town" },
  route: { key: "route_name", label: "Route" },
  credit_limit: { key: "credit_limit", label: "Credit limit", align: "right" },
  current_balance: { key: "current_balance", label: "Balance", align: "right" },
  kra_pin: { key: "kra_pin", label: "KRA PIN" },
  terms_of_payment: { key: "terms_of_payment", label: "Payment terms" },
};

export const SUPPLIER_LIST_EXPORT_COLUMN_DEFS = {
  supplier_name: [
    { key: "supplier_code", label: "Supplier code" },
    { key: "supplier_name", label: "Supplier" },
  ],
  contact_person: { key: "contact_person", label: "Contact" },
  email: { key: "email", label: "Email" },
  phone: { key: "phone", label: "Phone" },
  alternate_phone: { key: "alternate_phone", label: "Alt. phone" },
  address: { key: "address", label: "Address" },
  town: { key: "town", label: "Town" },
  tax_pin: { key: "tax_pin", label: "KRA PIN" },
  terms_of_payment: { key: "terms_of_payment", label: "Payment terms" },
  current_balance: { key: "current_balance", label: "Amount owing", align: "right" },
  other_contacts: { key: "other_contacts", label: "Other contacts" },
  is_active: { key: "is_active", label: "Status" },
};

export function productExportColumnsFromVisibleIds(visibleColumnIds) {
  return exportColumnsFromVisibleIds(visibleColumnIds, PRODUCT_LIST_EXPORT_COLUMN_DEFS, {
    fallback: PRODUCT_CATALOG_EXPORT_COLUMNS,
  });
}

export function customerExportColumnsFromVisibleIds(visibleColumnIds) {
  return exportColumnsFromVisibleIds(visibleColumnIds, CUSTOMER_LIST_EXPORT_COLUMN_DEFS, {
    fallback: CUSTOMER_CATALOG_EXPORT_COLUMNS,
  });
}

export function supplierExportColumnsFromVisibleIds(visibleColumnIds) {
  return exportColumnsFromVisibleIds(visibleColumnIds, SUPPLIER_LIST_EXPORT_COLUMN_DEFS, {
    fallback: SUPPLIER_CATALOG_EXPORT_COLUMNS,
  });
}
