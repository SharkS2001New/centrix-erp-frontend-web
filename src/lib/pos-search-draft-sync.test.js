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

  it("blocks parent clear while the field is focused unless explicitly allowed", () => {
    expect(
      shouldSyncParentSearchQuery("", "Sugar", { inputFocused: true }),
    ).toBe(false);
    expect(
      shouldSyncParentSearchQuery("", "Sugar", {
        inputFocused: true,
        allowParentClear: true,
      }),
    ).toBe(true);
  });

  it("accepts external park / swap overwrite", () => {
    expect(
      shouldSyncParentSearchQuery("6161100100015", "Sugar", { inputFocused: true }),
    ).toBe(true);
  });
});
