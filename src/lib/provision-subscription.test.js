import { describe, expect, it } from "vitest";
import {
  buildProvisionSubscriptionPayload,
  emptyProvisionSubscriptionForm,
} from "@/lib/provision-subscription";

describe("provision subscription", () => {
  it("returns null when licence mode is none", () => {
    const form = emptyProvisionSubscriptionForm({ license_mode: "none" });
    expect(buildProvisionSubscriptionPayload(form, [])).toBeNull();
  });

  it("builds a trial payload with end date", () => {
    const form = emptyProvisionSubscriptionForm({
      license_mode: "trial",
      trial_days: "14",
      current_period_start: "2026-07-01",
      current_period_end: "2026-07-15",
      plan_id: "3",
    });
    const payload = buildProvisionSubscriptionPayload(form, [{ id: 3, name: "Starter", interval: "monthly" }]);
    expect(payload).toMatchObject({
      plan_id: 3,
      status: "trialing",
      is_trial: true,
      trial_days: 14,
      current_period_end: "2026-07-15",
    });
  });

  it("builds an active plan payload", () => {
    const form = emptyProvisionSubscriptionForm({
      license_mode: "plan",
      status: "active",
      plan_id: "9",
      current_period_start: "2026-07-01",
      current_period_end: "",
    });
    const payload = buildProvisionSubscriptionPayload(form, [
      { id: 9, name: "Pro", interval: "monthly" },
    ]);
    expect(payload.status).toBe("active");
    expect(payload.plan_id).toBe(9);
    expect(payload.current_period_end).toBe("2026-07-31");
  });
});
