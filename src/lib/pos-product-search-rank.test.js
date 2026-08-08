import { describe, expect, it } from "vitest";
import {
  explainPosSearchMatch,
  mergePosSearchResults,
  normalizeSearchText,
  productMatchesPosSearch,
  rankPosProductSearchResults,
  scorePosProductSearch,
  tokenizeSearchQuery,
} from "@/lib/pos-product-search-rank";
import {
  sameSearchResultList,
  searchPosCatalogIndex,
  serializePosSearchIndex,
  hydratePosSearchIndex,
  resetPosSearchCatalogForTests,
  setPosSearchCatalog,
} from "@/lib/pos-product-search-index";

describe("pos-product-search-rank", () => {
  it("normalizes spacing and punctuation", () => {
    expect(normalizeSearchText("  P  ostman ").compact).toBe("postman");
    expect(normalizeSearchText("Post-Man")).toEqual({
      normalized: "post man",
      compact: "postman",
      tokens: ["post", "man"],
    });
    expect(tokenizeSearchQuery(" sugar  50 ")).toEqual(["sugar", "50"]);
  });

  it("ignores spacing errors for the same product", () => {
    const product = { product_code: "P1", product_name: "Postman Envelope A4" };
    for (const q of ["PostMan", "post man", "P ostman", "Post    Man", "POSTMAN"]) {
      expect(productMatchesPosSearch(product, q)).toBe(true);
    }
  });

  it("finds Post Man when the cashier types postman", () => {
    const product = { product_code: "PM1", product_name: "Post Man Envelope" };
    expect(productMatchesPosSearch(product, "postman")).toBe(true);
    expect(productMatchesPosSearch(product, "post man")).toBe(true);
    expect(productMatchesPosSearch(product, "Post-Man")).toBe(true);
  });

  it("matches Kiss Kid with token and spacing variants", () => {
    const product = { product_code: "K1", product_name: "Kiss Kid Biscuit" };
    for (const q of [
      "kiss",
      "kid",
      "kiss kid",
      "kid kiss",
      "Kiss Kid",
      "kiss    kid",
      "K iss Kid",
      "biscuit",
      "kiss biscuit",
    ]) {
      expect(productMatchesPosSearch(product, q), q).toBe(true);
    }
  });

  it("matches mid-string name tokens (unia → Gunia)", () => {
    const product = { product_code: "G1", product_name: "Gunia 90kg" };
    expect(productMatchesPosSearch(product, "unia")).toBe(true);
    expect(explainPosSearchMatch(product, "unia")).toBe("name");
  });

  it("requires every token for multi-word search", () => {
    const sugar = { product_code: "1300009", product_name: "SUGAR 50 KG" };
    const tea = { product_code: "T1", product_name: "TEA 50 KG" };
    expect(productMatchesPosSearch(sugar, "sugar 50")).toBe(true);
    expect(productMatchesPosSearch(tea, "sugar 50")).toBe(false);
  });

  it("fuzzy-matches close typos including extra letters", () => {
    const postman = { product_code: "P1", product_name: "Postman Envelope" };
    const marai = { product_code: "M1", product_name: "Marai Rice" };
    const spaghetti = { product_code: "S1", product_name: "Spaghetti 500g" };
    expect(productMatchesPosSearch(postman, "postmn")).toBe(true);
    expect(productMatchesPosSearch(marai, "maraii")).toBe(true);
    expect(productMatchesPosSearch(spaghetti, "spageti")).toBe(true);
  });

  it("still matches when the cashier types one letter past a name token", () => {
    const yaba = { product_code: "Y1", product_name: "Yaba Clear Soap" };
    expect(productMatchesPosSearch(yaba, "yab")).toBe(true);
    expect(productMatchesPosSearch(yaba, "yaba")).toBe(true);
    expect(productMatchesPosSearch(yaba, "yabal")).toBe(true);
  });

  it("ranks marai ahead of mara and marathon", () => {
    const marai = { product_code: "M1", product_name: "Marai Rice" };
    const mara = { product_code: "M2", product_name: "Mara Sugar" };
    const marathon = { product_code: "M3", product_name: "Marathon Flour" };
    const ranked = rankPosProductSearchResults([marathon, mara, marai], "marai");
    expect(ranked[0].product_code).toBe("M1");
    // Fuzzy near-miss "Mara" is hidden when an exact word hit exists.
    expect(ranked.map((p) => p.product_code)).toEqual(["M1"]);
  });

  it("for incomplete mar ranks Marai / Mara / Marathon by relevance", () => {
    const marai = { product_code: "M1", product_name: "Marai Rice" };
    const mara = { product_code: "M2", product_name: "Mara Sugar" };
    const marathon = { product_code: "M3", product_name: "Marathon Flour" };
    const ranked = rankPosProductSearchResults([marathon, mara, marai], "mar");
    expect(ranked.map((p) => p.product_code).slice(0, 3)).toEqual(["M2", "M1", "M3"]);
  });

  it("preserves local result order when merging remote stock", () => {
    const local = [
      { product_code: "A", product_name: "Alpha Milk" },
      { product_code: "B", product_name: "Alpha Butter" },
    ];
    const remote = [
      { product_code: "B", product_name: "Alpha Butter", stock_available_shop: 99 },
      { product_code: "A", product_name: "Alpha Milk", stock_available_shop: 1 },
      { product_code: "C", product_name: "Alpha Cream", stock_available_shop: 5 },
    ];
    const merged = mergePosSearchResults(local, remote, "alpha", {
      getAvailableQty: (p) => Number(p.stock_available_shop ?? 0),
    });
    expect(merged[0].product_code).toBe("A");
    expect(merged[1].product_code).toBe("B");
    expect(merged[0].stock_available_shop).toBe(1);
  });

  it("scores exact product codes highest", () => {
    const exact = { product_code: "1300009", product_name: "Other" };
    const named = { product_code: "X", product_name: "1300009 sugar" };
    expect(scorePosProductSearch(exact, "1300009")).toBeGreaterThan(
      scorePosProductSearch(named, "1300009"),
    );
  });

  it("keeps long barcodes exact/prefix only", () => {
    const product = { product_code: "6001234567890", product_name: "Barcode item" };
    expect(productMatchesPosSearch(product, "6001234567890")).toBe(true);
    expect(
      productMatchesPosSearch({ product_code: "X", product_name: "6001234567890" }, "6001234567890"),
    ).toBe(false);
  });

  it("matches products by unit price amount", () => {
    const sugar = { product_code: "S1", product_name: "SUGAR 50 KG", unit_price: 6300 };
    expect(productMatchesPosSearch(sugar, "6300")).toBe(true);
    expect(explainPosSearchMatch(sugar, "6300")).toBe("price");
  });
});

