import { describe, expect, it } from "vitest";
import { addProductToHotelCheckInMemory, HOTEL_VOID_ORDER_NAME, isHotelLocalFirstCheckout, resolveHotelPosVoidTarget } from "@/lib/hotel-pos-offline";

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

describe("addProductToHotelCheckInMemory", () => {
  const cola = {
    product_code: "COLA",
    product_name: "Cola",
    unit_price: 150,
    vat_percentage: 16,
  };

  it("adds a line to an empty check without marking it offline", () => {
    const next = addProductToHotelCheckInMemory(null, cola, 1);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].qty).toBe(1);
    expect(next.lines[0].product_code).toBe("COLA");
    expect(next.total).toBe(150);
    expect(next.offline).toBe(false);
  });

  it("increments qty when the same product is tapped again", () => {
    const once = addProductToHotelCheckInMemory(null, cola, 1);
    const twice = addProductToHotelCheckInMemory(once, cola, 1);
    expect(twice.lines).toHaveLength(1);
    expect(twice.lines[0].qty).toBe(2);
    expect(twice.total).toBe(300);
  });

  it("keeps a local check marked offline", () => {
    const next = addProductToHotelCheckInMemory({ id: "local:abc", lines: [] }, cola, 1);
    expect(next.offline).toBe(true);
    expect(next.id).toBe("local:abc");
  });
});

describe("HOTEL_VOID_ORDER_NAME", () => {
  it("is the display name applied when a check is voided", () => {
    expect(HOTEL_VOID_ORDER_NAME).toBe("Void order");
  });
});

describe("resolveHotelPosVoidTarget", () => {
  const sold = { id: 41, status: "paid", check_number: "1041", lines: [{ id: 1 }] };
  const openDraft = { id: 42, status: "open", lines: [] };

  it("voids the current ticket when it has items", () => {
    expect(resolveHotelPosVoidTarget({ ...openDraft, lines: [{ id: 1 }] }, sold)?.id).toBe(42);
  });

  it("voids the last sold check when the current ticket is an empty draft", () => {
    expect(resolveHotelPosVoidTarget(openDraft, sold)?.id).toBe(41);
  });

  it("voids the last sold check when the current ticket is an empty local draft", () => {
    const localDraft = { id: "local:abc", status: "open", offline: true, lines: [] };
    expect(resolveHotelPosVoidTarget(localDraft, sold)?.id).toBe(41);
  });

  it("does not void when the last receipt is already void and the ticket is empty", () => {
    expect(resolveHotelPosVoidTarget(openDraft, { ...sold, status: "void" })).toBeNull();
  });
});
