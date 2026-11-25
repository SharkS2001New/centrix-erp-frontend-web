import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OrganizationModuleToggles,
  OrganizationPlatformSalesSettings,
  defaultSalesPlatformState,
  payrollPlatformFromApi,
  payrollPlatformToApi,
  salesPlatformFromApi,
} from "@/components/admin/organization-platform-config";

describe("OrganizationModuleToggles", () => {
  it("renders organization sidebar feature overrides when enabled", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizationModuleToggles, {
        moduleOptions: [],
        enabledModules: {},
        deploymentProfile: "small_shop",
        profilePresets: [],
        salesPlatform: { limit_sidebar_features: true },
        onSalesChange: () => {},
      }),
    );

    expect(markup).toContain("Additional sidebar features for this organization");
  });

  it("shows the organization debtor and credit-report control in Backoffice settings", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizationModuleToggles, {
        moduleOptions: [],
        enabledModules: { "sales.backend": true },
        deploymentProfile: "small_shop",
        profilePresets: [],
        salesPlatform: { enable_shop_debtors: false },
        onSalesChange: () => {},
      }),
    );

    expect(markup).toContain("Shop debtors and credit reports");
    expect(markup).toContain("disables new checkout credit sales.");
    expect(markup).toContain("Existing orders remain available in All Orders.");
  });

  it("shows the AS Mobile quantity prompt control in organization settings", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizationPlatformSalesSettings, {
        enabledModules: { sales: true },
        deploymentProfile: "small_shop",
        salesPlatform: { enable_centrix_as_mobile: true },
        onChange: () => {},
      }),
    );

    expect(markup).toContain("Ask for quantity when adding products");
    expect(markup).toContain("products are added at quantity 1");
  });
});

describe("defaultSalesPlatformState", () => {
  it("enables the touch search keypad only for Hotel POS setup profiles", () => {
    expect(defaultSalesPlatformState("wholesale_retail").pos_touch_search_keypad).toBe(false);
    expect(defaultSalesPlatformState("distribution").pos_touch_search_keypad).toBe(false);
    expect(defaultSalesPlatformState("hotel_bar").pos_touch_search_keypad).toBe(true);
    expect(
      defaultSalesPlatformState("wholesale_retail", {}).pos_touch_search_keypad,
    ).toBe(false);
    expect(defaultSalesPlatformState("hotel_bar", {}).pos_touch_search_keypad).toBe(true);
  });

  it("uses the selected setup profile's server-provided defaults", () => {
    const defaults = defaultSalesPlatformState("small_shop", {
      enable_mobile_orders: false,
      order_workflow: {
        steps: [
          { status: "booked", label: "Booked", enabled: true },
          { status: "unpaid", label: "Unpaid", enabled: true },
          { status: "completed", label: "Completed", enabled: true },
        ],
      },
    });

    expect(defaults.enable_mobile_orders).toBe(false);
    expect(defaults.order_workflow.steps.map((step) => step.status)).toEqual([
      "booked",
      "unpaid",
      "completed",
    ]);
  });

  it("keeps the AS Mobile till-float setting in platform state", () => {
    expect(defaultSalesPlatformState("small_shop").require_as_mobile_till_float).toBe(false);
    expect(
      salesPlatformFromApi({ require_as_mobile_till_float: true }).require_as_mobile_till_float,
    ).toBe(true);
  });

  it("defaults the debtor feature on and reads an organization-level override", () => {
    expect(defaultSalesPlatformState("small_shop").enable_shop_debtors).toBe(true);
    expect(salesPlatformFromApi({ enable_shop_debtors: false }).enable_shop_debtors).toBe(false);
    expect(salesPlatformFromApi({}).enable_shop_debtors).toBe(true);
  });

  it("defaults AS Mobile home cards on and reads per-card overrides", () => {
    const defaults = defaultSalesPlatformState("small_shop").as_mobile_home_cards;
    expect(defaults.products).toBe(true);
    expect(defaults.reports).toBe(true);

    const fromApi = salesPlatformFromApi({
      as_mobile_home_cards: { products: false, reports: false },
    }).as_mobile_home_cards;
    expect(fromApi.products).toBe(false);
    expect(fromApi.reports).toBe(false);
    expect(fromApi.sales).toBe(true);
  });

  it("defaults AS Mobile product codes to automatic and supports an org override", () => {
    expect(
      defaultSalesPlatformState("small_shop").as_mobile_auto_generate_product_code,
    ).toBe(true);
    expect(
      salesPlatformFromApi({ as_mobile_auto_generate_product_code: false })
        .as_mobile_auto_generate_product_code,
    ).toBe(false);
    expect(
      salesPlatformFromApi({}).as_mobile_auto_generate_product_code,
    ).toBe(true);
  });

  it("defaults AS Mobile quantity prompts off and reads the organization setting", () => {
    expect(defaultSalesPlatformState("small_shop").as_mobile_ask_quantity_on_add).toBe(false);
    expect(
      salesPlatformFromApi({ as_mobile_ask_quantity_on_add: true })
        .as_mobile_ask_quantity_on_add,
    ).toBe(true);
    expect(
      salesPlatformFromApi({ as_mobile_ask_quantity_on_add: false })
        .as_mobile_ask_quantity_on_add,
    ).toBe(false);
  });
});

describe("payrollPlatformFromApi", () => {
  it("normalizes setup-profile payroll defaults for provisioning", () => {
    const payroll = payrollPlatformFromApi({
      payroll_month_days_basis: "fixed_30",
      shif_minimum_monthly: 2500,
    });

    expect(payroll).toEqual({
      payroll_month_days_basis: "fixed_30",
      shif_minimum_monthly: "2500",
    });
    expect(payrollPlatformToApi(payroll)).toEqual({
      payroll_month_days_basis: "fixed_30",
      shif_minimum_monthly: 2500,
    });
  });
});
