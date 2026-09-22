import { describe, expect, it } from "vitest";
import {
  buildStockTakeExcelRows,
  buildStockTakePrintHtml,
  defaultStockTakeExportColumns,
  normalizeStockTakeExportColumns,
  stockTakeCurrentQty,
  stockTakePrintRowsFromLines,
  stockTakeVarianceBase,
} from "./stock-take-print";

describe("stockTakeCurrentQty", () => {
  it("prefers live_quantity over frozen system_quantity (matches screen)", () => {
    expect(
      stockTakeCurrentQty({ live_quantity: 2500, system_quantity: 0 }),
    ).toBe(2500);
  });

  it("falls back to system_quantity when live is missing", () => {
    expect(stockTakeCurrentQty({ system_quantity: 100 })).toBe(100);
  });
});

describe("stockTakeVarianceBase", () => {
  it("uses live qty while open and book qty after complete (matches ledger)", () => {
    const line = {
      live_quantity: 187 * 25,
      system_quantity: 187 * 25,
      counted_quantity: 198 * 25,
      is_counted: true,
    };
    expect(stockTakeVarianceBase(line, { completed: false })).toBe(11 * 25);

    // After complete: live may drift from sales, but book stays the take snapshot.
    const afterComplete = {
      ...line,
      live_quantity: 180 * 25,
      system_quantity: 187 * 25,
    };
    expect(stockTakeVarianceBase(afterComplete, { completed: true })).toBe(11 * 25);
  });
});

describe("buildStockTakePrintHtml", () => {
  const openRow = {
    product_code: "RICE1",
    product_name: "ABABIL PERBOILED 25KG",
    hierarchy: "bags → kg",
    uom: { conversion_factor: 25, full_name: "RICE 25KG", uom_type: "BAG" },
    shop: {
      stock_location: "shop",
      live_quantity: 2500,
      system_quantity: 0,
      counted_quantity: 2500,
      is_counted: true,
    },
    store: null,
  };

  it("prints live shop stock for in-progress sessions", () => {
    const html = buildStockTakePrintHtml({
      session: { session_code: "september 2026", stock_location: "shop", status: "in_progress" },
      blankCounted: false,
      rows: [openRow],
    });

    expect(html).toContain("Current stock");
    expect(html).toContain("100 RICE 25KG");
  });

  it("prints book snapshot as Current stock after complete", () => {
    const html = buildStockTakePrintHtml({
      session: { session_code: "september 2026", stock_location: "shop", status: "completed" },
      blankCounted: false,
      rows: [
        {
          ...openRow,
          shop: {
            stock_location: "shop",
            live_quantity: 2500,
            system_quantity: 187 * 25,
            counted_quantity: 198 * 25,
            is_counted: true,
          },
        },
      ],
    });

    expect(html).toContain("187 RICE 25KG");
    expect(html).toContain("198 RICE 25KG");
    expect(html).toContain("+11 RICE 25KG");
  });

  it("omits unchecked columns from the print sheet", () => {
    const html = buildStockTakePrintHtml({
      session: { session_code: "september 2026", stock_location: "shop" },
      blankCounted: false,
      columns: {
        rowNumber: false,
        productCode: false,
        uom: false,
        shopCurrent: true,
        shopCounted: false,
        shopVariance: false,
        storeCurrent: false,
        storeCounted: false,
        storeVariance: false,
      },
      rows: [openRow],
    });

    expect(html).toContain("Current stock");
    expect(html).not.toContain(">Counted<");
    expect(html).not.toContain(">Variance<");
    expect(html).not.toContain("RICE1");
    expect(html).not.toContain("bags → kg");
  });
});

describe("buildStockTakeExcelRows", () => {
  it("builds Excel headers and cells for selected columns only", () => {
    const [headers, row] = buildStockTakeExcelRows({
      session: { stock_location: "shop" },
      blankCounted: false,
      columns: {
        rowNumber: true,
        productCode: true,
        uom: false,
        shopCurrent: true,
        shopCounted: true,
        shopVariance: false,
        storeCurrent: false,
        storeCounted: false,
        storeVariance: false,
      },
      rows: [
        {
          product_code: "RICE1",
          product_name: "ABABIL",
          hierarchy: "bags → kg",
          uom: { conversion_factor: 25, full_name: "RICE 25KG" },
          shop: {
            live_quantity: 2500,
            system_quantity: 0,
            counted_quantity: 2500,
            is_counted: true,
          },
          store: null,
        },
      ],
    });

    expect(headers).toEqual([
      "#",
      "Product",
      "Product code",
      "Shop current stock",
      "Shop counted",
    ]);
    expect(row[0]).toBe(1);
    expect(row[1]).toBe("ABABIL");
    expect(row[2]).toBe("RICE1");
    expect(row[3]).toContain("100");
    expect(row[4]).toContain("100");
  });
});

describe("normalizeStockTakeExportColumns", () => {
  it("forces store columns off for shop-only sessions", () => {
    const cols = normalizeStockTakeExportColumns(
      { storeCurrent: true, storeCounted: true },
      { stock_location: "shop" },
    );
    expect(cols.storeCurrent).toBe(false);
    expect(cols.shopCurrent).toBe(true);
  });

  it("defaults shop variance on for completed-style defaults", () => {
    const cols = defaultStockTakeExportColumns(
      { stock_location: "shop" },
      { includeCounted: true },
    );
    expect(cols.shopVariance).toBe(true);
    expect(cols.storeCurrent).toBe(false);
  });
});

describe("stockTakePrintRowsFromLines", () => {
  it("uses UOM fields from the line when uomById is empty", () => {
    const rows = stockTakePrintRowsFromLines(
      [
        {
          product_code: "RICE1",
          product_name: "ABABIL",
          stock_location: "shop",
          unit_id: 9,
          conversion_factor: 25,
          uom_name: "RICE 25KG",
          uom_type: "BAG",
          live_quantity: 100,
          system_quantity: 100,
        },
      ],
      new Map([["RICE1", { product_code: "RICE1", unit_id: 9 }]]),
      new Map(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].uom?.conversion_factor).toBe(25);
    expect(rows[0].shop).toBeTruthy();
  });
});
