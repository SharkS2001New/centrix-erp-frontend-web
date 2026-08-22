import { describe, expect, it } from "vitest";
import { applyPaymentMethodsCatalog } from "@/lib/checkout-payment-methods-catalog";

describe("applyPaymentMethodsCatalog", () => {
  const base = {
    enableMpesaAmount: true,
    enableMpesaCode: false,
    showEquityBank: true,
    showKcbBank: true,
    showOtherBank: false,
    showCheque: true,
    hasBankPayments: true,
  };

  it("leaves config alone when catalog is empty", () => {
    const next = applyPaymentMethodsCatalog(base, []);
    expect(next.enableMpesaAmount).toBe(true);
    expect(next.extraTenders).toEqual([]);
  });

  it("hides built-in tenders when catalog marks them inactive", () => {
    const next = applyPaymentMethodsCatalog(base, [
      { method_code: "CASH", method_name: "Cash", is_active: true },
      { method_code: "MPESA", method_name: "M-Pesa", is_active: false },
      { method_code: "EQUITY", method_name: "Equity", is_active: false },
    ]);
    expect(next.enableMpesaAmount).toBe(false);
    expect(next.showEquityBank).toBe(false);
    expect(next.showKcbBank).toBe(true);
  });

  it("surfaces custom Admin payment methods as extra tenders", () => {
    const next = applyPaymentMethodsCatalog(base, [
      { method_code: "CASH", method_name: "Cash", is_active: true },
      { method_code: "CARD", method_name: "Visa / Card", is_active: true, requires_reference: true },
      { method_code: "COOP", method_name: "Co-op Bank", is_active: true },
    ]);
    expect(next.extraTenders).toEqual([
      { code: "CARD", label: "Visa / Card", requiresReference: true },
      { code: "COOP", label: "Co-op Bank", requiresReference: false },
    ]);
  });
});
