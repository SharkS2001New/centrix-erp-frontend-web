import { describe, expect, it } from "vitest";
import {
  commercialTermsFromPlan,
  organizationIndustry,
  planBillingLabel,
  plansForOrganizationIndustry,
  platformPlanOptionLabel,
} from "@/lib/platform-billing";

describe("subscription package industry filter", () => {
  const plans = [
    { id: 1, name: "Shop", industry: "commerce", interval: "monthly", monthly_price: 2000, currency: "KES", self_serve: true, seat_limit: 3 },
    { id: 2, name: "Drive", industry: "driving", interval: "monthly", monthly_price: 1500, currency: "KES", self_serve: true },
    { id: 3, name: "Hotel", industry: "hospitality", interval: "yearly", yearly_price: 10000, currency: "KES" },
  ];

  it("maps deployment profile to industry", () => {
    expect(organizationIndustry({ deployment_profile: "driving_school" })).toBe("driving");
    expect(organizationIndustry({ deployment_profile: "spa_kinyozi" })).toBe("spa");
  });

  it("only lists packages for the organisation industry", () => {
    const driving = plansForOrganizationIndustry(plans, { deployment_profile: "driving_school" });
    expect(driving.map((plan) => plan.id)).toEqual([2]);
  });

  it("keeps the current package even when industries differ", () => {
    const list = plansForOrganizationIndustry(plans, { deployment_profile: "driving_school" }, { keepPlanId: 1 });
    expect(list.map((plan) => plan.id)).toEqual([1, 2]);
  });

  it("labels a package with renew price and interval", () => {
    expect(platformPlanOptionLabel(plans[0])).toContain("Shop");
    expect(platformPlanOptionLabel(plans[0])).toContain("month");
  });
});

describe("commercialTermsFromPlan", () => {
  it("uses monthly price as renewal and package seats", () => {
    expect(
      commercialTermsFromPlan({
        interval: "monthly",
        monthly_price: 2500,
        seat_limit: 5,
      }),
    ).toEqual({
      billing_cycle: "monthly",
      first_payment_price: 2500,
      renewal_price: 2500,
      amount: 2500,
      seat_count: 5,
    });
  });

  it("yearly subscription renews at the yearly package amount", () => {
    expect(
      commercialTermsFromPlan({
        interval: "yearly",
        yearly_billing: "subscription",
        yearly_price: 24000,
        seat_limit: 2,
      }),
    ).toEqual({
      billing_cycle: "yearly",
      first_payment_price: 24000,
      renewal_price: 24000,
      amount: 24000,
      seat_count: 2,
    });
    expect(planBillingLabel({ interval: "yearly", yearly_billing: "subscription" })).toBe(
      "Yearly · subscription",
    );
  });

  it("yearly one-time uses agreed renewal amount", () => {
    expect(
      commercialTermsFromPlan({
        interval: "annual",
        yearly_billing: "one_time",
        yearly_price: 30000,
        renewal_price: 18000,
        seat_limit: 1,
      }),
    ).toEqual({
      billing_cycle: "yearly",
      first_payment_price: 30000,
      renewal_price: 18000,
      amount: 30000,
      seat_count: 1,
    });
    expect(planBillingLabel({ interval: "yearly", yearly_billing: "one_time" })).toBe(
      "Yearly · one-time",
    );
  });
});
