import { beforeEach, describe, expect, it } from "vitest";
import {
  readTabWorkspaceStore,
  seedWorkspaceTabLanding,
  shouldKeepTabPaneMounted,
  tabStorageKey,
} from "@/lib/tab-workspace";

function installSessionStorageMock() {
  const storage = new Map();
  global.window = globalThis;
  global.sessionStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => {
      storage.set(key, String(value));
    },
    removeItem: (key) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: () => null,
    get length() {
      return storage.size;
    },
  };
  return storage;
}

describe("seedWorkspaceTabLanding", () => {
  beforeEach(() => {
    installSessionStorageMock().clear();
  });

  it("keeps backoffice tabs and promotes Business summary on module switch", () => {
    const orgId = 42;
    global.sessionStorage.setItem(
      tabStorageKey(orgId),
      JSON.stringify({
        backoffice: {
          tabs: [
            { href: "/sales/pos", title: "Create new order", lastActiveAt: 100 },
            { href: "/dashboard", title: "Dashboard", lastActiveAt: 50 },
          ],
          activeHref: "/sales/pos",
        },
      }),
    );

    seedWorkspaceTabLanding(orgId, "backoffice", "/dashboard");

    const store = readTabWorkspaceStore(orgId);
    expect(store.backoffice.activeHref).toBe("/dashboard");
    expect(store.backoffice.tabs.map((tab) => tab.href)).toEqual([
      "/dashboard",
      "/sales/pos",
    ]);
    expect(store.backoffice.tabs[0].title).toBe("Business summary");
  });

  it("keeps other workspace tabs but promotes the landing tab", () => {
    const orgId = 7;
    global.sessionStorage.setItem(
      tabStorageKey(orgId),
      JSON.stringify({
        accounting: {
          tabs: [
            { href: "/accounting/journal", title: "Journal", lastActiveAt: 200 },
            { href: "/accounting/trial-balance", title: "Trial balance", lastActiveAt: 100 },
          ],
          activeHref: "/accounting/journal",
        },
      }),
    );

    seedWorkspaceTabLanding(orgId, "accounting", "/accounting/trial-balance");

    const store = readTabWorkspaceStore(orgId);
    expect(store.accounting.activeHref).toBe("/accounting/trial-balance");
    expect(store.accounting.tabs.map((tab) => tab.href)).toEqual([
      "/accounting/trial-balance",
      "/accounting/journal",
    ]);
  });
});

describe("shouldKeepTabPaneMounted", () => {
  it("keeps everyday list/report panes mounted when inactive so revisit does not reload", () => {
    expect(
      shouldKeepTabPaneMounted({ entryId: "products", isActive: false, inactiveKeepRank: 0 }),
    ).toBe(true);
    expect(
      shouldKeepTabPaneMounted({ entryId: "reports-key", isActive: false, inactiveKeepRank: 2 }),
    ).toBe(true);
    expect(
      shouldKeepTabPaneMounted({ entryId: "inventory-stock", isActive: false, inactiveKeepRank: 5 }),
    ).toBe(true);
  });

  it("soft-evicts only POS and live stock-take when inactive", () => {
    expect(
      shouldKeepTabPaneMounted({ entryId: "sales-pos", isActive: false, inactiveKeepRank: 0 }),
    ).toBe(false);
    expect(
      shouldKeepTabPaneMounted({
        entryId: "inventory-stock-take-id",
        isActive: false,
        inactiveKeepRank: 0,
      }),
    ).toBe(false);
    expect(
      shouldKeepTabPaneMounted({ entryId: "sales-pos", isActive: true, inactiveKeepRank: -1 }),
    ).toBe(true);
  });
});
