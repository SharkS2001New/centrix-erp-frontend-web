import { describe, expect, it } from "vitest";
import {
  isSalesRepTransferTarget,
  transferToOptionsFor,
} from "./inventory-transfer-routes";

describe("sales rep transfer destination", () => {
  it("only offers sales reps when the caller enables the destination", () => {
    expect(
      transferToOptionsFor("store", ["shop", "store"]).some(
        (option) => option.value === "sales_rep",
      ),
    ).toBe(false);
    expect(
      transferToOptionsFor("store", ["shop", "store"], {
        includeSalesRep: true,
      }).some((option) => option.value === "sales_rep"),
    ).toBe(true);
  });

  it("identifies rep allocation as a non-location destination", () => {
    expect(isSalesRepTransferTarget("sales_rep")).toBe(true);
    expect(isSalesRepTransferTarget("shop")).toBe(false);
  });
});
