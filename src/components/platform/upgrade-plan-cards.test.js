import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { monthOffer, PlanGroup } from "@/components/platform/upgrade-plan-cards";

const currentPlanOffer = monthOffer({
  id: 7,
  name: "Shop Starter",
  monthly_price: 2000,
  features: [],
});

function renderCurrentPlan(allowCurrentPlanPurchase = false) {
  return renderToStaticMarkup(
    createElement(PlanGroup, {
      offers: [currentPlanOffer],
      currentName: "Shop Starter",
      currentPlanId: 7,
      canPay: true,
      allowCurrentPlanPurchase,
      onPay: () => {},
    }),
  );
}

describe("PlanGroup current plan checkout", () => {
  it("allows a trialing subscriber to pay for their current plan", () => {
    const markup = renderCurrentPlan(true);

    expect(markup).toContain(">Pay Now</button>");
    expect(markup).not.toContain('disabled=""');
  });

  it("keeps the active subscriber's current plan button disabled", () => {
    const markup = renderCurrentPlan();

    expect(markup).toContain(">Your current plan</button>");
    expect(markup).toContain('disabled=""');
  });
});
