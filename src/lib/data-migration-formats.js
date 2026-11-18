import { productImportColumns } from "@/lib/product-import-format";

export const CUSTOMER_IMPORT_COLUMNS = [
  { key: "customer_name", label: "Customer name", aliases: ["name", "customer", "client", "client_name", "company_name"] },
  { key: "customer_num", label: "Customer number", aliases: ["customer_number", "customer_no"] },
  { key: "customer_type", label: "Customer type", aliases: ["type", "account_type"] },
  { key: "phone_number", label: "Phone", aliases: ["phone", "mobile", "mobile_number", "contact_number"] },
  { key: "additional_phone", label: "Alternate phone", aliases: ["alt_phone", "alternate_phone", "second_phone"] },
  { key: "email", label: "Email", aliases: ["email_address"] },
  { key: "town", label: "Town", aliases: ["city", "location"] },
  { key: "route_name", label: "Route", aliases: ["route"] },
  { key: "route_id", label: "Route ID", autoMap: false },
  { key: "branch_id", label: "Branch ID", autoMap: false },
  { key: "kra_pin", label: "KRA PIN", aliases: ["tax_pin", "pin"] },
  { key: "terms_of_payment", label: "Payment terms", aliases: ["payment_terms", "credit_terms"] },
  { key: "credit_limit", label: "Credit limit", aliases: ["maximum_credit"] },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude", aliases: ["long"] },
];

export const SUPPLIER_IMPORT_COLUMNS = [
  { key: "supplier_name", label: "Supplier name", aliases: ["name", "supplier", "vendor", "vendor_name", "company_name"] },
  { key: "supplier_code", label: "Supplier code", aliases: ["code", "vendor_code", "account_number"] },
  { key: "contact_person", label: "Contact person", aliases: ["contact", "representative"] },
  { key: "phone", label: "Phone", aliases: ["phone_number", "mobile", "contact_number"] },
  { key: "alternate_phone", label: "Alternate phone", aliases: ["alt_phone", "secondary_phone"] },
  { key: "email", label: "Email", aliases: ["email_address"] },
  { key: "town", label: "Town", aliases: ["city", "location"] },
  { key: "tax_pin", label: "Tax PIN", aliases: ["kra_pin", "pin"] },
  { key: "terms_of_payment", label: "Payment terms", aliases: ["payment_terms", "credit_terms"] },
  { key: "address", label: "Address", aliases: ["postal_address"] },
  { key: "is_active", label: "Active", aliases: ["active", "status"] },
];

export const UOM_IMPORT_COLUMNS = [
  { key: "measure_name", label: "Measure name", aliases: ["unit", "uom", "unit_name", "abbreviation", "symbol"] },
  { key: "full_name", label: "Full name", aliases: ["unit_full_name", "display_name", "description"] },
  { key: "uses_small_packaging", label: "Uses small packaging", aliases: ["has_small_packaging", "uses_pieces"] },
  { key: "small_packaging_label", label: "Small packaging label", aliases: ["small_unit", "small_unit_label"] },
  { key: "middle_packaging_label", label: "Middle packaging label", aliases: ["middle_unit", "middle_unit_label"] },
  { key: "middle_factor", label: "Middle factor", aliases: ["middle_conversion_factor"] },
  { key: "conversion_factor", label: "Conversion factor", aliases: ["base_factor", "unit_factor"] },
  { key: "uom_type", label: "Unit type", aliases: ["type", "unit_category"] },
  { key: "is_active", label: "Active", aliases: ["active", "status"] },
];

export const CATEGORY_IMPORT_COLUMNS = [
  { key: "category_name", label: "Category name", aliases: ["category", "name", "group"] },
];

export const SUBCATEGORY_IMPORT_COLUMNS = [
  { key: "subcategory_name", label: "Subcategory name", aliases: ["subcategory", "sub_category", "sub_category_name", "name"] },
  { key: "category_name", label: "Category name", aliases: ["category", "parent_category"] },
  { key: "category_id", label: "Category ID", aliases: ["parent_category_id"], autoMap: false },
];

