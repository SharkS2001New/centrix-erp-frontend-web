import { describe, expect, it } from "vitest";
import { resolveHotelPosPaymentConfig } from "@/lib/hotel-pos-settings";

describe("resolveHotelPosPaymentConfig", () => {
  it("shows only active org payment methods", () => {
    const cfg = resolveHotelPosPaymentConfig(
      {},
      {
        capabilities: { platform_mpesa_stk_enabled: true, modules: {} },
        activePaymentMethods: [
          { method_code: "CASH", method_name: "Cash", is_active: true },
          { method_code: "MPESA", method_name: "M-Pesa", is_active: true },
        ],
      },
    );

    expect(cfg.showCash).toBe(true);
    expect(cfg.enableMpesaAmount).toBe(true);
    expect(cfg.showCheque).toBe(false);
    expect(cfg.showEquityBank).toBe(false);
    expect(cfg.showKcbBank).toBe(false);
    expect(cfg.showOtherBank).toBe(false);
  });

  it("hides M-Pesa when platform STK is off", () => {
    const cfg = resolveHotelPosPaymentConfig(
      {},
      {
        capabilities: { platform_mpesa_stk_enabled: false, modules: {} },
        activePaymentMethods: [
          { method_code: "CASH", is_active: true },
          { method_code: "MPESA", is_active: true },
        ],
      },
    );

    expect(cfg.showCash).toBe(true);
    expect(cfg.enableMpesaAmount).toBe(false);
  });

  it("maps active Card to other-bank tender", () => {
    const cfg = resolveHotelPosPaymentConfig(
      {},
      {
        capabilities: { modules: {} },
        activePaymentMethods: [{ method_code: "CARD", method_name: "Card", is_active: true }],
      },
    );

    expect(cfg.showCash).toBe(false);
    expect(cfg.showOtherBank).toBe(true);
    expect(cfg.otherBankMethodCode).toBe("CARD");
    expect(cfg.otherBankLabel).toBe("Card");
  });

  it("hides M-Pesa code and cheque number unless sales toggles are on", () => {
    const off = resolveHotelPosPaymentConfig(
      {},
      {
        capabilities: { platform_mpesa_stk_enabled: true, modules: {} },
        activePaymentMethods: [
          { method_code: "MPESA", requires_reference: true, is_active: true },
          { method_code: "CHEQUE", requires_reference: true, is_active: true },
        ],
      },
    );
    expect(off.enableMpesaCode).toBe(false);
    expect(off.showChequeNumber).toBe(false);

    const on = resolveHotelPosPaymentConfig(
      { sales: { enable_mpesa_code: true, enable_cheque: true, enable_cheque_number: true } },
      {
        capabilities: { platform_mpesa_stk_enabled: true, modules: {} },
        activePaymentMethods: [
          { method_code: "MPESA", requires_reference: false, is_active: true },
          { method_code: "CHEQUE", requires_reference: false, is_active: true },
        ],
      },
    );
    expect(on.enableMpesaCode).toBe(true);
    expect(on.showCheque).toBe(true);
    expect(on.showChequeNumber).toBe(true);
  });
});
