import { describe, expect, it } from "vitest";
import {
  filterHotelPosCatalogItems,
  hotelPosCatalogItemVisible,
  hotelPosMenuChipsForChannel,
} from "@/lib/hotel-pos-menu";

describe("hotelPosMenuChipsForChannel", () => {
  it("hides Food and Rooms on Bar", () => {
    const ids = hotelPosMenuChipsForChannel("bar", { roomsEnabled: true }).map((c) => c.id);
    expect(ids).toEqual(["", "drinks"]);
  });

  it("keeps Food, Drinks, and Rooms on Hotel when rooms are enabled", () => {
    const ids = hotelPosMenuChipsForChannel("hotel", { roomsEnabled: true }).map((c) => c.id);
    expect(ids).toEqual(["", "food", "drinks", "rooms"]);
  });

  it("hides Rooms on Hotel when rooms service is off", () => {
    const ids = hotelPosMenuChipsForChannel("hotel", { roomsEnabled: false }).map((c) => c.id);
    expect(ids).toEqual(["", "food", "drinks"]);
  });
});

describe("hotelPosCatalogItemVisible", () => {
  const food = { product_code: "F1", menu_group: "food", sell_on_bar: true, sell_on_hotel: true };
  const drink = { product_code: "D1", menu_group: "drinks", sell_on_bar: true, sell_on_hotel: false };

  it("never shows food on Bar even when sell_on_bar is on", () => {
    expect(hotelPosCatalogItemVisible(food, { channel: "bar" })).toBe(false);
    expect(hotelPosCatalogItemVisible(drink, { channel: "bar" })).toBe(true);
  });

  it("shows hotel food and hides bar-only drinks on Hotel", () => {
    expect(hotelPosCatalogItemVisible(food, { channel: "hotel" })).toBe(true);
    expect(hotelPosCatalogItemVisible(drink, { channel: "hotel" })).toBe(false);
  });

  it("filters All lists for the cashier channel", () => {
    const rows = filterHotelPosCatalogItems([food, drink], { channel: "bar" });
    expect(rows.map((r) => r.product_code)).toEqual(["D1"]);
  });
});
