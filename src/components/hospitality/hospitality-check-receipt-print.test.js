import { describe, expect, it } from "vitest";
import { resolveGuestCheckTitle } from "./hospitality-check-receipt-print";

describe("resolveGuestCheckTitle", () => {
  it("prints VOID ORDER for a voided check even if the caller passed an unpaid title", () => {
    expect(resolveGuestCheckTitle("Unpaid order", { status: "void" }, "void")).toBe("VOID ORDER");
  });

  it("prints VOID ORDER for a voided paid receipt reprint", () => {
    expect(resolveGuestCheckTitle("Paid receipt", { status: "void" }, "void")).toBe("VOID ORDER");
  });
});
