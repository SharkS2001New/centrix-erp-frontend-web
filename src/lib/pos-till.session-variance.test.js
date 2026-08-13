import { describe, expect, it } from "vitest";
import { sessionHasClosedCashMaths, resolveSessionVariance } from "./pos-till";

describe("sessionHasClosedCashMaths", () => {
  it("is true when closing_amount is set (including today)", () => {
    expect(sessionHasClosedCashMaths({ closing_amount: 1200 })).toBe(true);
  });

  it("is true when closed_at is set", () => {
    expect(sessionHasClosedCashMaths({ closed_at: "2026-08-14T10:00:00Z" })).toBe(true);
  });

  it("is true when status is closed", () => {
    expect(sessionHasClosedCashMaths({ session_status: "closed" })).toBe(true);
  });

  it("is false for open sessions without closing maths", () => {
    expect(
      sessionHasClosedCashMaths({
        session_status: "open",
        opened_at: "2026-08-14T08:00:00Z",
      }),
    ).toBe(false);
  });
});

describe("resolveSessionVariance", () => {
  it("uses API variance when present", () => {
    expect(resolveSessionVariance({ variance: -25, closing_amount: 100 })).toBe(-25);
  });

  it("computes from closing − expected for closed sessions", () => {
    expect(
      resolveSessionVariance({
        closing_amount: 1050,
        expected_net_sales: 1000,
      }),
    ).toBe(50);
  });

  it("returns null when till maths are not closed", () => {
    expect(resolveSessionVariance({ expected_net_sales: 1000 })).toBeNull();
  });
});
