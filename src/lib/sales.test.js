import { describe, expect, it } from "vitest";
import {
  resolvePaymentMethodByCode,
  shouldOpenBackofficeOrderEdit,
  shouldRestoreOrderToCart,
} from "@/lib/sales";

describe("resolvePaymentMethodByCode", () => {
  const methods = [
    { id: 1, method_code: "CASH", method_name: "Cash" },
    { id: 2, method_code: "MPESA", method_name: "M-Pesa" },
    { id: 3, method_code: "BANK", method_name: "Bank Transfer" },
    { id: 4, method_code: "CHEQUE", method_name: "Cheque" },
  ];

  it("resolves exact tender codes", () => {
    expect(resolvePaymentMethodByCode(methods, "CASH")?.id).toBe(1);
    expect(resolvePaymentMethodByCode(methods, "mpesa")?.id).toBe(2);
  });

  it("maps Equity/KCB/Other bank tenders onto BANK when dedicated rows are missing", () => {
    expect(resolvePaymentMethodByCode(methods, "EQUITY")?.id).toBe(3);
    expect(resolvePaymentMethodByCode(methods, "KCB")?.id).toBe(3);
    expect(resolvePaymentMethodByCode(methods, "OTHER")?.id).toBe(3);
  });

  it("returns null when no methods are loaded", () => {
    expect(resolvePaymentMethodByCode([], "CASH")).toBeNull();
  });
});

describe("sales order edit routing", () => {
  const mobileBookedSale = {
    id: 1,
    status: "booked",
    channel: "mobile",
    order_source: "mobile",
    can_edit: true,
    can_edit_lines: false,
  };

  const posBookedSale = {
    id: 2,
    status: "booked",
    channel: "pos",
    order_source: "pos",
    can_edit: true,
    can_edit_lines: false,
  };

  const capabilitiesWithPos = {
    modules: { sales: true, "sales.pos": true },
  };

  it("opens the line-edit popup for booked mobile orders", () => {
    expect(shouldOpenBackofficeOrderEdit(mobileBookedSale, null, capabilitiesWithPos)).toBe(true);
    expect(shouldRestoreOrderToCart(mobileBookedSale, null, capabilitiesWithPos)).toBe(false);
  });

  it("still restores external POS orders to cart", () => {
    expect(shouldOpenBackofficeOrderEdit(posBookedSale, null, capabilitiesWithPos)).toBe(false);
    expect(shouldRestoreOrderToCart(posBookedSale, null, capabilitiesWithPos)).toBe(true);
  });

  it("prefers the popup when can_edit_lines is true", () => {
    const sale = { ...posBookedSale, can_edit_lines: true };
    expect(shouldOpenBackofficeOrderEdit(sale, null, capabilitiesWithPos)).toBe(true);
    expect(shouldRestoreOrderToCart(sale, null, capabilitiesWithPos)).toBe(false);
  });
});
