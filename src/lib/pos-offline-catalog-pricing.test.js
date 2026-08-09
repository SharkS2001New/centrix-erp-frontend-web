import { beforeEach, describe, expect, it, vi } from "vitest";

const catalog = new Map();
const meta = new Map();

vi.mock("@/lib/pos-offline-db", () => ({
  idbPutCatalogProducts: async (products) => {
    for (const p of products ?? []) {
      if (p?.product_code) catalog.set(String(p.product_code), { ...p });
    }
  },
  idbGetCatalogProduct: async (code) => catalog.get(String(code)) ?? null,
  idbGetAllCatalog: async () => [...catalog.values()],
  idbClearStore: async (name) => {
    if (name === "catalog") catalog.clear();
  },
  idbGetMeta: async (key) => meta.get(key) ?? null,
  idbSetMeta: async (key, value) => {
    meta.set(key, value);
  },
  idbGetLocalCart: async () => null,
  idbPutLocalCart: async () => {},
  idbClearLocalCart: async () => {},
  newClientSaleUuid: () => "uuid-test",
  clampPosOrderBusinessDate: (d) => d,
  normalizePosOrderDate: (d) => d,
  todayPosOrderDate: () => "2026-08-09",
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(async (path) => {
    if (String(path).includes("/products/SUGAR")) {
      return {
        product_code: "SUGAR",
        product_name: "SUGAR 50 KG",
        unit_price: 150,
        status: "active",
      };
    }
    throw new Error(`unexpected path ${path}`);
  }),
  ApiError: class ApiError extends Error {},
  formatApiErrorMessage: (e) => String(e?.message ?? e),
}));

vi.mock("@/lib/pos-product-search-index", async () => {
  const actual = await vi.importActual("@/lib/pos-product-search-index");
  return {
    ...actual,
  };
});

describe("refreshPosOfflineCatalogPricing", () => {
  beforeEach(() => {
    catalog.clear();
    meta.clear();
    catalog.set("SUGAR", {
      product_code: "SUGAR",
      product_name: "SUGAR 50 KG",
      unit_price: 140,
      status: "active",
    });
    meta.set("catalog_warmed_at", Date.now());
    vi.resetModules();
  });

  it("upserts the updated product price into IndexedDB catalog", async () => {
    const { refreshPosOfflineCatalogPricing, getPosOfflineProduct } = await import(
      "@/lib/pos-offline"
    );
    const result = await refreshPosOfflineCatalogPricing({
      product_code: "SUGAR",
      reason: "product_price",
      message: "Price updated: SUGAR 50 KG",
    });
    expect(result.forcedFull).toBe(false);
    expect(result.products[0].unit_price).toBe(150);
    const stored = await getPosOfflineProduct("SUGAR");
    expect(stored.unit_price).toBe(150);
  });
});
