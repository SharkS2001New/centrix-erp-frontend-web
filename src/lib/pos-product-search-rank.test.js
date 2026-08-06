import { describe, expect, it } from "vitest";
import {
  explainPosSearchMatch,
  mergePosSearchResults,
  productMatchesPosSearch,
  rankPosProductSearchResults,
  scorePosProductSearch,
  tokenizeSearchQuery,
} from "@/lib/pos-product-search-rank";

describe("pos-product-search-rank", () => {
  it("tokenizes multi-word queries", () => {
    expect(tokenizeSearchQuery(" sugar  50 ")).toEqual(["sugar", "50"]);
  });

  it("matches mid-string name tokens (unia → Gunia)", () => {
    const product = { product_code: "G1", product_name: "Gunia 90kg" };
    expect(productMatchesPosSearch(product, "unia")).toBe(true);
    expect(productMatchesPosSearch(product, "UNIA")).toBe(true);
    expect(explainPosSearchMatch(product, "unia")).toBe("name");
  });

  it("requires every token for multi-word search", () => {
    const sugar = { product_code: "1300009", product_name: "SUGAR 50 KG" };
    const tea = { product_code: "T1", product_name: "TEA 50 KG" };
    expect(productMatchesPosSearch(sugar, "sugar 50")).toBe(true);
    expect(productMatchesPosSearch(tea, "sugar 50")).toBe(false);
    expect(productMatchesPosSearch(sugar, "50 sugar")).toBe(true);
  });

  it("fuzzy-matches close typos on name words", () => {
    const product = { product_code: "S1", product_name: "SUGAR 50 KG" };
    expect(productMatchesPosSearch(product, "sugr")).toBe(true);
    expect(explainPosSearchMatch(product, "sugr")).toBe("fuzzy");
  });

  it("does not fuzzy-match a shorter name against a longer query (marai ≠ Mara)", () => {
    const marai = { product_code: "M1", product_name: "Marai Cooking Fat" };
    const mara = { product_code: "M2", product_name: "Mara Cooking Fat" };
    expect(productMatchesPosSearch(marai, "marai")).toBe(true);
    expect(productMatchesPosSearch(mara, "marai")).toBe(false);
    expect(productMatchesPosSearch(mara, "mara")).toBe(true);
    const ranked = rankPosProductSearchResults([marai, mara], "marai");
    expect(ranked.map((p) => p.product_code)).toEqual(["M1"]);
  });

  it("hides fuzzy near-misses when a solid name match exists", () => {
    const exact = { product_code: "E1", product_name: "Cooking Oil" };
    const typoOnly = { product_code: "T1", product_name: "Cookin" };
    const ranked = rankPosProductSearchResults([typoOnly, exact], "cooking");
    expect(ranked.map((p) => p.product_code)).toEqual(["E1"]);
  });

  it("ranks in-stock products above zero stock for the same text score", () => {
    const inStock = { product_code: "A", product_name: "Sugar" };
    const out = { product_code: "B", product_name: "Sugar" };
    const ranked = rankPosProductSearchResults([out, inStock], "sugar", {
      getAvailableQty: (p) => (p.product_code === "A" ? 12 : 0),
    });
    expect(ranked[0].product_code).toBe("A");
  });

  it("scores exact product codes highest", () => {
    const exact = { product_code: "1300009", product_name: "Other" };
    const named = { product_code: "X", product_name: "1300009 sugar" };
    expect(scorePosProductSearch(exact, "1300009")).toBeGreaterThan(
      scorePosProductSearch(named, "1300009"),
    );
  });

  it("merges local fuzzy hits with remote stock without dropping either", () => {
    const local = [{ product_code: "G1", product_name: "Gunia" }];
    const remote = [
      { product_code: "G1", product_name: "Gunia", stock_available_shop: 5 },
      { product_code: "G2", product_name: "Gunny bag", stock_available_shop: 9 },
    ];
    const merged = mergePosSearchResults(local, remote, "gun", {
      getAvailableQty: (p) => Number(p.stock_available_shop ?? 0),
    });
    expect(merged.some((p) => p.product_code === "G1" && p.stock_available_shop === 5)).toBe(
      true,
    );
    expect(merged.some((p) => p.product_code === "G2")).toBe(true);
  });

  it("keeps long barcodes exact/prefix only", () => {
    const product = { product_code: "6001234567890", product_name: "Barcode item" };
    expect(productMatchesPosSearch(product, "6001234567890")).toBe(true);
    expect(productMatchesPosSearch(product, "600123")).toBe(true);
    expect(productMatchesPosSearch({ product_code: "X", product_name: "6001234567890" }, "6001234567890")).toBe(
      false,
    );
  });

  it("matches products by unit price amount", () => {
    const sugar = { product_code: "S1", product_name: "SUGAR 50 KG", unit_price: 6300 };
    const tea = { product_code: "T1", product_name: "TEA", unit_price: 450 };
    expect(productMatchesPosSearch(sugar, "6300")).toBe(true);
    expect(productMatchesPosSearch(sugar, "6,300")).toBe(true);
    expect(productMatchesPosSearch(sugar, "KES 6300")).toBe(true);
    expect(productMatchesPosSearch(tea, "6300")).toBe(false);
    expect(explainPosSearchMatch(sugar, "6300")).toBe("price");
  });

  it("matches multi-token name + price", () => {
    const sugar = { product_code: "S1", product_name: "SUGAR 50 KG", unit_price: 6300 };
    expect(productMatchesPosSearch(sugar, "sugar 6300")).toBe(true);
    expect(productMatchesPosSearch(sugar, "tea 6300")).toBe(false);
  });
});
