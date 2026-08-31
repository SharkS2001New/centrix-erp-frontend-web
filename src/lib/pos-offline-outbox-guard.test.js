import { describe, expect, it } from "vitest";
import {
  isHealableOutboxSyncError,
  outboxRowHasHealableSyncError,
} from "@/lib/pos-offline";

describe("isHealableOutboxSyncError", () => {
  it("treats MySQL deadlock as healable", () => {
    expect(
      isHealableOutboxSyncError({
        message:
          "SQLSTATE[40001]: Serialization failure: 1213 Deadlock found when trying to get lock",
      }),
    ).toBe(true);
  });

  it("treats network faults as healable", () => {
    expect(
      isHealableOutboxSyncError({
        message: "Please check your internet connection and try again.",
      }),
    ).toBe(true);
  });

  it("does not treat validation errors as healable", () => {
    expect(
      isHealableOutboxSyncError({
        message: "Cart is empty.",
      }),
    ).toBe(false);
  });
});

describe("outboxRowHasHealableSyncError", () => {
  it("flags error rows with healable sync_error text", () => {
    expect(
      outboxRowHasHealableSyncError({
        sync_status: "error",
        sync_error: "1213 Deadlock found when trying to get lock",
      }),
    ).toBe(true);
  });

  it("ignores pending rows", () => {
    expect(
      outboxRowHasHealableSyncError({
        sync_status: "pending",
        sync_error: "1213 Deadlock",
      }),
    ).toBe(false);
  });
});
