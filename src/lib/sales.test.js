import { describe, expect, it } from "vitest";
import {
  shouldOpenBackofficeOrderEdit,
  shouldRestoreOrderToCart,
} from "@/lib/sales";

describe("sales order edit routing", () => {
  const mobileBookedSale = {
    id: 1,
    status: "booked",
    channel: "mobile",
    order_source: "mobile",
    can_edit: true,
    can_edit_lines: false,
  };

  const posBookedSale = {
    id: 2,
    status: "booked",
    channel: "pos",
    order_source: "pos",
    can_edit: true,
    can_edit_lines: false,
  };

  const capabilitiesWithPos = {
    modules: { sales: true, "sales.pos": true },
  };

  it("opens the line-edit popup for booked mobile orders", () => {
    expect(shouldOpenBackofficeOrderEdit(mobileBookedSale, null, capabilitiesWithPos)).toBe(true);
    expect(shouldRestoreOrderToCart(mobileBookedSale, null, capabilitiesWithPos)).toBe(false);
  });

  it("still restores external POS orders to cart", () => {
    expect(shouldOpenBackofficeOrderEdit(posBookedSale, null, capabilitiesWithPos)).toBe(false);
    expect(shouldRestoreOrderToCart(posBookedSale, null, capabilitiesWithPos)).toBe(true);
  });

  it("prefers the popup when can_edit_lines is true", () => {
    const sale = { ...posBookedSale, can_edit_lines: true };
    expect(shouldOpenBackofficeOrderEdit(sale, null, capabilitiesWithPos)).toBe(true);
    expect(shouldRestoreOrderToCart(sale, null, capabilitiesWithPos)).toBe(false);
  });
});
