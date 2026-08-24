import { describe, expect, it } from "vitest";
import {
  filterPaymentMethodsForOrg,
  listActiveOrgPaymentMethods,
  pickPreferredPaymentMethodId,
  resolveOrgPaymentMethodFlags,
} from "@/lib/org-payment-methods";

const CATALOG = [
  { id: 1, method_code: "CASH", method_name: "Cash", is_active: true },
  { id: 2, method_code: "MPESA", method_name: "M-Pesa", is_active: true },
  { id: 3, method_code: "EQUITY", method_name: "Equity Bank", is_active: true },
  { id: 4, method_code: "KCB", method_name: "KCB", is_active: true },
  { id: 5, method_code: "BANK", method_name: "Bank Transfer", is_active: true },
  { id: 6, method_code: "CHEQUE", method_name: "Cheque", is_active: true },
  { id: 7, method_code: "CARD", method_name: "Card", is_active: true },
  { id: 8, method_code: "CREDIT", method_name: "Credit", is_active: true },
  { id: 9, method_code: "VOUCHER", method_name: "Voucher", is_active: true },
];

describe("listActiveOrgPaymentMethods", () => {
  it("returns all active Admin catalog rows including Card and Equity", () => {
    const listed = listActiveOrgPaymentMethods(CATALOG);
    expect(listed.map((m) => m.method_code)).toEqual([
      "CASH",
      "MPESA",
      "EQUITY",
      "KCB",
      "BANK",
      "CHEQUE",
      "CREDIT",
      "CARD",
      "VOUCHER",
    ]);
  });

  it("drops inactive rows", () => {
    const listed = listActiveOrgPaymentMethods([
      ...CATALOG,
      { id: 10, method_code: "COOP", method_name: "Co-op", is_active: false },
    ]);
    expect(listed.some((m) => m.method_code === "COOP")).toBe(false);
  });
});

describe("pickPreferredPaymentMethodId", () => {
  it("defaults Cash then M-Pesa then Equity then KCB", () => {
    expect(pickPreferredPaymentMethodId(CATALOG)).toBe("1");
    expect(
      pickPreferredPaymentMethodId(CATALOG.filter((m) => m.method_code !== "CASH")),
    ).toBe("2");
    expect(
      pickPreferredPaymentMethodId(
        CATALOG.filter((m) => !["CASH", "MPESA"].includes(m.method_code)),
      ),
    ).toBe("3");
    expect(
      pickPreferredPaymentMethodId(
        CATALOG.filter((m) => !["CASH", "MPESA", "EQUITY"].includes(m.method_code)),
      ),
    ).toBe("4");
  });
});

describe("filterPaymentMethodsForOrg", () => {
  it("keeps Cash plus enabled External POS payment fields only", () => {
    const filtered = filterPaymentMethodsForOrg(CATALOG, {
      sales: {
        enable_mpesa_amount: true,
        enable_equity_bank: true,
        enable_kcb_bank: false,
        enable_other_bank: false,
        enable_cheque: true,
      },
    });
    expect(filtered.map((m) => m.method_code)).toEqual([
      "CASH",
      "MPESA",
      "EQUITY",
      "CHEQUE",
    ]);
  });

  it("drops M-Pesa when the field is disabled", () => {
    const filtered = filterPaymentMethodsForOrg(CATALOG, {
      sales: {
        enable_mpesa_amount: false,
        enable_equity_bank: false,
        enable_kcb_bank: false,
        enable_other_bank: false,
        enable_cheque: false,
      },
    });
    expect(filtered.map((m) => m.method_code)).toEqual(["CASH"]);
  });

  it("includes other-bank catalog rows when Other bank is enabled", () => {
    const filtered = filterPaymentMethodsForOrg(CATALOG, {
      sales: {
        enable_mpesa_amount: false,
        enable_equity_bank: false,
        enable_kcb_bank: false,
        enable_other_bank: true,
        enable_cheque: false,
      },
    });
    expect(filtered.map((m) => m.method_code)).toEqual(["CASH", "BANK"]);
  });

  it("includes Credit only when explicitly requested", () => {
    const without = filterPaymentMethodsForOrg(
      CATALOG,
      {
        sales: {
          enable_mpesa_amount: false,
          enable_equity_bank: false,
          enable_kcb_bank: false,
          enable_other_bank: false,
          enable_cheque: false,
          enable_credit_payment: true,
        },
      },
      {
        checkoutContext: "pos",
        capabilities: { modules: { "sales.pos": true, customers_suppliers: true } },
      },
    );
    expect(without.some((m) => m.method_code === "CREDIT")).toBe(false);

    const withCredit = filterPaymentMethodsForOrg(
      CATALOG,
      {
        sales: {
          enable_mpesa_amount: false,
          enable_equity_bank: false,
          enable_kcb_bank: false,
          enable_other_bank: false,
          enable_cheque: false,
          enable_credit_payment: true,
        },
      },
      {
        includeCredit: true,
        checkoutContext: "pos",
        capabilities: { modules: { "sales.pos": true, customers_suppliers: true } },
      },
    );
    expect(withCredit.map((m) => m.method_code)).toEqual(["CASH", "CREDIT"]);
  });

  it("hides M-Pesa when platform M-Pesa is disabled", () => {
    const flags = resolveOrgPaymentMethodFlags(
      { sales: { enable_mpesa_amount: true } },
      { capabilities: { platform_mpesa_stk_enabled: false } },
    );
    expect(flags.mpesa).toBe(false);
  });
});
