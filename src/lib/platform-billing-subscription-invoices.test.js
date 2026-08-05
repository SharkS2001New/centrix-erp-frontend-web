import { describe, expect, it } from "vitest";
import {
  platformInvoiceLabel,
  resolveAgreementPrices,
  resolveSubscriptionInvoices,
} from "@/lib/platform-billing";

describe("resolveSubscriptionInvoices", () => {
  it("reads initial and renewal invoice relations", () => {
    const sub = {
      initial_invoice_id: 10,
      initial_invoice: { id: 10, invoice_number: "PLT-INIT" },
      invoice_id: 20,
      invoice: { id: 20, invoice_number: "PLT-RENEW" },
    };
    expect(resolveSubscriptionInvoices(sub)).toEqual({
      initial: sub.initial_invoice,
      renewal: sub.invoice,
    });
  });

  it("treats legacy invoice_id as initial when total matches first payment", () => {
    const sub = {
      first_payment_price: 190000,
      renewal_price: 15000,
      invoice_id: 1,
      invoice: { id: 1, invoice_number: "PLT-2026-0001", total: 190000 },
    };
    const { initial, renewal } = resolveSubscriptionInvoices(sub);
    expect(initial?.invoice_number).toBe("PLT-2026-0001");
    expect(renewal).toBeNull();
  });

  it("labels invoices for table links", () => {
    expect(platformInvoiceLabel({ id: 5, invoice_number: "PLT-5" })).toBe("PLT-5");
    expect(platformInvoiceLabel(null)).toBeNull();
  });

  it("resolveAgreementPrices keeps first and renewal separate", () => {
    const prices = resolveAgreementPrices({
      first_payment_price: 190000,
      renewal_price: 15000,
    });
    expect(prices.first_payment_price).toBe(190000);
    expect(prices.renewal_price).toBe(15000);
  });
});
