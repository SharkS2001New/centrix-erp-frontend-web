/**
 * Hotel & Hospitality catalogue mode — separate from Retail & Distribution W/R pricing.
 */

/**
 * @param {object | null | undefined} capabilities
 * @param {string | null | undefined} workspaceId
 */
export function isHotelCatalogueContext(capabilities, workspaceId = null) {
  if (workspaceId === "hospitality_backoffice") return true;
  if (capabilities?.industry === "hospitality") return true;
  if (capabilities?.deployment_profile === "hotel_bar") return true;
  return false;
}

export function hotelCatalogueListCopy() {
  return {
    title: "Menu products",
    subtitle: "Hotel menu items for Hotel POS — Bar and restaurant channels, stock, and pricing.",
    addLabel: "Add menu product",
  };
}

export function retailCatalogueListCopy() {
  return {
    title: "Products",
    subtitle: "Manage catalogue items, pricing and stock levels",
    addLabel: "Add product",
  };
}

/** Shop/store are retail terms. Hotel catalogues use outlet (FOH) and storeroom (BOH). */
export function catalogueStockColumnLabels(hotelCatalogue = false) {
  if (hotelCatalogue) {
    return {
      shop: "Outlet avail.",
      store: "Storeroom avail.",
      shopLong: "Outlet",
      storeLong: "Storeroom",
      shopExport: "Outlet stock",
      storeExport: "Storeroom stock",
      shopCost: "Outlet cost",
      storeCost: "Storeroom cost",
      filterHint: "Outlet, storeroom, and stock filters use",
    };
  }
  return {
    shop: "Shop avail.",
    store: "Store avail.",
    shopLong: "Shop",
    storeLong: "Store / warehouse",
    shopExport: "Shop stock",
    storeExport: "Store stock",
    shopCost: "Shop cost",
    storeCost: "Store cost",
    filterHint: "Shop, store, and stock filters use",
  };
}
