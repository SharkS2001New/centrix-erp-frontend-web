import { describe, expect, it } from "vitest";
import { addProductToHotelCheckInMemory, mergeHotelCheckFromServer, HOTEL_VOID_ORDER_NAME, isHotelLocalFirstCheckout, resolveHotelPosVoidTarget, hotelOfflineSyncProductLines, healHotelOfflineSyncBody } from "@/lib/hotel-pos-offline";

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

  it("stamps a stable client_key for list rendering", () => {
    const next = addProductToHotelCheckInMemory(null, cola, 1);
    expect(next.lines[0].client_key).toBe("p:COLA");
  });
});

describe("mergeHotelCheckFromServer", () => {
  it("keeps optimistic lines that the server has not caught up to yet", () => {
    const optimistic = addProductToHotelCheckInMemory(
      addProductToHotelCheckInMemory(null, {
        product_code: "COLA",
        product_name: "Cola",
        unit_price: 150,
      }, 1),
      { product_code: "SODA", product_name: "Soda", unit_price: 100 },
      1,
    );
    const server = {
      id: 55,
      check_number: "HTL-1",
      status: "open",
      lines: [
        {
          id: 901,
          product_code: "COLA",
          description: "Cola",
          qty: 1,
          unit_price: 150,
          line_total: 150,
          vat_amount: 0,
        },
      ],
      subtotal: 150,
      total: 150,
    };

    const merged = mergeHotelCheckFromServer(server, optimistic, [
      { product_code: "SODA" },
    ]);

    expect(merged.id).toBe(55);
    expect(merged.lines).toHaveLength(2);
    expect(merged.lines.map((l) => l.product_code)).toEqual(["COLA", "SODA"]);
    expect(merged.lines[0].id).toBe(901);
    expect(merged.lines[0].client_key).toBe("p:COLA");
    expect(merged.lines[1].product_code).toBe("SODA");
    expect(merged.total).toBe(250);
  });

  it("keeps a higher optimistic qty while another tap is still queued", () => {
    const optimistic = addProductToHotelCheckInMemory(
      addProductToHotelCheckInMemory(null, {
        product_code: "COLA",
        product_name: "Cola",
        unit_price: 150,
      }, 1),
      { product_code: "COLA", product_name: "Cola", unit_price: 150 },
      1,
    );
    const server = {
      id: 55,
      lines: [
        {
          id: 901,
          product_code: "COLA",
          description: "Cola",
          qty: 1,
          unit_price: 150,
          line_total: 150,
          vat_amount: 0,
        },
      ],
      total: 150,
    };

    const merged = mergeHotelCheckFromServer(server, optimistic, [
      { product_code: "COLA" },
    ]);

    expect(merged.lines).toHaveLength(1);
    expect(merged.lines[0].qty).toBe(2);
    expect(merged.lines[0].id).toBe(901);
    expect(merged.total).toBe(300);
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

describe("hotel offline sync product lines", () => {
  it("drops room stays and blank product codes so sync is not blocked", () => {
    expect(
      hotelOfflineSyncProductLines([
        { product_code: "COLA", qty: 2 },
        { product_code: null, qty: 1, modifiers: { type: "room_stay" } },
        { product_code: "", qty: 1 },
        { product_code: "ROOM-12", qty: 1, is_room_stay: true },
        { product_code: "COLA", qty: 1 },
      ]),
    ).toEqual([{ product_code: "COLA", qty: 3 }]);
  });

  it("heals a queued sync body from the stored check snapshot", () => {
    const healed = healHotelOfflineSyncBody(
      {
        lines: [
          { product_code: null, qty: 1 },
          { product_code: "FRIES", qty: 1 },
        ],
      },
      {
        lines: [
          { product_code: "FRIES", qty: 2 },
          { product_code: null, description: "Room 12", modifiers: { type: "room_stay" } },
        ],
      },
    );
    expect(healed.lines).toEqual([{ product_code: "FRIES", qty: 2 }]);
  });
});
