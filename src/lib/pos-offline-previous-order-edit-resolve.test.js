import { describe, expect, it } from "vitest";
import {
  isOrderNotEditableSyncError,
  isRestorablePosSaleForEdit,
  previousOrderEditOrgOrderNum,
  resolveHeadOfPreviousOrderEditChain,
  temporaryCartHasPreviousOrderEditMarkers,
} from "@/lib/pos-offline";

describe("previous-order edit live sale resolution", () => {
  it("rejects cancelled, archived, and tombstone sales", () => {
    expect(isRestorablePosSaleForEdit({ id: 1, status: "completed", archived: 0 })).toBe(true);
    expect(isRestorablePosSaleForEdit({ id: 1, status: "cancelled", archived: 0 })).toBe(false);
    expect(isRestorablePosSaleForEdit({ id: 1, status: "completed", archived: 1 })).toBe(false);
    expect(
      isRestorablePosSaleForEdit({ id: 1, status: "completed", archived: 0, order_num: 9_000_001 }),
    ).toBe(false);
  });

  it("walks the supersession chain to the newest live revision", () => {
    const candidates = [
      { id: 100, status: "cancelled", archived: 1, order_num: 5001 },
      { id: 101, status: "completed", archived: 0, order_num: 5001, fulfillment_meta: { supersedes_sale_id: 100 } },
      { id: 102, status: "completed", archived: 0, order_num: 5001, fulfillment_meta: { supersedes_sale_id: 101 } },
    ];
    const head = resolveHeadOfPreviousOrderEditChain(candidates, 100);
    expect(head?.id).toBe(102);
  });

  it("reads org order # from checkout body when row.order_num is a Cash Sales label", () => {
    expect(
      previousOrderEditOrgOrderNum({
        order_num: 27,
        checkout_body: { order_num: 5001 },
      }),
    ).toBe(27);
    expect(
      previousOrderEditOrgOrderNum({
        order_num: 9_000_100,
        checkout_body: { order_num: 5001 },
      }),
    ).toBe(5001);
  });

  it("detects the backend cannot-be-edited sync error", () => {
    expect(isOrderNotEditableSyncError(new Error("This order cannot be edited."))).toBe(true);
    expect(isOrderNotEditableSyncError(new Error("Network error"))).toBe(false);
  });

  it("rejects TemporaryCart reuse after finish cleared edit markers", () => {
    const row = {
      sync_kind: "previous_order_edit",
      superseded_sale_id: 55,
      order_num: 120,
      checkout_body: { order_num: 120 },
    };
    expect(
      temporaryCartHasPreviousOrderEditMarkers(
        { id: 9, held_order_num: null, superseded_sale_id: null },
        row,
      ),
    ).toBe(false);
    expect(
      temporaryCartHasPreviousOrderEditMarkers(
        { id: 9, held_order_num: 120, superseded_sale_id: 55 },
        row,
      ),
    ).toBe(true);
    expect(
      temporaryCartHasPreviousOrderEditMarkers(
        { id: 9, held_order_num: 120, superseded_sale_id: 99 },
        row,
      ),
    ).toBe(false);
  });
});

describe("wipeTemporaryCartLines preserveEditMarkers", () => {
  it("keeps edit identity on local (non-server) carts", async () => {
    const { wipeTemporaryCartLines } = await import("@/lib/pos-offline");
    const wiped = await wipeTemporaryCartLines(
      {
        id: "active",
        held_order_num: 88,
        superseded_sale_id: 12,
        lines: [{ id: 1, product_code: "A", quantity: 1 }],
        order_discount: 5,
      },
      { preserveEditMarkers: true },
    );
    expect(wiped.lines).toEqual([]);
    expect(wiped.order_discount).toBe(0);
    expect(wiped.held_order_num).toBe(88);
    expect(wiped.superseded_sale_id).toBe(12);
  });

  it("clears edit identity by default on local carts", async () => {
    const { wipeTemporaryCartLines } = await import("@/lib/pos-offline");
    const wiped = await wipeTemporaryCartLines({
      id: "active",
      held_order_num: 88,
      superseded_sale_id: 12,
      lines: [{ id: 1, product_code: "A", quantity: 1 }],
    });
    expect(wiped.held_order_num).toBeNull();
    expect(wiped.superseded_sale_id).toBeNull();
  });
});
