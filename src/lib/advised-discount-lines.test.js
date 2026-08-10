import { describe, expect, it } from "vitest";
import {
  discountApprovalDiscountPerUnit,
  discountApprovalLineAmount,
  discountApprovalPackQty,
  discountApprovalUnitPrice,
} from "@/lib/advised-discount-lines";

describe("discount approval line display", () => {
  const line = {
    quantity: 50,
    display_quantity: 5,
    qty_disp: "5 carton",
    amount: 5550,
    discount_given: 250,
    unit_price: 1160,
    selling_price: 91.44,
    display_unit_price: 1160,
  };

  it("uses pack qty from display_quantity", () => {
    expect(discountApprovalPackQty(line)).toBe(5);
  });

  it("prefers amount ÷ pack qty so markups match Sales/Orders", () => {
    // (5550 + 250) ÷ 5 = 1160 — same as stored display when consistent
    expect(discountApprovalUnitPrice(line)).toBe(1160);
  });

  it("uses amount ÷ qty when display_unit_price is stale without route markup", () => {
    expect(
      discountApprovalUnitPrice({
        ...line,
        display_unit_price: 1000,
      }),
    ).toBe(1160);
  });

  it("falls back to display then unit when amount is missing", () => {
    expect(
      discountApprovalUnitPrice({
        ...line,
        amount: 0,
        discount_given: 0,
        display_unit_price: 1160,
      }),
    ).toBe(1160);
  });

  it("shows per-pack discount", () => {
    expect(discountApprovalDiscountPerUnit(line)).toBe(50);
  });

  it("uses display amount when present", () => {
    expect(
      discountApprovalLineAmount({
        ...line,
        display_amount: 5550,
        amount: 5800,
      }),
    ).toBe(5550);
  });
});
