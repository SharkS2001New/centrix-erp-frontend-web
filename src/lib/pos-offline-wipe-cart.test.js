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
});
