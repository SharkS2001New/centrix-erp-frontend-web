import { describe, expect, it } from "vitest";
import { defaultSalesPlatformState } from "@/components/admin/organization-platform-config";

describe("defaultSalesPlatformState", () => {
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
});
