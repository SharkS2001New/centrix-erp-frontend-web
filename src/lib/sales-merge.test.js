import { describe, expect, it } from "vitest";
import { describeMobileOrderMergeSelection } from "./sales";

function sale(partial) {
  return {
    id: 1,
    order_num: 100,
    channel: "mobile",
    order_source: "mobile",
    customer_num: 55,
    route_id: 3,
    ...partial,
  };
}

describe("describeMobileOrderMergeSelection", () => {
  it("requires at least two orders", () => {
    expect(describeMobileOrderMergeSelection([sale()]).ok).toBe(false);
  });

  it("requires mobile channel", () => {
    const plan = describeMobileOrderMergeSelection([
      sale({ id: 1, order_num: 1 }),
      sale({ id: 2, order_num: 2, channel: "backend", order_source: "backoffice" }),
    ]);
    expect(plan.ok).toBe(false);
    expect(plan.message).toMatch(/mobile/i);
  });

  it("requires same customer", () => {
    const plan = describeMobileOrderMergeSelection([
      sale({ id: 1, order_num: 1, customer_num: 10 }),
      sale({ id: 2, order_num: 2, customer_num: 11 }),
    ]);
    expect(plan.ok).toBe(false);
    expect(plan.message).toMatch(/same registered customer/i);
  });

  it("keeps the lowest order number as target", () => {
    const plan = describeMobileOrderMergeSelection([
      sale({ id: 20, order_num: 220 }),
      sale({ id: 10, order_num: 110 }),
    ]);
    expect(plan.ok).toBe(true);
    expect(plan.target.order_num).toBe(110);
    expect(plan.sources).toHaveLength(1);
    expect(plan.sources[0].order_num).toBe(220);
  });
});
