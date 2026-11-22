import { describe, expect, it, vi } from "vitest";
import {
  applyGlobalBranchToUrl,
  getGlobalBranchId,
  globalBranchStorageKey,
  setGlobalBranchId,
} from "./global-branch";

describe("global branch scope", () => {
  it("isolates the saved branch by organization and user", () => {
    expect(globalBranchStorageKey(12, 34)).toBe("centrix.global-branch:34:12");
    expect(globalBranchStorageKey(null, 34)).toBeNull();
  });

  it("persists the selected branch and clears it for all branches", () => {
    const stored = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
        removeItem: (key) => stored.delete(key),
      },
      dispatchEvent: () => true,
    });
    try {
      setGlobalBranchId(7, 12, 34);
      expect(getGlobalBranchId(12, 34)).toBe("7");

      setGlobalBranchId("", 12, 34);
      expect(getGlobalBranchId(12, 34)).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the global branch when no inline branch is selected", () => {
    const url = new URL("https://example.test/api/v1/orders?per_page=25");

    applyGlobalBranchToUrl(url, 7);

    expect(url.searchParams.get("branch_id")).toBe("7");
    expect(url.searchParams.get("per_page")).toBe("25");
  });

  it("replaces an empty inline filter with the global default", () => {
    const url = new URL("https://example.test/api/v1/orders?branch_id=");

    applyGlobalBranchToUrl(url, 7);

    expect(url.searchParams.get("branch_id")).toBe("7");
  });

  it("applies the selected branch to create and delete requests", () => {
    const createUrl = new URL("https://example.test/api/v1/orders");
    const deleteUrl = new URL("https://example.test/api/v1/orders/21?branch_id=9");

    applyGlobalBranchToUrl(createUrl, 7, "POST");
    applyGlobalBranchToUrl(deleteUrl, 7, "DELETE");

    expect(createUrl.searchParams.get("branch_id")).toBe("7");
    expect(deleteUrl.searchParams.get("branch_id")).toBe("7");
  });

  it("does not apply the global branch to nested POST actions on existing records", () => {
    const url = new URL("https://example.test/api/v1/stock-take-sessions/21/complete");

    applyGlobalBranchToUrl(url, 7, "POST");

    expect(url.searchParams.has("branch_id")).toBe(false);
  });

  it("preserves an explicit inline branch and excludes branch-management requests", () => {
    const inlineUrl = new URL("https://example.test/api/v1/orders?branch_id=9");
    const filterUrl = new URL("https://example.test/api/v1/customers");
    const branchesUrl = new URL("https://example.test/api/v1/branches");
    const authUrl = new URL("https://example.test/api/v1/auth/switch-organization");

    applyGlobalBranchToUrl(inlineUrl, 7);
    applyGlobalBranchToUrl(filterUrl, 7, "GET", { "filter[branch_id]": "9" });
    applyGlobalBranchToUrl(branchesUrl, 7);
    applyGlobalBranchToUrl(authUrl, 7, "POST");

    expect(inlineUrl.searchParams.get("branch_id")).toBe("9");
    expect(filterUrl.searchParams.has("branch_id")).toBe(false);
    expect(branchesUrl.searchParams.has("branch_id")).toBe(false);
    expect(authUrl.searchParams.has("branch_id")).toBe(false);
  });

  it("does not apply branch scope to update requests", () => {
    const url = new URL("https://example.test/api/v1/orders/21");

    applyGlobalBranchToUrl(url, 7, "PUT");

    expect(url.searchParams.has("branch_id")).toBe(false);
  });
});
