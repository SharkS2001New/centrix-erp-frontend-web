import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("@/lib/api", () => ({
  apiRequest: (...args) => apiRequest(...args),
  ApiError: class ApiError extends Error {},
  formatApiErrorMessage: (body, fallback) => fallback,
}));

vi.mock("@/lib/pos-offline-db", () => ({
  clampPosOrderBusinessDate: (d) => d,
  normalizePosOrderDate: (d) => d,
  todayPosOrderDate: () => "2026-08-10",
  idbFindSyncedServerSaleIdByPosTicket: async () => null,
}));

describe("wipeTemporaryCartLines", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("DELETEs sticky TemporaryCart lines and returns an empty cart", async () => {
    apiRequest.mockResolvedValueOnce({ ok: true });
    const { wipeTemporaryCartLines } = await import("@/lib/pos-offline");
    const next = await wipeTemporaryCartLines({
      id: 42,
      lines: [{ product_code: "A", quantity: 2 }],
      order_discount: 5,
      held_order_num: 9,
      superseded_sale_id: 3,
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/sales/carts/42/lines",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(next.lines).toEqual([]);
    expect(next.order_discount).toBe(0);
    expect(next.held_order_num).toBeNull();
    expect(next.superseded_sale_id).toBeNull();
  });

  it("still returns empty lines when DELETE fails", async () => {
    apiRequest.mockRejectedValueOnce(new Error("network"));
    const { wipeTemporaryCartLines } = await import("@/lib/pos-offline");
    const next = await wipeTemporaryCartLines({
      id: 7,
      lines: [{ product_code: "B", quantity: 1 }],
    });
    expect(next.lines).toEqual([]);
    expect(next.id).toBe(7);
  });

  it("does not DELETE while the F10 payment dialog is open", async () => {
    const { wipeTemporaryCartLines, setPosPaymentDialogOpen } = await import("@/lib/pos-offline");
    setPosPaymentDialogOpen(true);
    try {
      const cart = {
        id: 99,
        lines: [{ product_code: "C", quantity: 1 }],
        order_discount: 2,
      };
      const next = await wipeTemporaryCartLines(cart);
      expect(apiRequest).not.toHaveBeenCalled();
      expect(next.lines).toHaveLength(1);
      expect(next.order_discount).toBe(2);
    } finally {
      setPosPaymentDialogOpen(false);
    }
  });

  it("leaves a clean new-sale cart when the TemporaryCart has no edit markers", async () => {
    apiRequest.mockResolvedValueOnce({
      id: 12,
      lines: [{ product_code: "A", quantity: 1 }],
      held_order_num: null,
      superseded_sale_id: null,
    });
    const { ensureServerCartAbandonedForNewSale } = await import("@/lib/pos-offline");
    const next = await ensureServerCartAbandonedForNewSale({
      id: 12,
      lines: [{ product_code: "A", quantity: 1 }],
      held_order_num: 9,
      superseded_sale_id: 3,
    });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(next.held_order_num).toBeUndefined();
    expect(next.superseded_sale_id).toBeUndefined();
    expect(next.lines).toEqual([{ product_code: "A", quantity: 1 }]);
  });

  it("abandons leftover previous-order markers then replays the new sale lines", async () => {
    apiRequest
      .mockResolvedValueOnce({
        id: 12,
        lines: [{ product_code: "OLD", quantity: 1 }],
        held_order_num: 9,
        superseded_sale_id: 3,
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        id: 12,
        lines: [],
        held_order_num: null,
        superseded_sale_id: null,
      })
      .mockResolvedValueOnce({
        id: 12,
        lines: [{ product_code: "NEW", quantity: 2 }],
      });
    const { ensureServerCartAbandonedForNewSale } = await import("@/lib/pos-offline");
    const next = await ensureServerCartAbandonedForNewSale({
      id: 12,
      lines: [{ product_code: "NEW", quantity: 2, unit_price: 10 }],
      held_order_num: 9,
      superseded_sale_id: 3,
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/sales/carts/12/lines",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "/sales/carts/12/lines",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(next.held_order_num).toBeUndefined();
    expect(next.superseded_sale_id).toBeUndefined();
    expect(next.lines).toEqual([{ product_code: "NEW", quantity: 2 }]);
  });

  it("refuses new-sale checkout when leftover edit markers cannot be abandoned", async () => {
    apiRequest
      .mockResolvedValueOnce({
        id: 12,
        held_order_num: 9,
        superseded_sale_id: 3,
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        id: 12,
        held_order_num: 9,
        superseded_sale_id: 3,
      });
    const { ensureServerCartAbandonedForNewSale } = await import("@/lib/pos-offline");
    await expect(
      ensureServerCartAbandonedForNewSale({
        id: 12,
        lines: [{ product_code: "NEW", quantity: 1 }],
        held_order_num: 9,
        superseded_sale_id: 3,
      }),
    ).rejects.toThrow(/detach the previous order/i);
  });
});
