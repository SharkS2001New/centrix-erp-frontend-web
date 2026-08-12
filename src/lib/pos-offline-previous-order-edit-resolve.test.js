import { describe, expect, it } from "vitest";
import {
  isOrderNotEditableSyncError,
  isRestorablePosSaleForEdit,
  previousOrderEditOrgOrderNum,
  resolveHeadOfPreviousOrderEditChain,
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
});
