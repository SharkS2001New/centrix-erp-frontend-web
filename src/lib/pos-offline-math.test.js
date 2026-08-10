import { describe, expect, it } from "vitest";
import {
  resolveLocalLineVatRate,
  serverCartLinesToLocal,
  summarizeLocalPosCart,
} from "@/lib/pos-offline";

describe("serverCartLinesToLocal VAT", () => {
  it("does not treat product_vat money as a percent rate", () => {
    const [line] = serverCartLinesToLocal([
      {
        product_code: "SUGAR",
        quantity: 50,
        unit_price: 125,
        amount: 1160,
        product_vat: 160,
      },
    ]);
    expect(line.product_vat).toBe(160);
    expect(line.vat_rate).toBeCloseTo(16, 5);
    expect(line.vat_rate).toBeLessThan(50);
  });

  it("prefers nested product vat percentage when present", () => {
    const [line] = serverCartLinesToLocal([
      {
        product_code: "SUGAR",
        quantity: 1,
        amount: 116,
        product: { vat: { vat_percentage: 16 } },
      },
    ]);
    expect(line.vat_rate).toBe(16);
  });
});

describe("resolveLocalLineVatRate", () => {
  it("rejects absurd explicit rates that are really VAT money", () => {
    expect(resolveLocalLineVatRate({ vat_rate: 160, amount: 1160, product_vat: 160 })).toBe(16);
  });
});

describe("summarizeLocalPosCart", () => {
  it("uses stored product_vat money for header VAT when vat_rate is missing", () => {
    const summary = summarizeLocalPosCart({
      lines: [
        {
          product_code: "A",
          quantity: 1,
          unit_price: 1160,
          amount: 1160,
          product_vat: 160,
        },
      ],
    });
    expect(summary.total).toBe(1160);
    expect(summary.vat).toBe(160);
  });

  it("subtracts voucher/points/mpesa prepaid from amount due", () => {
    const summary = summarizeLocalPosCart({
      lines: [{ product_code: "A", quantity: 1, unit_price: 1000, amount: 1000 }],
      voucher_payment_amount: 100,
      points_payment_amount: 50,
      mpesa_payment_amount: 200,
    });
    expect(summary.total).toBe(1000);
    expect(summary.amountDue).toBe(650);
  });
});
