import { describe, expect, it } from "vitest";
import { syncProgressPercent } from "@/components/sales/pos-offline-sync-controls";

describe("syncProgressPercent", () => {
  it("returns 0 when total is missing", () => {
    expect(syncProgressPercent(null)).toBe(0);
    expect(syncProgressPercent({ total: 0, done: 0 })).toBe(0);
  });

  it("credits half an in-flight item so single-order sync shows progress", () => {
    expect(
      syncProgressPercent({
        total: 1,
        current: 1,
        done: 0,
        failed: 0,
        phase: "syncing",
      }),
    ).toBe(50);
  });

  it("reaches 100% when all items finish", () => {
    expect(
      syncProgressPercent({
        total: 2,
        current: 2,
        done: 2,
        failed: 0,
        phase: "item_done",
      }),
    ).toBe(100);
  });

  it("adds up across a multi-order queue", () => {
    expect(
      syncProgressPercent({
        total: 4,
        current: 2,
        done: 1,
        failed: 0,
        phase: "syncing",
      }),
    ).toBe(38); // (1 + 0.5) / 4
  });
});