describe("pos-product-search-index", () => {
  it("searches precomputed catalog without rescanning raw fields", () => {
    setPosSearchCatalog([
      { product_code: "K1", product_name: "Kiss Kid Biscuit" },
      { product_code: "P1", product_name: "Postman Envelope A4" },
      { product_code: "M1", product_name: "Marai Rice" },
    ]);
    const kiss = searchPosCatalogIndex("K iss Kid");
    expect(kiss.map((p) => p.product_code)).toEqual(["K1"]);
    const post = searchPosCatalogIndex("P ostman");
    expect(post.map((p) => p.product_code)).toEqual(["P1"]);
    const marai = searchPosCatalogIndex("marai");
    expect(marai.map((p) => p.product_code)).toEqual(["M1"]);
  });

  it("prefix pruning still finds fuzzy typos", () => {
    setPosSearchCatalog([
      { product_code: "P1", product_name: "Postman Envelope" },
      { product_code: "M1", product_name: "Marai Rice" },
      { product_code: "S1", product_name: "Spaghetti 500g" },
      { product_code: "X1", product_name: "Unrelated Soap" },
    ]);
    expect(searchPosCatalogIndex("postmn").map((p) => p.product_code)).toEqual(["P1"]);
    expect(searchPosCatalogIndex("maraii").map((p) => p.product_code)).toEqual(["M1"]);
    expect(searchPosCatalogIndex("spageti").map((p) => p.product_code)).toEqual(["S1"]);
  });

  it("exact barcode lookup returns the product", () => {
    setPosSearchCatalog([
      {
        product_code: "P1",
        product_name: "Barcode item",
        barcode: "6001234567890",
      },
      { product_code: "P2", product_name: "Other", barcode: "1111111111111" },
    ]);
    expect(searchPosCatalogIndex("6001234567890").map((p) => p.product_code)).toEqual(["P1"]);
  });

  it("searches a large catalog quickly", () => {
    const products = [];
    for (let i = 0; i < 5000; i += 1) {
      products.push({
        product_code: `C${i}`,
        product_name: `Product Item Number ${i}`,
        barcode: `6000000${String(i).padStart(6, "0")}`,
        unit_price: 100 + (i % 50),
      });
    }
    products.push({ product_code: "TARGET", product_name: "Kiss Kid Biscuit Special", unit_price: 50 });
    setPosSearchCatalog(products);
    const t0 = performance.now();
    const hits = searchPosCatalogIndex("kiss kid");
    const ms = performance.now() - t0;
    expect(hits[0]?.product_code).toBe("TARGET");
    expect(ms).toBeLessThan(80);
  });

  it("round-trips a persisted index snapshot without re-typing names", () => {
    const products = [
      { product_code: "K1", product_name: "Kiss Kid Biscuit", unit_price: 100 },
      { product_code: "M1", product_name: "Marai Rice", unit_price: 200 },
    ];
    setPosSearchCatalog(products, { warmedAt: 12345 });
    const snapshot = serializePosSearchIndex({ warmedAt: 12345 });
    expect(snapshot?.schema).toBe(1);
    expect(snapshot?.entries?.[0]?.product).toBeUndefined();

    resetPosSearchCatalogForTests();
    expect(searchPosCatalogIndex("kiss")).toEqual([]);

    expect(hydratePosSearchIndex(snapshot, products)).toBe(true);
    expect(searchPosCatalogIndex("kiss kid").map((p) => p.product_code)).toEqual(["K1"]);
    expect(searchPosCatalogIndex("marai").map((p) => p.product_code)).toEqual(["M1"]);
  });

  it("sameSearchResultList detects identical order", () => {
    const a = [{ product_code: "1" }, { product_code: "2" }];
    const b = [{ product_code: "1" }, { product_code: "2" }];
    const c = [{ product_code: "2" }, { product_code: "1" }];
    expect(sameSearchResultList(a, b)).toBe(true);
    expect(sameSearchResultList(a, c)).toBe(false);
  });
});
