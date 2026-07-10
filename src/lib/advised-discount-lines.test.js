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

  it("prefers API display unit price", () => {
    expect(discountApprovalUnitPrice(line)).toBe(1160);
  });

  it("does not reverse from amount and discount", () => {
    expect(
      discountApprovalUnitPrice({
        ...line,
        display_unit_price: undefined,
        unit_price: 1160,
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
