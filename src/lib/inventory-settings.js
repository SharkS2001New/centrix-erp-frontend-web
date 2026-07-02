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
    allow_sell_from_shop: Boolean(inv.allow_sell_from_shop),
    allow_sell_from_store: Boolean(inv.allow_sell_from_store),
    enable_retail_pricing: Boolean(inv.enable_retail_pricing),
    retail_shop_wholesale_store_stock: Boolean(inv.retail_shop_wholesale_store_stock),
    allow_negative_stock: Boolean(inv.allow_negative_stock),
    stock_alert_mode: ["per_product", "global", "both"].includes(inv.stock_alert_mode)
      ? inv.stock_alert_mode
      : "per_product",
    global_low_stock_threshold:
      inv.global_low_stock_threshold != null && inv.global_low_stock_threshold !== ""
        ? String(inv.global_low_stock_threshold)
        : "",
    stock_adjustment_approval_enabled: Boolean(inv.stock_adjustment_approval_enabled),
  };
}

export function inventoryPayloadFromForm(form) {
  const payload = {
    default_receive_location: form.default_receive_location,
    default_pos_sale_location: form.default_pos_sale_location,
    default_distribution_sale_location: form.default_distribution_sale_location,
    allow_sell_from_shop: Boolean(form.allow_sell_from_shop),
    allow_sell_from_store: Boolean(form.allow_sell_from_store),
    enable_retail_pricing: Boolean(form.enable_retail_pricing),
    retail_shop_wholesale_store_stock: Boolean(form.retail_shop_wholesale_store_stock),
    allow_negative_stock: Boolean(form.allow_negative_stock),
    stock_alert_mode: form.stock_alert_mode,
    stock_adjustment_approval_enabled: Boolean(form.stock_adjustment_approval_enabled),
  };
  if (form.global_low_stock_threshold !== "") {
    payload.global_low_stock_threshold = Number(form.global_low_stock_threshold) || 0;
  } else {
    payload.global_low_stock_threshold = null;
  }
  return payload;
}
