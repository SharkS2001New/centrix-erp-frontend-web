import { describe, expect, it } from "vitest";
import {
  buildReceiptPaymentDetailsHtml,
  normalizeReceiptPaymentDetails,
  receiptPaymentDetailsToPayload,
  resolveReceiptPaymentDetails,
  shouldShowReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";

describe("proforma payment details isolation", () => {
  const sales = {
    show_receipt_payment_details: true,
    show_invoice_payment_details: true,
    show_proforma_payment_details: true,
    pos_receipt_payment_details: {
      title: "Thermal pay",
      lines: [{ label: "Till", value: "111" }],
      note: "",
    },
    invoice_payment_details: {
      title: "Invoice pay",
      lines: [{ label: "Account", value: "555" }],
      note: "",
    },
    proforma_payment_details: {
      title: "Proforma pay",
      lines: [{ label: "Paybill", value: "999" }],
      note: "",
    },
  };

  it("uses proforma_payment_details for proforma documents only", () => {
    const proforma = resolveReceiptPaymentDetails({
      moduleSettings: { sales },
      documentType: "proforma",
    });
    expect(proforma?.lines?.[0]?.value).toBe("999");

    const thermal = resolveReceiptPaymentDetails({
      moduleSettings: { sales },
      documentType: "receipt",
    });
    expect(thermal?.lines?.[0]?.value).toBe("111");
  });

  it("uses invoice_payment_details for invoice documents only", () => {
    const invoice = resolveReceiptPaymentDetails({
      moduleSettings: { sales },
      documentType: "invoice",
    });
    expect(invoice?.lines?.[0]?.value).toBe("555");

    const thermal = resolveReceiptPaymentDetails({
      moduleSettings: { sales },
      documentType: "receipt",
    });
    expect(thermal?.lines?.[0]?.value).toBe("111");
  });

  it("falls back to thermal details when invoice_payment_details was never saved", () => {
    const { invoice_payment_details: _removed, ...withoutInvoice } = sales;
    const invoice = resolveReceiptPaymentDetails({
      moduleSettings: { sales: withoutInvoice },
      documentType: "invoice",
    });
    expect(invoice?.lines?.[0]?.value).toBe("111");
  });

  it("does not fall back to thermal details when proforma details are empty", () => {
    const empty = resolveReceiptPaymentDetails({
      moduleSettings: {
        sales: {
          ...sales,
          proforma_payment_details: { title: "Payment details", lines: [], note: "" },
        },
      },
      documentType: "proforma",
    });
    expect(empty).toBeNull();
  });

  it("respects show flags per document type", () => {
    expect(shouldShowReceiptPaymentDetails({ sales }, "proforma")).toBe(true);
    expect(shouldShowReceiptPaymentDetails({ sales }, "invoice")).toBe(true);
    expect(
      shouldShowReceiptPaymentDetails(
        { sales: { ...sales, show_proforma_payment_details: false } },
        "proforma",
      ),
    ).toBe(false);
    expect(
      shouldShowReceiptPaymentDetails(
        { sales: { ...sales, show_invoice_payment_details: false } },
        "invoice",
      ),
    ).toBe(false);
    expect(
      shouldShowReceiptPaymentDetails(
        { sales: { ...sales, show_receipt_payment_details: false } },
        "receipt",
      ),
    ).toBe(false);
  });
});

describe("payment details editor / multi-block", () => {
  it("keeps blank draft lines when keepEmptyLines is true (Add line)", () => {
    const withDraft = normalizeReceiptPaymentDetails(
      {
        title: "Payment details",
        lines: [
          { label: "Bank", value: "Equity" },
          { label: "", value: "" },
        ],
      },
      { keepEmptyLines: true },
    );
    expect(withDraft.blocks[0].lines).toHaveLength(2);
    expect(withDraft.blocks[0].lines[1]).toEqual({ label: "", value: "" });
  });

  it("strips blank lines for save/print payload", () => {
    const payload = receiptPaymentDetailsToPayload({
      title: "Payment details",
      lines: [
        { label: "Bank", value: "Equity" },
        { label: "", value: "" },
        { label: "Swift code", value: "EQBLKENA" },
      ],
    });
    expect(payload?.lines).toEqual([
      { label: "Bank", value: "Equity" },
      { label: "Swift code", value: "EQBLKENA" },
    ]);
  });

  it("supports multiple bank blocks and prints both", () => {
    const payload = receiptPaymentDetailsToPayload({
      title: "Payment details",
      blocks: [
        {
          title: "Equity Bank",
          lines: [
            { label: "Account no.", value: "111" },
            { label: "Swift code", value: "EQBLKENA" },
          ],
        },
        {
          title: "KCB",
          lines: [{ label: "Account no.", value: "222" }],
        },
      ],
      note: "",
    });

    expect(payload?.blocks).toHaveLength(2);
    expect(payload?.lines).toHaveLength(3);

    const html = buildReceiptPaymentDetailsHtml(payload, { layout: "a4" });
    expect(html).toContain("Equity Bank");
    expect(html).toContain("KCB");
    expect(html).toContain("EQBLKENA");
  });

  it("migrates legacy flat lines into a single block", () => {
    const normalized = normalizeReceiptPaymentDetails({
      title: "Payment details",
      lines: [{ label: "Till", value: "55" }],
      note: "",
    });
    expect(normalized.blocks).toHaveLength(1);
    expect(normalized.blocks[0].lines[0].value).toBe("55");
  });
});
