import { beforeEach, describe, expect, it, vi } from "vitest";

const meta = new Map();
const catalog = [];

vi.mock("@/lib/pos-offline-db", () => ({
  idbGetMeta: vi.fn(async (key) => meta.get(key) ?? null),
  idbSetMeta: vi.fn(async (key, value) => {
    meta.set(key, value);
  }),
  idbGetAllCatalog: vi.fn(async () => [...catalog]),
  idbPutCatalogProducts: vi.fn(async (rows) => {
    for (const row of rows ?? []) {
      const idx = catalog.findIndex((p) => p.product_code === row.product_code);
      if (idx >= 0) catalog[idx] = row;
      else catalog.push(row);
    }
  }),
  idbClearStore: vi.fn(async () => {
    catalog.length = 0;
  }),
}));

vi.mock("@/lib/auth-storage", () => ({
  getStoredOrganization: () => ({ id: 1 }),
  getStoredUser: () => ({ branch_id: 9 }),
}));

vi.mock("@/lib/stock-cache", async () => {
  const actual = await vi.importActual("@/lib/stock-cache");
  return {
    ...actual,
    fetchStockLevelsMap: vi.fn(async () => {
      const map = new Map();
      map.set("A1", {
        product_code: "A1",
        shop_quantity: 12,
        store_quantity: 0,
        available_shop_quantity: 12,
        available_store_quantity: 0,
      });
      return map;
    }),
  };
});

vi.mock("@/lib/pos-product-search-index", () => ({
  hasPosSearchCatalog: () => false,
  setPosSearchCatalog: vi.fn(),
  upsertPosSearchProducts: vi.fn(),
  serializePosSearchIndex: () => null,
  hydratePosSearchIndex: vi.fn(),
  isPosSearchIndexSnapshotValid: () => false,
  searchPosCatalogIndexAsync: vi.fn(async () => []),
}));

describe("refreshPosOfflineCatalogStock", () => {
  beforeEach(() => {
    meta.clear();
    catalog.length = 0;
    catalog.push({ product_code: "A1", product_name: "Alpha" });
    vi.resetModules();
  });

  it("overlays stock and skips within the TTL window", async () => {
    const { refreshPosOfflineCatalogStock, POS_OFFLINE_STOCK_TTL_MS } = await import(
      "@/lib/pos-offline"
    );
    expect(POS_OFFLINE_STOCK_TTL_MS).toBe(60_000);

    const first = await refreshPosOfflineCatalogStock({ force: true });
    expect(first.skipped).toBe(false);
    expect(first.count).toBe(1);
    expect(catalog[0].branch_stock).toBeTruthy();
    expect(catalog[0].stock_available_shop).toBe(12);

    const second = await refreshPosOfflineCatalogStock({ force: false });
    expect(second.skipped).toBe(true);
  });
});
