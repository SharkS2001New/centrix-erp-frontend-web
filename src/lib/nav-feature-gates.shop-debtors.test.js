import { describe, expect, it } from "vitest";
import {
  isDirectCheckoutCreditEnabled,
  isExternalPosEnabled,
  isReportNavEnabled,
  isTillOperationsEnabled,
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

  it("defaults the feature on but honors an explicit organization disable", () => {
    expect(
      shouldShowShopDebtors({
        modules: { "sales.pos": true, customers_suppliers: true },
      }),
    ).toBe(true);
    expect(
      shouldShowShopDebtors({
        modules: { "sales.pos": true, customers_suppliers: true },
        module_settings: { sales: { enable_shop_debtors: false } },
      }),
    ).toBe(false);
  });

  it("hides debtor-related reports when the organization disables shop debtors", () => {
    const capabilities = { module_settings: { sales: { enable_shop_debtors: false } } };
    for (const key of [
      "accounts-receivable",
      "ar-aging",
      "credit-outstanding",
      "customer-statement",
      "invoice-payments",
      "top-debtors",
    ]) {
      expect(isReportNavEnabled(key, capabilities)).toBe(false);
    }
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

describe("Backoffice till report visibility", () => {
  const backofficeCheckout = {
    modules: { "sales.backend": true, "sales.pos": false },
    module_settings: { sales: { show_checkout_on_create_order: true } },
  };

  it("enables till operations and EOD reports for Backoffice checkout", () => {
    expect(isTillOperationsEnabled(backofficeCheckout)).toBe(true);
    expect(isReportNavEnabled("eod-report", backofficeCheckout)).toBe(true);
    expect(isReportNavEnabled("eod-cashier", backofficeCheckout)).toBe(true);
  });

  it("requires Backoffice checkout-on-create when External POS is disabled", () => {
    const checkoutDisabled = {
      ...backofficeCheckout,
      module_settings: { sales: { show_checkout_on_create_order: false } },
    };

    expect(isTillOperationsEnabled(checkoutDisabled)).toBe(false);
    expect(isReportNavEnabled("eod-report", checkoutDisabled)).toBe(false);
  });

  it("keeps other POS reports restricted to External POS", () => {
    expect(isReportNavEnabled("discount-summary", backofficeCheckout)).toBe(false);
  });
});

describe("Sales rep stock movement report visibility", () => {
  it("shows the report only when sales rep stock is enabled", () => {
    expect(
      isReportNavEnabled("sales-rep-stock-movements", {
        module_settings: { sales: { sales_rep_stock_enabled: true } },
      }),
    ).toBe(true);
    expect(
      isReportNavEnabled("sales-rep-stock-movements", {
        module_settings: { sales: { sales_rep_stock_enabled: false } },
      }),
    ).toBe(false);
  });
});
