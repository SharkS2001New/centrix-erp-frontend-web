import { describe, expect, it } from "vitest";
import {
  normalizePaymentsBreakdownSearchQuery,
  parsePaymentsBreakdownAmountQuery,
} from "@/lib/payments-breakdown-search";

describe("parsePaymentsBreakdownAmountQuery", () => {
  it("parses plain, grouped, and currency amounts", () => {
    expect(parsePaymentsBreakdownAmountQuery("5480")).toBe(5480);
    expect(parsePaymentsBreakdownAmountQuery("5,480.00")).toBe(5480);
    expect(parsePaymentsBreakdownAmountQuery("KES 5,480")).toBe(5480);
    expect(parsePaymentsBreakdownAmountQuery("5480 KES")).toBe(5480);
    expect(parsePaymentsBreakdownAmountQuery("5 480")).toBe(5480);
    expect(parsePaymentsBreakdownAmountQuery("1,500.50")).toBe(1500.5);
  });

  it("ignores customer and order text", () => {
    expect(parsePaymentsBreakdownAmountQuery("Walk-in")).toBeNull();
    expect(parsePaymentsBreakdownAmountQuery("S0034")).toBeNull();
    expect(parsePaymentsBreakdownAmountQuery("QK7ABC123")).toBeNull();
  });
});

describe("normalizePaymentsBreakdownSearchQuery", () => {
  it("sends money queries without thousands separators", () => {
    expect(normalizePaymentsBreakdownSearchQuery("5,480.00")).toBe("5480");
    expect(normalizePaymentsBreakdownSearchQuery("KES 1,500.50")).toBe("1500.50");
  });

  it("leaves non-amount search unchanged", () => {
    expect(normalizePaymentsBreakdownSearchQuery("Acme Ltd")).toBe("Acme Ltd");
    expect(normalizePaymentsBreakdownSearchQuery("S0034")).toBe("S0034");
  });
});
