import { beforeEach, describe, expect, it, vi } from "vitest";

const catalog = new Map();
const meta = new Map();
let authOrgId = 1;
let authBranchId = 10;
let productPages = [];

vi.mock("@/lib/pos-offline-db", () => ({
  idbPutCatalogProducts: async (products) => {
    for (const p of products ?? []) {
      if (p?.product_code) catalog.set(String(p.product_code), { ...p });
    }
  },
  idbGetCatalogProduct: async (code) => catalog.get(String(code)) ?? null,
  idbGetCatalogProducts: async (codes) =>
    [...new Set((codes ?? []).map((c) => String(c ?? "").trim()).filter(Boolean))]
      .map((code) => catalog.get(code))
      .filter(Boolean),
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

vi.mock("@/lib/auth-storage", () => ({
  getStoredOrganization: () => ({ id: authOrgId }),
  getStoredUser: () => ({ organization_id: authOrgId, branch_id: authBranchId }),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(async (path, opts) => {
    if (String(path) === "/products") {
      const page = Number(opts?.searchParams?.page ?? 1);
      const data = productPages[page - 1] ?? [];
      return { data, last_page: Math.max(1, productPages.length) };
    }
    throw new Error(`unexpected path ${path}`);
  }),
  ApiError: class ApiError extends Error {},
  formatApiErrorMessage: (e) => String(e?.message ?? e),
}));

vi.mock("@/lib/stock-cache", () => ({
  fetchStockLevelsMap: async () => new Map(),
  mergeProductsWithLiveStock: (products) => products,
  productStockFieldsMissing: () => false,
}));

vi.mock("@/lib/pos-product-search-index", async () => {
  const actual = await vi.importActual("@/lib/pos-product-search-index");
  return { ...actual };
});

describe("warmPosOfflineCatalog org scope", () => {
  beforeEach(() => {
    catalog.clear();
    meta.clear();
    authOrgId = 1;
    authBranchId = 10;
    productPages = [
      [
        {
          product_code: "ORG1-SUGAR",
          product_name: "Sugar Org1",
          status: "active",
          unit_price: 100,
        },
      ],
    ];
    vi.resetModules();
  });

  it("rewarm when organization scope changes even inside TTL", async () => {
    const {
      warmPosOfflineCatalog,
      POS_OFFLINE_CATALOG_SCOPE_META_KEY,
      getPosOfflineProduct,
    } = await import("@/lib/pos-offline");

    const first = await warmPosOfflineCatalog({ force: true });
    expect(first.skipped).toBe(false);
    expect(await getPosOfflineProduct("ORG1-SUGAR")).toBeTruthy();
    expect(meta.get(POS_OFFLINE_CATALOG_SCOPE_META_KEY)).toBe("org:1:branch:10");

    // Still within TTL — would previously skip and keep org1 SKUs.
    meta.set("catalog_warmed_at", Date.now());
    authOrgId = 2;
    authBranchId = 20;
    productPages = [
      [
        {
          product_code: "ORG2-BEANS",
          product_name: "Beans Org2",
          status: "active",
          unit_price: 200,
        },
      ],
    ];

    const second = await warmPosOfflineCatalog({ force: false });
    expect(second.skipped).toBe(false);
    expect(second.scopeChanged).toBe(true);
    expect(await getPosOfflineProduct("ORG1-SUGAR")).toBeNull();
    expect(await getPosOfflineProduct("ORG2-BEANS")).toBeTruthy();
    expect(meta.get(POS_OFFLINE_CATALOG_SCOPE_META_KEY)).toBe("org:2:branch:20");
  });

  it("invalidatePosOfflineProductCatalog clears catalog and scope stamp", async () => {
    const {
      warmPosOfflineCatalog,
      invalidatePosOfflineProductCatalog,
      POS_OFFLINE_CATALOG_SCOPE_META_KEY,
      getPosOfflineProduct,
    } = await import("@/lib/pos-offline");

    await warmPosOfflineCatalog({ force: true });
    expect(await getPosOfflineProduct("ORG1-SUGAR")).toBeTruthy();

    await invalidatePosOfflineProductCatalog();
    expect(await getPosOfflineProduct("ORG1-SUGAR")).toBeNull();
    expect(meta.get("catalog_warmed_at")).toBe(0);
    expect(meta.get(POS_OFFLINE_CATALOG_SCOPE_META_KEY)).toBeNull();
  });
});
