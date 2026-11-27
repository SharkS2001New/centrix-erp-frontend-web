import { describe, expect, it } from "vitest";
import { isNavItemActive, isNavItemVisible, navSections } from "./nav-config";
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

  describe("Backoffice till operations navigation", () => {
    const capabilities = {
      modules: { "sales.backend": true, "sales.pos": false },
      module_settings: { sales: { show_checkout_on_create_order: true } },
    };
    const context = {
      capabilities,
      isModuleEnabled: (key) => Boolean(capabilities.modules[key]),
      hasPermission: () => true,
      isSuperAdmin: () => false,
    };

    it("shows End of day and Payments breakdown without External POS", () => {
      const section = navSections.find((row) => row.id === "pos");
      for (const href of ["/sales/end-of-day", "/sales/payments-breakdown"]) {
        expect(isNavItemVisible(section.items.find((item) => item.href === href), context)).toBe(true);
      }
    });

    it("shows both links to users with Create Order permission", () => {
      const section = navSections.find((row) => row.id === "pos");
      const createOrderContext = {
        ...context,
        hasNavPermission: (code) => code === "sales.orders.create",
      };
      for (const href of ["/sales/end-of-day", "/sales/payments-breakdown"]) {
        expect(
          isNavItemVisible(section.items.find((item) => item.href === href), createOrderContext),
        ).toBe(true);
      }
    });

    it("hides those links when Backoffice create-order checkout is disabled", () => {
      const section = navSections.find((row) => row.id === "pos");
      const disabledContext = {
        ...context,
        capabilities: {
          ...capabilities,
          module_settings: { sales: { show_checkout_on_create_order: false } },
        },
      };
      for (const href of ["/sales/end-of-day", "/sales/payments-breakdown"]) {
        expect(
          isNavItemVisible(section.items.find((item) => item.href === href), disabledContext),
        ).toBe(false);
      }
    });
  });

  describe("sidebar labels", () => {
    it("renames the stock and orders navigation labels", () => {
      const inventory = navSections.find((section) => section.id === "inventory");
      const hospitalityStock = navSections.find((section) => section.id === "hospitality_stock");
      const distributionOrders = navSections.find((section) => section.id === "distribution_orders");

      expect(inventory.items.find((item) => item.href === "/inventory/stock").label).toBe("Items Currently in Stock");
      expect(hospitalityStock.items.find((item) => item.href === "/inventory/stock").label).toBe("Items Currently in Stock");
      expect(distributionOrders.label).toBe("Today's Orders");
    });

    it("preserves apostrophes in title-cased navigation labels", () => {
      expect(formatNavLabel("Today's Orders")).toBe("Today's Orders");
    });
  });
});
