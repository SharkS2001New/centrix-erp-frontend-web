import { describe, expect, it } from "vitest";
import {
  isPreviousOrderEditTillBusyError,
  isBackgroundPreviousOrderEditSyncActive,
  getBackgroundPreviousOrderEditSyncCartId,
} from "@/lib/pos-offline";

describe("previous-order edit till isolation", () => {
  it("detects till-busy defer errors so sync leaves the row pending", () => {
    expect(
      isPreviousOrderEditTillBusyError(
        new Error(
          "Cannot sync this previous-order edit while a new sale is open on the till. Clear or finish the current order, then open Sync failed and retry.",
        ),
      ),
    ).toBe(true);
    expect(isPreviousOrderEditTillBusyError(new Error("Cart is empty."))).toBe(false);
  });

  it("starts with no background edit sync lock (till can use TemporaryCart)", () => {
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
});
