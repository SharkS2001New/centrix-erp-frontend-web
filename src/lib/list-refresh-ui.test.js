import { describe, expect, it } from "vitest";
import { resolveListRefreshUi } from "@/lib/list-refresh-ui";

describe("resolveListRefreshUi", () => {
  it("shows spinner only while the list is loading on first paint", () => {
    expect(
      resolveListRefreshUi({
        loading: false,
        listLoading: true,
        hasRows: false,
        hasLoadedOnce: false,
      }).showInitialLoading,
    ).toBe(true);
    // Refs/dashboard (`loading`) must not block the table.
    expect(
      resolveListRefreshUi({
        loading: true,
        listLoading: false,
        hasRows: false,
        hasLoadedOnce: false,
      }).showInitialLoading,
    ).toBe(false);
    expect(
      resolveListRefreshUi({
        loading: false,
        listLoading: true,
        hasRows: true,
        hasLoadedOnce: true,
      }).showInitialLoading,
    ).toBe(false);
  });

  it("uses opacity while refreshing with existing rows", () => {
    const ui = resolveListRefreshUi({
      loading: false,
      listLoading: true,
      hasRows: true,
      hasLoadedOnce: true,
    });
    expect(ui.isRefreshing).toBe(true);
    expect(ui.contentClassName).toContain("opacity-60");
  });
});
