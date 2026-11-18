/** Centrix product import columns (name-based linking; IDs are also accepted). */
export const RETAIL_PRODUCT_IMPORT_COLUMNS = [
  { key: "product_code", label: "Product code", aliases: ["sku", "item_code", "barcode", "code"] },
  { key: "product_name", label: "Product name", aliases: ["product", "name", "item", "item_name", "description"] },
  { key: "category_name", label: "Category" },
  { key: "subcategory_name", label: "Subcategory" },
  { key: "subcategory_id", label: "Subcategory ID" },
  { key: "measure_name", label: "Unit", aliases: ["uom", "unit_of_measure", "measurement_unit"] },
  { key: "unit_id", label: "Unit ID" },
  { key: "uom_label", label: "Unit of measure" },
  { key: "unit_price", label: "Unit price", aliases: ["selling_price", "retail_price", "price"] },
  { key: "last_cost_price", label: "Cost price", aliases: ["cost", "purchase_price"] },
  { key: "discount_type", label: "Discount type" },
  { key: "discount_percentage", label: "Discount percentage" },
  { key: "discount_value", label: "Discount value" },
  { key: "product_weight", label: "Product weight" },
  { key: "shelf_location", label: "Shelf location" },
  { key: "stock_in_shop", label: "Shop stock", aliases: ["shop_stock", "outlet_stock"] },
  { key: "stock_in_store", label: "Store stock", aliases: ["store_stock", "storeroom_stock"] },
  { key: "reorder_point", label: "Reorder point" },
  { key: "supplier_name", label: "Supplier" },
  { key: "supplier_id", label: "Supplier ID" },
  { key: "vat_code", label: "VAT code" },
  { key: "vat_id", label: "VAT ID" },
  { key: "sell_on_retail", label: "Sell on retail" },
  { key: "sell_on_bar", label: "Sell on bar" },
  { key: "sell_on_hotel", label: "Sell on hotel / restaurant" },
];

export const MENU_PRODUCT_IMPORT_COLUMNS = [
  { key: "product_code", label: "Product code", aliases: ["sku", "item_code", "barcode", "code"] },
  { key: "product_name", label: "Product name", aliases: ["product", "name", "item", "item_name", "description"] },
  { key: "category_name", label: "Category" },
  { key: "subcategory_name", label: "Subcategory" },
  { key: "subcategory_id", label: "Subcategory ID" },
  { key: "measure_name", label: "Unit", aliases: ["uom", "unit_of_measure", "measurement_unit"] },
  { key: "unit_id", label: "Unit ID" },
  { key: "uom_label", label: "Unit of measure" },
  { key: "unit_price", label: "Unit price", aliases: ["selling_price", "retail_price", "price"] },
  { key: "last_cost_price", label: "Cost price", aliases: ["cost", "purchase_price"] },
  { key: "shelf_location", label: "Storeroom shelf" },
  { key: "stock_in_shop", label: "Outlet stock", aliases: ["shop_stock", "shop stock", "outlet_stock"] },
  { key: "stock_in_store", label: "Storeroom stock", aliases: ["store_stock", "store stock", "storeroom_stock"] },
  { key: "reorder_point", label: "Reorder point" },
  { key: "vat_code", label: "VAT code" },
  { key: "vat_id", label: "VAT ID" },
  { key: "sell_on_bar", label: "Sell on bar" },
  { key: "sell_on_hotel", label: "Sell on hotel / restaurant" },
];

/**
 * @param {{ includeShelfLocation?: boolean, hotelCatalogue?: boolean }} [options]
 */
export function productImportColumns({ includeShelfLocation = true, hotelCatalogue = false } = {}) {
  const columns = hotelCatalogue ? MENU_PRODUCT_IMPORT_COLUMNS : RETAIL_PRODUCT_IMPORT_COLUMNS;
  return includeShelfLocation ? columns : columns.filter((column) => column.key !== "shelf_location");
}
