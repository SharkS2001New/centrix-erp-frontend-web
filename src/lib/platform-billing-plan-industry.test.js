import { describe, expect, it } from "vitest";
import {
  commercialTermsFromPlan,
  emptyPlanForm,
  organizationIndustry,
  planBillingLabel,
  planFormToPayload,
  planRecordToForm,
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

  it("limits trial packages to the organisation setup type when configured", () => {
    const scoped = [
      { ...plans[0], trial_profile_keys: ["small_shop"] },
      { ...plans[0], id: 4, name: "Wholesale", trial_profile_keys: ["wholesale_retail"] },
      { ...plans[0], id: 5, name: "Any setup", trial_profile_keys: [] },
    ];

    expect(
      plansForOrganizationIndustry(
        scoped,
        { deployment_profile: "small_shop" },
        { trialOnly: true },
      ).map((plan) => plan.id),
    ).toEqual([5, 1]);
    expect(
      plansForOrganizationIndustry(
        scoped,
        { deployment_profile: "wholesale_retail" },
        { trialOnly: true },
      ).map((plan) => plan.id),
    ).toEqual([5, 4]);
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

  describe("plan token payment fields", () => {
    it("does not load or send legacy token pack pricing", () => {
      const form = planRecordToForm({
        token_pack_price: 500,
        token_pack_days: 30,
      });

      expect(form).not.toHaveProperty("token_pack_price");
      expect(form).not.toHaveProperty("token_pack_days");

      const payload = planFormToPayload(emptyPlanForm({
        name: "Shop",
        token_pack_price: "500",
        token_pack_days: "30",
      }));

      expect(payload).not.toHaveProperty("token_pack_price");
      expect(payload).not.toHaveProperty("token_pack_days");
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

  it("uses configured installments and the package minimum seat count", () => {
    expect(
      commercialTermsFromPlan({
        name: "Shop Starter",
        interval: "annual",
        yearly_billing: "installments",
        yearly_price: 30000,
        installment_interval_months: 2,
        installment_amount: 5000,
        seat_limit: 1,
        minimum_seat_count: 10,
      }),
    ).toEqual({
      billing_cycle: "yearly",
      first_payment_price: 5000,
      renewal_price: 5000,
      amount: 5000,
      seat_count: 10,
    });
    expect(planBillingLabel({ interval: "annual", yearly_billing: "installments" })).toBe(
      "Yearly · installments",
    );
  });

  it("uses the annual total as the one-time price and permits renewal to be disabled", () => {
    const form = emptyPlanForm({
      name: "Shop",
      interval: "annual",
      yearly_billing: "installments",
      installment_interval_months: "2",
      installment_amount: "5000",
    });
    const installmentPayload = planFormToPayload(form);

    expect(installmentPayload.yearly_price).toBe(30000);
    expect(installmentPayload.installment_amount).toBe(5000);
    expect(installmentPayload.installment_interval_months).toBe(2);

    const oneTimePayload = planFormToPayload(emptyPlanForm({
      name: "Shop",
      interval: "annual",
      yearly_price: "24000",
      renewal_enabled: false,
    }));
    expect(oneTimePayload.yearly_billing).toBe("one_time");
    expect(oneTimePayload.renewal_enabled).toBe(false);
    expect(oneTimePayload.renewal_price).toBe(0);
    expect(emptyPlanForm().interval).toBe("monthly");
    expect(emptyPlanForm().yearly_billing).toBe("one_time");
    expect(emptyPlanForm().renewal_enabled).toBe(true);
  });
});