export const DATA_MIGRATION_FORMATS = {
  retail_products: {
    label: "Retail products",
    fileName: "centrix-products-import.csv",
    type: "products",
    columns: productImportColumns({ includeShelfLocation: true }),
    requiredKeys: ["product_name"],
    requiredAlternatives: [["subcategory_name", "subcategory_id"], ["measure_name", "uom_label", "unit_id"]],
    previewFields: [
      ["product_code", "Code"],
      ["product_name", "Product"],
      ["category_name", "Category"],
      ["subcategory_name", "Subcategory"],
      ["measure_name", "Unit"],
      ["unit_price", "Price"],
    ],
    description: "Convert a retail product list to Centrix product import columns.",
  },
  menu_products: {
    label: "Hotel menu products",
    fileName: "centrix-menu-products-import.csv",
    type: "products",
    columns: productImportColumns({ includeShelfLocation: true, hotelCatalogue: true }),
    requiredKeys: ["product_name"],
    requiredAlternatives: [["subcategory_name", "subcategory_id"], ["measure_name", "uom_label", "unit_id"]],
    previewFields: [
      ["product_code", "Code"],
      ["product_name", "Menu item"],
      ["category_name", "Category"],
      ["subcategory_name", "Subcategory"],
      ["measure_name", "Unit"],
      ["unit_price", "Price"],
    ],
    description: "Convert hotel and restaurant menu items to Centrix menu product import columns.",
  },
  customers: {
    label: "Customers",
    fileName: "centrix-customers-import.csv",
    type: "customers",
    columns: CUSTOMER_IMPORT_COLUMNS,
    requiredKeys: ["customer_name"],
    previewFields: [
      ["customer_name", "Customer"],
      ["customer_num", "Customer number"],
      ["phone_number", "Phone"],
      ["email", "Email"],
      ["town", "Town"],
      ["credit_limit", "Credit limit"],
    ],
    description: "Convert customer contacts, customer numbers, credit terms, and credit limits to Centrix customer import columns.",
  },
  suppliers: {
    label: "Suppliers",
    fileName: "centrix-suppliers-import.csv",
    type: "suppliers",
    columns: SUPPLIER_IMPORT_COLUMNS,
    requiredKeys: ["supplier_name"],
    previewFields: [
      ["supplier_name", "Supplier"],
      ["supplier_code", "Code"],
      ["contact_person", "Contact"],
      ["phone", "Phone"],
      ["email", "Email"],
      ["town", "Town"],
    ],
    description: "Convert supplier contacts, codes, payment terms, and status to Centrix supplier import columns.",
  },
  uoms: {
    label: "Units of measure",
    fileName: "centrix-units-of-measure-import.csv",
    type: "uoms",
    columns: UOM_IMPORT_COLUMNS,
    requiredAlternatives: [["measure_name", "full_name"]],
    previewFields: [
      ["measure_name", "Measure"],
      ["full_name", "Full name"],
      ["small_packaging_label", "Small unit"],
      ["middle_packaging_label", "Middle unit"],
      ["conversion_factor", "Conversion factor"],
      ["uom_type", "Type"],
    ],
    description: "Convert stock or serving units, packaging labels, and conversion factors to Centrix UOM import columns.",
  },
  categories: {
    label: "Product categories",
    fileName: "centrix-categories-import.csv",
    type: "categories",
    columns: CATEGORY_IMPORT_COLUMNS,
    requiredKeys: ["category_name"],
    previewFields: [["category_name", "Category"]],
    description: "Convert product categories to Centrix category import columns.",
  },
  subcategories: {
    label: "Product subcategories",
    fileName: "centrix-subcategories-import.csv",
    type: "subcategories",
    columns: SUBCATEGORY_IMPORT_COLUMNS,
    requiredKeys: ["subcategory_name"],
    requiredAlternatives: [["category_name", "category_id"]],
    previewFields: [
      ["category_name", "Category"],
      ["subcategory_name", "Subcategory"],
      ["category_id", "Category ID"],
    ],
    description: "Convert product subcategories with their parent category name or Centrix category ID.",
  },
};

export const DATA_MIGRATION_FORMAT_OPTIONS = Object.entries(DATA_MIGRATION_FORMATS).map(
  ([value, format]) => ({ value, label: format.label }),
);
