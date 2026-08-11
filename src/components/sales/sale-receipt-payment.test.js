import { describe, expect, it } from "vitest";
import {
  buildSaleReceiptHtml,
  buildUsedPaymentRows,
  resolveSaleReceiptTenders,
} from "@/components/sales/sale-receipt-print";

const unpaidMobileSale = {
  id: 3917,
  order_num: 3917,
  channel: "mobile",
  order_total: 22535,
  amount_paid: 0,
  payment_method_code: "CASH",
  cash: 15880,
  mpesa_amount: 0,
  equity_amount: 0,
  kcb_amount: 0,
  total_vat: 2013,
  created_at: "2026-08-10T11:47:00Z",
  items: [
    {
      product_code: "P1",
      product_name: "POST MAN 20LTRS",
      quantity: 3,
      unit_price: 4865,
      line_total: 14595,
    },
  ],
};

describe("sale receipt payment rows", () => {
  it("zeros stale cash and shows balance due for fully unpaid orders", () => {
    const tenders = resolveSaleReceiptTenders(unpaidMobileSale, 22535);
    expect(tenders.cashAmount).toBe(0);
    expect(tenders.amountPaid).toBe(0);
    expect(tenders.balanceDue).toBe(22535);

    const rows = buildUsedPaymentRows(unpaidMobileSale, 22535, { showAllMethods: true });
    expect(rows.find((r) => r.label === "Cash")?.value).toBe(0);
    expect(rows.find((r) => r.label === "Balance due")?.value).toBe(22535);
  });

  it("does not invent Cash = total from payment_method_code when unpaid", () => {
    const rows = buildUsedPaymentRows(
      {
        order_total: 22535,
        amount_paid: 0,
        payment_method_code: "CASH",
        cash: 0,
      },
      22535,
      { showAllMethods: false },
    );
    expect(rows.some((r) => r.label === "Cash")).toBe(false);
    expect(rows).toEqual([{ label: "Balance due", value: 22535 }]);
  });

  it("prints partial cash paid plus balance due", () => {
    const rows = buildUsedPaymentRows(
      {
        order_total: 22535,
        amount_paid: 15880,
        payment_method_code: "CASH",
        cash: 15880,
      },
      22535,
      { showAllMethods: true },
    );
    expect(rows.find((r) => r.label === "Cash")?.value).toBe(15880);
    expect(rows.find((r) => r.label === "Balance due")?.value).toBe(6655);
  });

  it("shows Credit instead of Balance due for credit sales", () => {
    const rows = buildUsedPaymentRows(
      {
        order_total: 1000,
        amount_paid: 0,
        is_credit_sale: true,
        payment_method_code: "CREDIT",
      },
      1000,
      { showAllMethods: false },
    );
    expect(rows).toEqual([{ label: "Credit", value: 1000 }]);
  });

  it("embeds Balance due on unpaid thermal receipt HTML", () => {
    const html = buildSaleReceiptHtml(unpaidMobileSale, {
      seller: { name: "GRACIOUS SHOP MCHANGA" },
      branding: { showHeader: false, display: "name", organizationName: "GRACIOUS SHOP MCHANGA" },
      salesSettings: { receipt_show_all_payment_methods: true },
    });
    expect(html).toContain("Balance due");
    expect(html).toMatch(/Cash[\s\S]*?>0</);
    expect(html).not.toMatch(/Cash[\s\S]*?>15[,.]?880</);
  });
});
