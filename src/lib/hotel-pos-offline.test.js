import { describe, expect, it } from "vitest";
import { isHotelLocalFirstCheckout } from "@/lib/hotel-pos-offline";

describe("isHotelLocalFirstCheckout", () => {
  const check = { total: 100, amount_paid: 0, balance_due: 100 };

  it("allows full non-room tenders", () => {
    expect(
      isHotelLocalFirstCheckout({
        check,
        payments: [{ method_code: "CASH", amount: 100 }],
      }),
    ).toBe(true);
    expect(
      isHotelLocalFirstCheckout({
        check,
        payments: [
          { method_code: "CASH", amount: 40 },
          { method_code: "MPESA", amount: 60 },
        ],
      }),
    ).toBe(true);
  });

  it("rejects room charge, folio, partial, and already-paid checks", () => {
    expect(
      isHotelLocalFirstCheckout({
        check,
        folioId: 12,
        payments: [{ method_code: "CASH", amount: 100 }],
      }),
    ).toBe(false);
    expect(
      isHotelLocalFirstCheckout({
        check,
        payments: [{ method_code: "ROOM", amount: 100 }],
      }),
    ).toBe(false);
    expect(
      isHotelLocalFirstCheckout({
        check,
        payments: [{ method_code: "CASH", amount: 40 }],
      }),
    ).toBe(false);
    expect(
      isHotelLocalFirstCheckout({
        check: { ...check, amount_paid: 20, balance_due: 80 },
        payments: [{ method_code: "CASH", amount: 80 }],
      }),
    ).toBe(false);
  });
});
