import { describe, expect, it } from "vitest";
import {
  defaultCancelOrderStatusesFromWorkflow,
  syncCancelOrderStatusesForWorkflowChange,
} from "@/lib/order-action-stages-defaults";

describe("order-action-stages-defaults", () => {
  it("defaults cancel stages to all enabled workflow pipeline steps", () => {
    expect(
      defaultCancelOrderStatusesFromWorkflow({
        steps: [
          { status: "unpaid", enabled: true },
          { status: "pending_payment", enabled: true },
          { status: "paid", enabled: true },
        ],
      }),
    ).toEqual(["unpaid", "pending_payment", "paid"]);
  });

  it("resets cancel stages when workflow still uses the full default selection", () => {
    const oldWorkflow = {
      steps: [
        { status: "unpaid", enabled: true },
        { status: "paid", enabled: true },
      ],
    };
    const newWorkflow = {
      steps: [
        { status: "booked", enabled: true },
        { status: "unpaid", enabled: true },
        { status: "paid", enabled: true },
      ],
    };

    expect(
      syncCancelOrderStatusesForWorkflowChange(["unpaid", "paid"], oldWorkflow, newWorkflow),
    ).toEqual(["booked", "unpaid", "paid"]);
  });

  it("keeps custom cancel selections that remain valid after workflow changes", () => {
    const oldWorkflow = {
      steps: [
        { status: "booked", enabled: true },
        { status: "unpaid", enabled: true },
        { status: "paid", enabled: true },
      ],
    };
    const newWorkflow = {
      steps: [
        { status: "unpaid", enabled: true },
        { status: "paid", enabled: true },
      ],
    };

    expect(
      syncCancelOrderStatusesForWorkflowChange(["unpaid"], oldWorkflow, newWorkflow),
    ).toEqual(["unpaid"]);
  });
});
