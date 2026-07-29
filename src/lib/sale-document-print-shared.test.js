import { describe, expect, it } from "vitest";
import { resolveSaleOrderCreatorName } from "@/lib/sale-document-print-shared";

describe("resolveSaleOrderCreatorName", () => {
  it("prefers the sale cashier over the reprinting session user", () => {
    expect(
      resolveSaleOrderCreatorName(
        {
          cashier: { username: "till1", full_name: "Jane Cashier" },
        },
        "admin.login",
      ),
    ).toBe("Jane Cashier");
  });

  it("uses cashier_name / created_by_name when relation is missing", () => {
    expect(
      resolveSaleOrderCreatorName(
        { cashier_name: "Order Creator", cashier_id: 9 },
        "logged.in",
      ),
    ).toBe("Order Creator");
  });

  it("falls back to preparedBy only when the sale has no creator fields", () => {
    expect(resolveSaleOrderCreatorName({ id: 1 }, "Session User")).toBe("Session User");
    expect(resolveSaleOrderCreatorName(null, "Session User")).toBe("Session User");
  });
});
