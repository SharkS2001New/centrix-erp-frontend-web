import { describe, expect, it } from "vitest";
import { posProductSearchColumnDefs } from "@/lib/pos-product-search-columns";

describe("posProductSearchColumnDefs", () => {
  it("classic matches SearchLookUp columns (code, name, price, available)", () => {
    const cols = posProductSearchColumnDefs({ variant: "classic" });
    expect(cols.map((c) => c.id)).toEqual([
      "product_code",
      "product_name",
      "unit_price",
      "available",
    ]);
  });

  it("modern includes product code before name (SearchLookUp parity)", () => {
    const cols = posProductSearchColumnDefs({
      variant: "modern",
      stockDisplayMode: "both",
    });
    expect(cols.map((c) => c.id)).toEqual([
      "product_code",
      "product_name",
      "unit_price",
      "shop",
      "store",
    ]);
    expect(cols[0].label).toBe("Product code");
  });

  it("modern respects shop-only stock mode", () => {
    const cols = posProductSearchColumnDefs({
      variant: "modern",
      stockDisplayMode: "shop",
    });
    expect(cols.map((c) => c.id)).toEqual([
      "product_code",
      "product_name",
      "unit_price",
      "shop",
    ]);
  });
});
