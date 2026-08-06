import { describe, expect, it } from "vitest";
import { resolveListRefreshUi } from "@/lib/list-refresh-ui";

describe("resolveListRefreshUi", () => {
  it("shows spinner only on first load", () => {
    expect(
      resolveListRefreshUi({ loading: true, listLoading: false, hasRows: false, hasLoadedOnce: false })
        .showInitialLoading,
    ).toBe(true);
    expect(
      resolveListRefreshUi({ loading: false, listLoading: true, hasRows: true, hasLoadedOnce: true })
        .showInitialLoading,
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
