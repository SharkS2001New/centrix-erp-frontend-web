import { describe, expect, it } from "vitest";
import {
  linePrice,
  retailMarkupApplications,
  resolvedMiddleFactor,
  tiersForRetailPackage,
} from "@/lib/retail-pricing";

const sugarUom = {
  conversion_factor: 50,
  measure_name: "kg",
  package_name: "bag",
  uom_type: "bag",
};

const sugarTiers = [
  {
    min_qty: 1,
    max_qty: 12.5,
    measure_level: "small",
    price_mode: "retail",
    markup_price: 5,
  },
  {
    min_qty: 13,
    max_qty: 50,
    measure_level: "full",
    price_mode: "wholesale",
    markup_price: 30,
  },
];

describe("retail markup accumulation", () => {
  it("uses half-bag as implicit middle when UOM has no middle_factor", () => {
    expect(resolvedMiddleFactor(sugarUom)).toBe(25);
  });

  it("prices one 25kg retail add as half bag + one markup", () => {
    // 6250/2 + 30 = 3155 — never 3185 (double markup from a 12.5 middle factor)
    expect(linePrice(6250, sugarTiers, 25, true, sugarUom)).toBe(3155);
  });

  it("does not double markup when UOM middle_factor is 12.5", () => {
    const uomWithBadMiddle = { ...sugarUom, middle_factor: 12.5, middle_package_name: "half" };
    const retailMiddleTier = [
      {
        min_qty: 1,
        max_qty: 12.5,
        measure_level: "small",
        price_mode: "retail",
        markup_price: 5,
      },
      {
        min_qty: 13,
        max_qty: 50,
        measure_level: "middle",
        price_mode: "retail",
        markup_price: 30,
      },
    ];
    expect(linePrice(6250, retailMiddleTier, 25, true, uomWithBadMiddle)).toBe(3155);
    expect(linePrice(6250, retailMiddleTier, 50, true, uomWithBadMiddle)).toBe(6310);
  });

  it("accumulates markup when qty grows 25 → 50 → 75", () => {
    expect(linePrice(6250, sugarTiers, 25, true, sugarUom)).toBe(3155);
    // 6250 + 60
    expect(linePrice(6250, sugarTiers, 50, true, sugarUom)).toBe(6310);
    // 75kg is past tier max — still uses last tier; 9375 + 90
    expect(linePrice(6250, sugarTiers, 75, true, sugarUom)).toBe(9465);
  });

  it("prices configured retail tiers (1–12 kg +5, 12.5–50 kg +30 per half bag)", () => {
    const configuredTiers = [
      { min_qty: 1, max_qty: 12, measure_level: "small", price_mode: "retail", markup_price: 5 },
      { min_qty: 12.5, max_qty: 50, measure_level: "small", price_mode: "retail", markup_price: 30 },
    ];
    expect(linePrice(6250, configuredTiers, 10, true, sugarUom)).toBe(1300);
    expect(linePrice(6250, configuredTiers, 25, true, sugarUom)).toBe(3155);
    expect(linePrice(6250, configuredTiers, 50, true, sugarUom)).toBe(6310);
    expect(linePrice(6250, configuredTiers, 75, true, sugarUom)).toBe(9465);
  });

  it("counts three markup applications for 75kg on a full-pack wholesale tier", () => {
    expect(retailMarkupApplications(75, sugarTiers[1], sugarUom)).toBe(3);
  });

  it("keeps small retail tier markup per kg", () => {
    // (125 + 5) * 10 = 1300
    expect(linePrice(6250, sugarTiers, 10, true, sugarUom)).toBe(1300);
  });

  it("keeps wholesale session flat markup once per line", () => {
    expect(linePrice(6250, sugarTiers, 50, false, sugarUom)).toBe(6280);
  });

  it("legacy max_qty_measure + markup uses aggregate chunk markup on pack products", () => {
    const legacyPackage = {
      max_qty_measure: 50,
      markup_price: 30,
      wholesale_qty_measure: 0,
    };
    const tiers = tiersForRetailPackage(legacyPackage, sugarUom);
    expect(linePrice(6250, tiers, 25, true, sugarUom)).toBe(3155);
    expect(linePrice(6250, tiers, 50, true, sugarUom)).toBe(6310);
    expect(linePrice(6250, tiers, 75, true, sugarUom)).toBe(9465);
  });

  it("legacy small-unit products keep per-piece retail markup", () => {
    const legacyPackage = { max_qty_measure: 50, markup_price: 5, wholesale_qty_measure: 0 };
    const pcsUom = { conversion_factor: 1, measure_name: "pcs", uom_type: "count" };
    const tiers = tiersForRetailPackage(legacyPackage, pcsUom);
    expect(linePrice(100, tiers, 10, true, pcsUom)).toBe(1050);
  });

  it("accumulates markup for legacy middle wholesale tiers", () => {
    const legacyTiers = [
      {
        min_qty: 1,
        max_qty: 12.5,
        measure_level: "small",
        price_mode: "retail",
        markup_price: 5,
      },
      {
        min_qty: 12.501,
        max_qty: 50,
        measure_level: "middle",
        price_mode: "wholesale",
        markup_price: 30,
      },
    ];
    expect(linePrice(6250, legacyTiers, 25, true, sugarUom)).toBe(3155);
    expect(linePrice(6250, legacyTiers, 50, true, sugarUom)).toBe(6310);
    expect(linePrice(6250, legacyTiers, 75, true, sugarUom)).toBe(9465);
  });
});
