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
