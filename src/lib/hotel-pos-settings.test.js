import { describe, expect, it } from "vitest";
import {
  resolveHotelPosPaymentConfig,
  resolveHotelPosSettings,
} from "@/lib/hotel-pos-settings";

describe("resolveHotelPosPaymentConfig", () => {
  it("follows sales payment fields when Hotel POS methods are not saved yet", () => {
    const cfg = resolveHotelPosPaymentConfig(
      { sales: { enable_equity_bank: true, enable_kcb_bank: false, enable_cheque: false } },
      {
        capabilities: { modules: {} },
        activePaymentMethods: [
          { method_code: "CASH", method_name: "Cash", is_active: true },
          { method_code: "MPESA", method_name: "M-Pesa", is_active: true },
          { method_code: "CARD", method_name: "Card", is_active: true },
        ],
      },
    );

    const codes = cfg.tenders.map((row) => row.code);
    expect(codes).toContain("CASH");
    expect(codes).toContain("MPESA");
    expect(codes).toContain("EQUITY");
    expect(codes).not.toContain("KCB");
    expect(codes).not.toContain("CARD");
    expect(cfg.showCheque).toBe(false);
    expect(cfg.enableMpesaAmount).toBe(true);
  });

  it("hides a tender when platform Hotel POS payment methods turn it off", () => {
    const cfg = resolveHotelPosPaymentConfig(
      {
        hospitality: {
          payment_methods: {
            cash: true,
            mpesa: false,
            equity: false,
            kcb: false,
            other_bank: false,
            cheque: false,
            extra: false,
          },
        },
      },
      {
        capabilities: { modules: {} },
        activePaymentMethods: [
          { method_code: "MPESA", method_name: "M-Pesa", is_active: true },
          { method_code: "EQUITY", method_name: "Equity", is_active: true },
        ],
      },
    );

    const codes = cfg.tenders.map((row) => row.code);
    expect(codes).toEqual(["CASH"]);
    expect(cfg.enableMpesaAmount).toBe(false);
  });

  it("shows extra Admin payment methods only when extra is enabled", () => {
    const cfg = resolveHotelPosPaymentConfig(
      {
        hospitality: {
          payment_methods: {
            cash: true,
            mpesa: false,
            equity: false,
            kcb: false,
            other_bank: false,
            cheque: false,
            extra: true,
          },
        },
      },
      {
        capabilities: { modules: {} },
        activePaymentMethods: [{ method_code: "CARD", method_name: "Card", is_active: true }],
      },
    );

    expect(cfg.tenders.map((row) => row.code)).toEqual(["CASH", "CARD"]);
  });

  it("uses catalog labels for enabled bank tenders", () => {
    const cfg = resolveHotelPosPaymentConfig(
      {
        hospitality: {
          payment_methods: {
            cash: true,
            mpesa: false,
            equity: true,
            kcb: false,
            other_bank: false,
            cheque: false,
            extra: false,
          },
        },
      },
      {
        capabilities: { modules: {} },
        activePaymentMethods: [{ method_code: "EQUITY", method_name: "Equity", is_active: true }],
      },
    );

    expect(cfg.tenders.find((row) => row.code === "EQUITY")).toMatchObject({
      code: "EQUITY",
      label: "Equity",
    });
  });

  it("hides M-Pesa code and cheque number unless sales toggles are on", () => {
    const off = resolveHotelPosPaymentConfig(
      {
        hospitality: {
          payment_methods: { cash: true, mpesa: true, cheque: true, extra: false },
        },
      },
      {
        capabilities: { modules: {} },
        activePaymentMethods: [
          { method_code: "MPESA", requires_reference: true, is_active: true },
          { method_code: "CHEQUE", requires_reference: true, is_active: true },
        ],
      },
    );
    expect(off.enableMpesaCode).toBe(false);
    expect(off.showChequeNumber).toBe(false);

    const on = resolveHotelPosPaymentConfig(
      {
        sales: { enable_mpesa_code: true, enable_cheque_number: true },
        hospitality: {
          payment_methods: { cash: true, mpesa: true, cheque: true, extra: false },
        },
      },
      {
        capabilities: { modules: {} },
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

describe("resolveHotelPosSettings", () => {
  it("reads hotel_pos_* from sales when hospitality lacks them", () => {
    const settings = resolveHotelPosSettings({
      module_settings: {
        hospitality: { stock_deduct_on_settle: true },
        sales: {
          hotel_pos_grid_columns: 5,
          hotel_pos_catalog_limit: 40,
          hotel_pos_collect_payment: false,
          hotel_pos_theme_template: "ocean",
        },
      },
    });

    expect(settings.gridColumns).toBe(5);
    expect(settings.catalogLimit).toBe(40);
    expect(settings.collectPayment).toBe(false);
    expect(settings.stockDeductOnSettle).toBe(true);
    expect(settings.themeTemplate).toBe("ocean");
  });

  it("lets hospitality override sales hotel_pos_* values", () => {
    const settings = resolveHotelPosSettings({
      module_settings: {
        sales: { hotel_pos_grid_columns: 5, hotel_pos_catalog_limit: 40 },
        hospitality: { hotel_pos_grid_columns: 4, hotel_pos_catalog_limit: 20 },
      },
    });
    expect(settings.gridColumns).toBe(4);
    expect(settings.catalogLimit).toBe(20);
  });
});
