import { describe, expect, it } from "vitest";
import { shouldSyncParentSearchQuery } from "@/lib/pos-search-draft-sync";

describe("shouldSyncParentSearchQuery", () => {
  it("does not sync when parent and local already match", () => {
    expect(shouldSyncParentSearchQuery("Sugar", "Sugar")).toBe(false);
  });

  it("never regresses when parent lags behind fast typing", () => {
    expect(
      shouldSyncParentSearchQuery("Sug", "Sugar", { inputFocused: true }),
    ).toBe(false);
    expect(
      shouldSyncParentSearchQuery("Sug", "Sugar", { inputFocused: false }),
    ).toBe(false);
  });

  it("blocks parent clear unless explicitly allowed (even when blurred)", () => {
    expect(
      shouldSyncParentSearchQuery("", "Sugar", { inputFocused: true }),
    ).toBe(false);
    expect(
      shouldSyncParentSearchQuery("", "Sugar", { inputFocused: false }),
    ).toBe(false);
    expect(
      shouldSyncParentSearchQuery("", "Sugar", {
        inputFocused: false,
        allowParentClear: true,
      }),
    ).toBe(true);
  });

  it("seeds an empty field from parent park / barcode", () => {
    expect(
      shouldSyncParentSearchQuery("6161100100015", "", { inputFocused: true }),
    ).toBe(true);
  });

  it("does not overwrite live typing with a stale parked code (fast rewrite)", () => {
    // Cashier select-all typed "s" while React parent still held the prior park/code.
    expect(
      shouldSyncParentSearchQuery("6161100100015", "s", { inputFocused: true }),
    ).toBe(false);
    expect(
      shouldSyncParentSearchQuery("kamande", "su", { inputFocused: true }),
    ).toBe(false);
    expect(
      shouldSyncParentSearchQuery("6161100100015", "Sugar", { inputFocused: false }),
    ).toBe(false);
  });

  it("allows parent to extend a shorter local draft (scanner append)", () => {
    expect(
      shouldSyncParentSearchQuery("6161100100015", "616", { inputFocused: true }),
    ).toBe(true);
  });
});
