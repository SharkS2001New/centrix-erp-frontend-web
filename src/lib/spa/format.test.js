import { describe, expect, it } from "vitest";
import { businessLabel, featuresFor, ksh, stockStatus } from "@/lib/spa/format";

describe("spa format", () => {
  it("formats Kenyan shillings", () => {
    expect(ksh(28450)).toBe("KSh 28,450");
  });

  it("turns spa tools on without duplicating the shop", () => {
    expect(featuresFor("spa").rooms).toBe(true);
    expect(featuresFor("spa").chairs).toBe(false);
    expect(featuresFor("kinyozi").combos).toBe(true);
    expect(featuresFor("combined").packages).toBe(true);
    expect(businessLabel("combined")).toBe("Centrix SPA & Kinyozi");
  });

  it("marks low stock at the reorder level", () => {
    expect(stockStatus({ qty: 6, reorder: 8 })).toBe("Low stock");
    expect(stockStatus({ qty: 0, reorder: 8 })).toBe("Out of stock");
  });
});
