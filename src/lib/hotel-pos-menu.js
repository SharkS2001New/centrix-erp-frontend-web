/**
 * Hotel POS menu chips and catalogue visibility by cashier outlet channel.
 * Bar never lists kitchen/food; Hotel/Restaurant keeps food + hotel drinks + rooms.
 */

export const HOTEL_POS_MENU_FILTER_CHIPS = [
  { id: "", label: "All", short: "All" },
  { id: "food", label: "Food", short: "Food" },
  { id: "drinks", label: "Drinks", short: "Drinks" },
  { id: "rooms", label: "Rooms", short: "Rooms", requiresRooms: true },
];

export function hotelPosMenuChannel(outletOrChannel) {
  if (outletOrChannel && typeof outletOrChannel === "object") {
    const fromApi = String(outletOrChannel.menu_channel ?? "").toLowerCase();
    if (fromApi === "bar" || fromApi === "hotel") return fromApi;
    const type = String(outletOrChannel.outlet_type ?? "").toLowerCase();
    if (type === "bar") return "bar";
    if (type === "restaurant" || type === "hotel") return "hotel";
    return null;
  }
  const raw = String(outletOrChannel ?? "").toLowerCase();
  if (raw === "bar" || raw === "hotel") return raw;
  return null;
}

export function hotelPosMenuChipsForChannel(channel, { roomsEnabled = false } = {}) {
  const ch = hotelPosMenuChannel(channel);
  return HOTEL_POS_MENU_FILTER_CHIPS.filter((chip) => {
    if (chip.id === "food" && ch === "bar") return false;
    if (chip.id === "rooms") return Boolean(roomsEnabled) && ch !== "bar";
    return true;
  });
}

export function hotelPosCatalogItemVisible(product, { channel, menuGroup = "" } = {}) {
  if (!product) return false;
  const group = String(menuGroup ?? "").trim().toLowerCase();
  const ch = hotelPosMenuChannel(channel);
  const itemGroup = String(product.menu_group ?? "").toLowerCase();

  if (product.is_room) return group === "rooms";
  if (group === "rooms") return false;

  if (ch === "bar") {
    if (product.sell_on_bar === false) return false;
    if (itemGroup === "food") return false;
  }
  if (ch === "hotel") {
    if (product.sell_on_hotel === false) return false;
  }

  if (group === "food" || group === "drinks") {
    return itemGroup === group;
  }
  return true;
}

export function filterHotelPosCatalogItems(products, options) {
  return (products ?? []).filter((product) => hotelPosCatalogItemVisible(product, options));
}
