import { describe, expect, it } from "vitest";
import {
  invoiceFormToPayload,
  isKnownPlatformInvoiceCurrency,
  normalizeInvoiceCurrency,
  platformInvoiceCurrencySelectValue,
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
});
