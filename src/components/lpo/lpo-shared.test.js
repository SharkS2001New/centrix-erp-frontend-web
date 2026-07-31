import { describe, expect, it } from "vitest";
import { computeLpoLineTotals, computeLpoTotals } from "./lpo-shared";

describe("LPO VAT-inclusive cost totals", () => {
  it("extracts VAT from inclusive cost instead of adding it", () => {
    const line = { ordered_qty: 2, cost_price: 116, vat_rate: 16 };
    const totals = computeLpoLineTotals(line);
    expect(totals.gross).toBe(232);
    expect(totals.vat).toBe(32);
    expect(totals.net).toBe(200);
  });

  it("keeps order total equal to qty × cost", () => {
    const lines = [
      { ordered_qty: 2, cost_price: 116, vat_rate: 16 },
      { ordered_qty: 1, cost_price: 100, vat_rate: 0 },
    ];
    const totals = computeLpoTotals(lines);
    expect(totals.total).toBe(332);
    expect(totals.vat).toBe(32);
    expect(totals.subtotal).toBe(300);
  });
});
