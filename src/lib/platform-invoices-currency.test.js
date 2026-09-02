import { describe, expect, it } from "vitest";
import {
  calculateInvoiceTotals,
  invoiceFormToPayload,
  invoiceRecordToForm,
  invoiceVatEnabled,
  invoiceShowsLineNumbers,
  isKnownPlatformInvoiceCurrency,
  normalizeInvoiceCurrency,
  platformInvoiceCurrencySelectValue,
  resolveInvoiceVatMode,
} from "./platform-invoices";

describe("platform invoice currency", () => {
  it("normalizes currency codes", () => {
    expect(normalizeInvoiceCurrency(" eur ")).toBe("EUR");
    expect(normalizeInvoiceCurrency("usd$")).toBe("USD");
    expect(normalizeInvoiceCurrency("", "KES")).toBe("KES");
  });

  it("detects known currencies", () => {
    expect(isKnownPlatformInvoiceCurrency("KES")).toBe(true);
    expect(isKnownPlatformInvoiceCurrency("MUR")).toBe(false);
  });

  it("maps custom currencies to the other selector", () => {
    expect(platformInvoiceCurrencySelectValue("EUR")).toBe("EUR");
    expect(platformInvoiceCurrencySelectValue("MUR")).toBe("__other__");
  });

  it("includes currency in save payload", () => {
    const payload = invoiceFormToPayload({
      currency: "eur",
      line_items: [{ description: "Hosting", quantity: 1, unit_price: 100, included: true }],
      tax_rate: 0,
      invoice_options: {},
    });
    expect(payload.currency).toBe("EUR");
  });

  it("skips VAT when vat_enabled is false", () => {
    expect(invoiceVatEnabled({ vat_enabled: false })).toBe(false);
    expect(invoiceVatEnabled({})).toBe(true);

    const totals = calculateInvoiceTotals(
      [{ description: "Hosting", quantity: 1, unit_price: 100, included: true }],
      16,
      { vat_enabled: false, prices_include_vat: true },
    );
    expect(totals).toEqual({ subtotal: 100, tax_amount: 0, total: 100 });
  });

  it("supports vat_mode none, exclusive, and inclusive", () => {
    const lines = [{ description: "Campaign", quantity: 1, unit_price: 100, included: true }];

    expect(calculateInvoiceTotals(lines, 16, { vat_mode: "none" })).toEqual({
      subtotal: 100,
      tax_amount: 0,
      total: 100,
    });

    expect(calculateInvoiceTotals(lines, 16, { vat_mode: "exclusive" })).toEqual({
      subtotal: 100,
      tax_amount: 16,
      total: 116,
    });

    expect(calculateInvoiceTotals(lines, 16, { vat_mode: "inclusive" })).toEqual({
      subtotal: 86.21,
      tax_amount: 13.79,
      total: 100,
    });

    expect(resolveInvoiceVatMode({ prices_include_vat: false })).toBe("exclusive");
  });

  it("hides line numbers for a single active line item", () => {
    const one = [{ description: "Hosting", quantity: 1, unit_price: 100, included: true }];
    const two = [
      { description: "Hosting", quantity: 1, unit_price: 100, included: true },
      { description: "Support", quantity: 1, unit_price: 50, included: true },
    ];
    expect(invoiceShowsLineNumbers(one)).toBe(false);
    expect(invoiceShowsLineNumbers(two)).toBe(true);
  });

  it("keeps invoice issue date when API returns Nairobi midnight as UTC", () => {
    const previousTz = process.env.TZ;
    process.env.TZ = "Africa/Nairobi";
    try {
      const form = invoiceRecordToForm({
        issue_date: "2026-09-01T21:00:00.000000Z",
        due_date: "2026-10-01T21:00:00.000000Z",
        line_items: [{ description: "Hosting", quantity: 1, unit_price: 100, included: true }],
      });
      expect(form.issue_date).toBe("2026-09-02");
      expect(form.due_date).toBe("2026-10-02");
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });
});
