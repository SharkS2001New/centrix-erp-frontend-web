import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
let localCart = null;

vi.mock("@/lib/api", () => ({
  apiRequest: (...args) => apiRequest(...args),
  ApiError: class ApiError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  },
  formatApiErrorMessage: (body, fallback) => fallback,
}));

vi.mock("@/lib/pos-offline-db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    idbGetLocalCart: async () => localCart,
    idbPutLocalCart: async () => {},
    idbClearLocalCart: async () => {},
    clampPosOrderBusinessDate: (d) => d,
    normalizePosOrderDate: (d) => d,
    todayPosOrderDate: () => "2026-08-10",
    idbFindSyncedServerSaleIdByPosTicket: async () => null,
  };
});

describe("previous-order edit till isolation", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    localCart = null;
    try {
      localStorage?.clear?.();
    } catch {
      /* vitest may omit localStorage */
    }
  });

  it("detects till-busy defer errors so sync leaves the row pending", async () => {
    const {
      isPreviousOrderEditTillBusyError,
      POS_TILL_BUSY_SYNC_MESSAGE,
    } = await import("@/lib/pos-offline");
    expect(isPreviousOrderEditTillBusyError(new Error(POS_TILL_BUSY_SYNC_MESSAGE))).toBe(true);
    expect(isPreviousOrderEditTillBusyError(new Error("Cart is empty."))).toBe(false);
  });

  it("starts with no background edit sync lock (till can use TemporaryCart)", async () => {
    const {
      isBackgroundPreviousOrderEditSyncActive,
      getBackgroundPreviousOrderEditSyncCartId,
      clearLiveTemporaryCartOccupancy,
    } = await import("@/lib/pos-offline");
    clearLiveTemporaryCartOccupancy();
    expect(isBackgroundPreviousOrderEditSyncActive()).toBe(false);
    expect(getBackgroundPreviousOrderEditSyncCartId()).toBe(null);
  });

  it("treats deferred sync results as non-failures for Sync failed UI", () => {
    const results = [
      { ok: true },
      { ok: false, deferred: true, error: "till busy" },
      { ok: false, error: "network" },
    ];
    const failed = results.filter((r) => !r.ok && !r.deferred);
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe("network");
  });

  it("treats sticky TemporaryCart new-sale lines as foreign to a previous-order edit", async () => {
    const { stickyCartHasForeignNewSaleLines } = await import("@/lib/pos-offline");
    expect(
      stickyCartHasForeignNewSaleLines(
        { id: 9, lines: [{ product_code: "A" }], superseded_sale_id: null },
        { editSaleId: 100, editOrderNum: 50 },
      ),
    ).toBe(true);
    expect(
      stickyCartHasForeignNewSaleLines(
        { id: 9, lines: [{ product_code: "A" }], superseded_sale_id: 100, held_order_num: 50 },
        { editSaleId: 100, editOrderNum: 50 },
      ),
    ).toBe(false);
  });

  it("defers sync when live TemporaryCart occupancy is set even if IDB is empty", async () => {
    const {
      setLiveTemporaryCartOccupancy,
      clearLiveTemporaryCartOccupancy,
      assertPosTillAvailableForSync,
      isPreviousOrderEditTillBusyError,
    } = await import("@/lib/pos-offline");

    clearLiveTemporaryCartOccupancy();
    setLiveTemporaryCartOccupancy({
      id: 42,
      lines: [{ product_code: "SUGAR", quantity: 1 }],
    });

    await expect(
      assertPosTillAvailableForSync({
        stickyCart: {
          id: 42,
          lines: [{ product_code: "SUGAR", quantity: 1 }],
        },
        allowWipeOrphans: true,
      }),
    ).rejects.toSatisfy((err) => isPreviousOrderEditTillBusyError(err));

    expect(apiRequest).not.toHaveBeenCalled();
    clearLiveTemporaryCartOccupancy();
  });

  it("defers sync when local IndexedDB cart is mid-sale", async () => {
    localCart = {
      id: "active",
      offline: true,
      lines: [{ product_code: "A", quantity: 2 }],
    };
    const {
      clearLiveTemporaryCartOccupancy,
      assertPosTillAvailableForSync,
      isPreviousOrderEditTillBusyError,
    } = await import("@/lib/pos-offline");
    clearLiveTemporaryCartOccupancy();

    await expect(assertPosTillAvailableForSync({ allowWipeOrphans: true })).rejects.toSatisfy(
      (err) => isPreviousOrderEditTillBusyError(err),
    );
  });

  it("clears stale live occupancy when IDB is empty and sticky is not mid-sale", async () => {
    const {
      setLiveTemporaryCartOccupancy,
      clearLiveTemporaryCartOccupancy,
      assertPosTillAvailableForSync,
      isLiveTemporaryCartOccupied,
    } = await import("@/lib/pos-offline");
    clearLiveTemporaryCartOccupancy();
    setLiveTemporaryCartOccupancy({
      id: 55,
      lines: [{ product_code: "A", quantity: 1 }],
    });
    expect(isLiveTemporaryCartOccupied()).toBe(true);

    const result = await assertPosTillAvailableForSync({
      stickyCart: { id: 55, lines: [] },
      allowWipeOrphans: true,
    });

    expect(result.wipedOrphans).toBe(false);
    expect(isLiveTemporaryCartOccupied()).toBe(false);
  });

  it("wipes orphan sticky lines only when till is idle (no occupancy, empty IDB)", async () => {
    apiRequest.mockResolvedValueOnce({ ok: true });
    const {
      clearLiveTemporaryCartOccupancy,
      assertPosTillAvailableForSync,
    } = await import("@/lib/pos-offline");
    clearLiveTemporaryCartOccupancy();

    const result = await assertPosTillAvailableForSync({
      stickyCart: {
        id: 77,
        lines: [{ product_code: "ORPHAN", quantity: 1 }],
        superseded_sale_id: null,
      },
      editSaleId: 10,
      editOrderNum: 5,
      allowWipeOrphans: true,
    });

    expect(result.wipedOrphans).toBe(true);
    expect(apiRequest).toHaveBeenCalledWith(
      "/sales/carts/77/lines",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("does not wipe orphan sticky lines when offline sale sync disallows wipe", async () => {
    const {
      clearLiveTemporaryCartOccupancy,
      assertPosTillAvailableForSync,
    } = await import("@/lib/pos-offline");
    clearLiveTemporaryCartOccupancy();

    const result = await assertPosTillAvailableForSync({
      stickyCart: {
        id: 88,
        lines: [{ product_code: "ORPHAN", quantity: 1 }],
      },
      allowWipeOrphans: false,
    });

    expect(result.wipedOrphans).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
