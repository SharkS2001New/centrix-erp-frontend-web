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

  it("keeps M-Pesa tendered amount and change instead of clamping to order total", () => {
    const sale = {
      order_total: 4950,
      amount_paid: 4950,
      payment_method_code: "MPESA",
      cash: 0,
      mpesa_amount: 5000,
      equity_amount: 0,
      kcb_amount: 0,
      _cash_tendered: 5000,
      _change_given: 50,
      order_change: 50,
      items: [],
    };

    const tenders = resolveSaleReceiptTenders(sale, 4950);
    expect(tenders.mpesaAmount).toBe(5000);
    expect(tenders.amountPaid).toBe(4950);
    expect(tenders.tenderPaid).toBe(5000);

    const rows = buildUsedPaymentRows(sale, 4950, { showAllMethods: false });
    expect(rows).toEqual([{ label: "M-Pesa", value: 5000 }]);

    const html = buildSaleReceiptHtml(sale, {
      seller: { name: "Test Shop" },
      branding: { showHeader: false, display: "name", organizationName: "Test Shop" },
      salesSettings: { receipt_show_all_payment_methods: false },
    });
    expect(html).toMatch(/Total[\s\S]*?>4[,.]?950</);
    expect(html).toMatch(/M-Pesa[\s\S]*?>5[,.]?000</);
    expect(html).toContain("Change Given");
    expect(html).toMatch(/Change Given[\s\S]*?>50</);
  });

  it("keeps cash overpayment tender when change is recorded", () => {
    const sale = {
      order_total: 39670,
      amount_paid: 39670,
      payment_method_code: "CASH",
      cash: 40000,
      mpesa_amount: 0,
      _cash_tendered: 40000,
      _change_given: 330,
      order_change: 330,
    };
    const tenders = resolveSaleReceiptTenders(sale, 39670);
    expect(tenders.cashAmount).toBe(40000);
    expect(tenders.tenderPaid).toBe(40000);
  });
});
