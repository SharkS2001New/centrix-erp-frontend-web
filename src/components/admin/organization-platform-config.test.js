import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OrganizationModuleToggles,
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
