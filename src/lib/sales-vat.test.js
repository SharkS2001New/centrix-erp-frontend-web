import { describe, expect, it } from "vitest";
import { buildThermalVatChargeGroups } from "@/lib/sales-vat";

describe("buildThermalVatChargeGroups", () => {
  it("returns Non-Vatable when no line has a positive VAT rate", () => {
    expect(
      buildThermalVatChargeGroups([
        { amount: 1000, product_vat: 0, vat_rate: 0 },
        { amount: 500, product_vat: 0 },
      ]),
    ).toEqual([{ label: "Non-Vatable", amount: 0 }]);
  });

  it("groups VAT charged by rate as A/B letters", () => {
    expect(
      buildThermalVatChargeGroups([
        { amount: 1160, product_vat: 160, vat_rate: 16 },
        { amount: 1080, product_vat: 80, vat_rate: 8 },
        { amount: 500, product_vat: 0, vat_rate: 0 },
      ]),
    ).toEqual([
      { label: "A(16%)", amount: 160 },
      { label: "B(8%)", amount: 80 },
      { label: "C(0%)", amount: 0 },
    ]);
  });

  it("derives rate from inclusive amount when vat_rate is missing", () => {
    expect(
      buildThermalVatChargeGroups([{ amount: 1160, product_vat: 160 }]),
    ).toEqual([{ label: "A(16%)", amount: 160 }]);
  });

  it("falls back to totalVat when lines are missing", () => {
    expect(buildThermalVatChargeGroups([], { totalVat: 71 })).toEqual([
      { label: "A(16%)", amount: 71 },
    ]);
  });
});
