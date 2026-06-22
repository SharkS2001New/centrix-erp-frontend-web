export const INVENTORY_LOCATION_OPTIONS = [
  { value: "shop", label: "Shop (branch POS)" },
  { value: "store", label: "Store (central warehouse)" },
];

export const STOCK_ALERT_MODE_OPTIONS = [
  { value: "per_product", label: "Per product reorder point" },
  { value: "global", label: "Global threshold only" },
  { value: "both", label: "Both per product and global" },
];

export function inventoryFormFromApi(res) {
  const inv = res?.inventory ?? {};
  return {
    default_receive_location: inv.default_receive_location === "shop" ? "shop" : "store",
    default_pos_sale_location: inv.default_pos_sale_location === "store" ? "store" : "shop",
    default_distribution_sale_location:
      inv.default_distribution_sale_location === "shop" ? "shop" : "store",
    reserve_stock_on_cart: inv.reserve_stock_on_cart !== false,
    cart_reservation_ttl_minutes:
      inv.cart_reservation_ttl_minutes != null && inv.cart_reservation_ttl_minutes !== ""
        ? String(Math.min(15, Math.max(0, Number(inv.cart_reservation_ttl_minutes) || 0)))
        : "15",
    allow_sell_from_shop: Boolean(inv.allow_sell_from_shop),
    allow_sell_from_store: Boolean(inv.allow_sell_from_store),
    enable_retail_pricing: Boolean(inv.enable_retail_pricing),
    retail_shop_wholesale_store_stock: Boolean(inv.retail_shop_wholesale_store_stock),
    enable_barcode_scanner: Boolean(inv.enable_barcode_scanner),
    allow_negative_stock: Boolean(inv.allow_negative_stock),
    stock_alert_mode: ["per_product", "global", "both"].includes(inv.stock_alert_mode)
      ? inv.stock_alert_mode
      : "per_product",
    global_low_stock_threshold:
      inv.global_low_stock_threshold != null && inv.global_low_stock_threshold !== ""
        ? String(inv.global_low_stock_threshold)
        : "",
  };
}

export function inventoryPayloadFromForm(form) {
  const payload = {
    default_receive_location: form.default_receive_location,
    default_pos_sale_location: form.default_pos_sale_location,
    default_distribution_sale_location: form.default_distribution_sale_location,
    reserve_stock_on_cart: Boolean(form.reserve_stock_on_cart),
    cart_reservation_ttl_minutes: Math.min(
      15,
      Math.max(0, Number(form.cart_reservation_ttl_minutes) || 0),
    ),
    allow_sell_from_shop: Boolean(form.allow_sell_from_shop),
    allow_sell_from_store: Boolean(form.allow_sell_from_store),
    enable_retail_pricing: Boolean(form.enable_retail_pricing),
    retail_shop_wholesale_store_stock: Boolean(form.retail_shop_wholesale_store_stock),
    enable_barcode_scanner: Boolean(form.enable_barcode_scanner),
    allow_negative_stock: Boolean(form.allow_negative_stock),
    stock_alert_mode: form.stock_alert_mode,
  };
  if (form.global_low_stock_threshold !== "") {
    payload.global_low_stock_threshold = Number(form.global_low_stock_threshold) || 0;
  } else {
    payload.global_low_stock_threshold = null;
  }
  return payload;
}
