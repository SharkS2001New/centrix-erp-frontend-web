import { describe, expect, it } from "vitest";
import { isNavItemActive, navSections } from "./nav-config";
import { formatNavLabel } from "./nav-label-format";

describe("products navigation active state", () => {
  it("keeps deleted products separate from the catalogue nav item", () => {
    const catalogueItem = {
      href: "/products",
      excludePaths: ["/products/deleted"],
    };
    const deletedItem = { href: "/products/deleted" };

    expect(isNavItemActive(catalogueItem, "/products/deleted")).toBe(false);
    expect(isNavItemActive(deletedItem, "/products/deleted")).toBe(true);
    expect(isNavItemActive(catalogueItem, "/products")).toBe(true);
    expect(isNavItemActive(catalogueItem, "/products/ABC123")).toBe(true);
  });

  describe("sidebar labels", () => {
    it("renames the stock and orders navigation labels", () => {
      const inventory = navSections.find((section) => section.id === "inventory");
      const hospitalityStock = navSections.find((section) => section.id === "hospitality_stock");
      const distributionOrders = navSections.find((section) => section.id === "distribution_orders");

      expect(inventory.items.find((item) => item.href === "/inventory/stock").label).toBe("View Stock");
      expect(hospitalityStock.items.find((item) => item.href === "/inventory/stock").label).toBe("View Stock");
      expect(distributionOrders.label).toBe("Today's Orders");
    });

    it("preserves apostrophes in title-cased navigation labels", () => {
      expect(formatNavLabel("Today's Orders")).toBe("Today's Orders");
    });
  });
});
