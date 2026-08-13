import { describe, expect, it } from "vitest";
import {
  isDirectCheckoutCreditEnabled,
  isExternalPosEnabled,
  shouldShowShopDebtors,
} from "./nav-feature-gates";
import { isRouteOnlyCustomers } from "./distribution-settings";

describe("shouldShowShopDebtors", () => {
  it("shows for External POS orgs", () => {
    expect(
      shouldShowShopDebtors({
        modules: { "sales.pos": true, customers_suppliers: true },
      }),
    ).toBe(true);
    expect(isExternalPosEnabled({ modules: { "sales.pos": true } })).toBe(true);
  });

  it("shows when direct-checkout credit is enabled", () => {
    expect(
      shouldShowShopDebtors({
        modules: { customers_suppliers: true },
        module_settings: { sales: { enable_credit_payment: true } },
      }),
    ).toBe(true);
    expect(
      isDirectCheckoutCreditEnabled({
        modules: { customers_suppliers: true },
        module_settings: { sales: { enable_credit_payment: true } },
      }),
    ).toBe(true);
  });

  it("shows for non-distribution customer orgs without POS", () => {
    expect(
      shouldShowShopDebtors({
        modules: { customers_suppliers: true },
        module_settings: { sales: { enable_credit_payment: false } },
      }),
    ).toBe(true);
  });

  it("hides for distribution-only orgs without POS or credit", () => {
    expect(
      shouldShowShopDebtors({
        modules: { distribution: true, customers_suppliers: true },
        module_settings: { sales: { enable_credit_payment: false } },
      }),
    ).toBe(false);
  });

  it("shows for distribution orgs with External POS", () => {
    expect(
      shouldShowShopDebtors({
        modules: {
          distribution: true,
          customers_suppliers: true,
          "sales.pos": true,
        },
        module_settings: { sales: { enable_credit_payment: false } },
      }),
    ).toBe(true);
  });
});

describe("isRouteOnlyCustomers with shop debtors", () => {
  it("stays route-only for pure distribution", () => {
    expect(
      isRouteOnlyCustomers({
        modules: { distribution: true },
        module_settings: { sales: { enable_credit_payment: false } },
      }),
    ).toBe(true);
  });

  it("allows debtor customers when distribution has External POS", () => {
    expect(
      isRouteOnlyCustomers({
        modules: { distribution: true, "sales.pos": true },
      }),
    ).toBe(false);
  });
});
