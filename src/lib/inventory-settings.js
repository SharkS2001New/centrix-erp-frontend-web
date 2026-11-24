export const INVENTORY_LOCATION_OPTIONS = [
  { value: "shop", label: "Shop (branch POS)" },
  { value: "store", label: "Store (central warehouse)" },
];

function salesSettingsFrom(source) {
  if (!source || typeof source !== "object") return null;
  if (source.module_settings?.sales) return source.module_settings.sales;
  if (source.sales && typeof source.sales === "object") return source.sales;
  if (source.inventory && typeof source.inventory === "object") return source.inventory;
  return source;
}

export function availableStockLocations(source) {
  const sales = salesSettingsFrom(source);
  if (!sales) return ["shop", "store"];

  if (sales.retail_shop_wholesale_store_stock === true) return ["shop", "store"];

  const allowShop =
    Object.prototype.hasOwnProperty.call(sales, "allow_sell_from_shop")
      ? Boolean(sales.allow_sell_from_shop)
      : true;
  const allowStore = Boolean(sales.allow_sell_from_store);

  if (allowShop && allowStore) return ["shop", "store"];
  if (allowStore) return ["store"];
  return ["shop"];
}

export function singleStockLocation(source) {
  const locations = availableStockLocations(source);
  return locations.length === 1 ? locations[0] : null;
}

export function stockLocationOptionsFor(source, options = INVENTORY_LOCATION_OPTIONS) {
  const available = new Set(availableStockLocations(source));
  return options.filter((option) => !["shop", "store"].includes(option.value) || available.has(option.value));
}

export function defaultStockLocation(source, fallback = "shop") {
  const locations = availableStockLocations(source);
  const single = locations.length === 1 ? locations[0] : null;
  if (single) return single;
  return locations.includes(fallback) ? fallback : locations[0];
}

export const STOCK_ALERT_MODE_OPTIONS = [
  { value: "per_product", label: "Per product reorder point" },
  { value: "global", label: "Global threshold only" },
  { value: "both", label: "Both per product and global" },
];

export function inventoryFormFromApi(res) {
  const inv = res?.inventory ?? {};
  const form = {
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
    stock_transfer_approval_enabled: Boolean(inv.stock_transfer_approval_enabled),
    damage_write_off_approval_enabled: Boolean(inv.damage_write_off_approval_enabled),
  };

  const onlyLocation = singleStockLocation(form);
  if (onlyLocation) {
    form.default_receive_location = onlyLocation;
    form.default_pos_sale_location = onlyLocation;
    form.default_distribution_sale_location = onlyLocation;
  }

  return form;
}

export function inventoryPayloadFromForm(form) {
  const onlyLocation = singleStockLocation(form);
  const payload = {
    default_receive_location: onlyLocation ?? form.default_receive_location,
    default_pos_sale_location: onlyLocation ?? form.default_pos_sale_location,
    default_distribution_sale_location: onlyLocation ?? form.default_distribution_sale_location,
    allow_sell_from_shop: Boolean(form.allow_sell_from_shop),
    allow_sell_from_store: Boolean(form.allow_sell_from_store),
    enable_retail_pricing: Boolean(form.enable_retail_pricing),
    retail_shop_wholesale_store_stock: Boolean(form.retail_shop_wholesale_store_stock),
    allow_negative_stock: Boolean(form.allow_negative_stock),
    stock_alert_mode: form.stock_alert_mode,
    stock_adjustment_approval_enabled: Boolean(form.stock_adjustment_approval_enabled),
    stock_transfer_approval_enabled: Boolean(form.stock_transfer_approval_enabled),
    damage_write_off_approval_enabled: Boolean(form.damage_write_off_approval_enabled),
  };
  if (form.global_low_stock_threshold !== "") {
    payload.global_low_stock_threshold = Number(form.global_low_stock_threshold) || 0;
  } else {
    payload.global_low_stock_threshold = null;
  }
  return payload;
}
