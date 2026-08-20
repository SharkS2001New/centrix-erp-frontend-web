import { describe, expect, it } from "vitest";
import {
  buildKraFiscalReceiptHtml,
  enrichKraReportRow,
  matchKraFailureLineIndexes,
  parseKraPluLines,
} from "@/lib/kra-fiscal-receipt-print";

describe("kra fiscal receipt print", () => {
  it("parses plu_data lines from request payload", () => {
    const lines = parseKraPluLines({
      sn: "DEJA02220240050",
      plu_data: [
        {
          item_Name: "BANJAB RICE 25KG",
          Barcode: "RICE25",
          SaleQty: "25",
          SalePrice: "147.20",
          SaleAmount: "3680.00",
          Levy: "0",
        },
      ],
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe("BANJAB RICE 25KG");
    expect(lines[0].barcode).toBe("RICE25");
    expect(lines[0].qty).toBe(25);
    expect(lines[0].unitPrice).toBe(147.2);
    expect(lines[0].amount).toBe(3680);
  });

  it("matches the PLU line named in a device failure message by product_code", () => {
    const payload = {
      plu_data: [
        {
          item_Name: "Sugar 1kg",
          Barcode: "",
          product_code: "SUGAR1",
          SaleQty: "1",
          SalePrice: "100",
          SaleAmount: "100",
        },
        {
          item_Name: "Milk 500ml",
          Barcode: "",
          product_code: "ABC123",
          SaleQty: "2",
          SalePrice: "50",
          SaleAmount: "100",
        },
      ],
    };
    const { culpritIndexes, suspectsAll } = matchKraFailureLineIndexes(
      "NO FIND PLU DATA for item ABC123",
      payload,
      null,
    );
    expect(culpritIndexes).toEqual([1]);
    expect(suspectsAll).toBe(false);
  });

  it("matches device SKU with barcode prefix against product_code", () => {
    const payload = {
      plu_data: [
        { item_Name: "Rice", Barcode: "", product_code: "RICE25", SaleQty: "1", SalePrice: "10", SaleAmount: "10" },
        { item_Name: "Milk", Barcode: "", product_code: "MILK1", SaleQty: "1", SalePrice: "10", SaleAmount: "10" },
      ],
    };
    const { culpritIndexes } = matchKraFailureLineIndexes(
      "NO FIND PLU DATA for item 000000MILK1",
      payload,
      null,
    );
    expect(culpritIndexes).toEqual([1]);
  });

  it("does not mark every line when E337 has no named SKU", () => {
    const payload = {
      plu_data: [
        {
          item_Name: "Sugar 1kg",
          Barcode: "",
          product_code: "SUGAR1",
          SaleQty: "1",
          SalePrice: "100",
          SaleAmount: "100",
        },
        {
          item_Name: "Milk 500ml",
          Barcode: "",
          product_code: "MILK1",
          SaleQty: "2",
          SalePrice: "50",
          SaleAmount: "100",
        },
      ],
    };
    const { culpritIndexes, suspectsAll } = matchKraFailureLineIndexes(
      "One or more products were not found on the KRA device. Upload products to the device first, then retry.",
      payload,
      null,
    );
    expect(culpritIndexes).toEqual([]);
    expect(suspectsAll).toBe(false);
  });

  it("does not treat product names listed in a bloated error as every culprit", () => {
    const payload = {
      plu_data: [
        { item_Name: "BANJAB RICE 25KG", product_code: "RICE25", SaleQty: "1", SalePrice: "1", SaleAmount: "1" },
        { item_Name: "STAR BIRIYANI", product_code: "STAR1", SaleQty: "1", SalePrice: "1", SaleAmount: "1" },
        { item_Name: "COSMO HB 1KG", product_code: "COSMO1", SaleQty: "1", SalePrice: "1", SaleAmount: "1" },
      ],
    };
    const { culpritIndexes } = matchKraFailureLineIndexes(
      "One or more of these products were not found on the KRA device: BANJAB RICE 25KG; STAR BIRIYANI; COSMO HB 1KG. Upload the missing product(s) to the device, then retry.",
      payload,
      null,
    );
    expect(culpritIndexes).toEqual([]);
  });

  it("parses product_code when Barcode is empty", () => {
    const lines = parseKraPluLines({
      plu_data: [
        {
          item_Name: "BANJAB RICE 25KG",
          Barcode: "",
          product_code: "RICE25",
          SaleQty: "25",
          SalePrice: "147.20",
          SaleAmount: "3680.00",
        },
      ],
    });
    expect(lines[0].barcode).toBe("RICE25");
    expect(lines[0].productCode).toBe("RICE25");
  });

  it("builds printable html with fiscal metadata and line items", () => {
    const enriched = enrichKraReportRow({
      kra_response_id: 228,
      order_no: 74,
      pos_order_num: 74,
      channel: "pos",
      customer_name: "Acme Ltd",
      cashier_name: "Jane Wanjiku",
      invoice_number: "1786006888",
      serial_number: "DEJA02220240050",
      signature_link: "https://etims.example/verify/1980",
      receipt_signature: "2026-08-06 11:49 DEJA022 signature",
      kra_timestamp: "2026-08-06 11:47:51",
      status: "success",
      order_total: 5660,
      total_vat: 780.69,
      request_payload: {
        plu_data: [
          {
            item_Name: "BANJAB RICE 25KG",
            SaleQty: "25",
            SalePrice: "147.20",
            SaleAmount: "3680.00",
          },
        ],
        sign_structure: {
          pinOfBuyer: "P051234567X",
        },
      },
      response_payload: {
        scu_id: "KRACU0300007379",
        cu_inv_no: "0090876",
        internal_data: "DBKX-3DUA-V4PU-7DBW",
        version: "Ver:1.013",
      },
    });

    const html = buildKraFiscalReceiptHtml(enriched, {
      orgName: "Demo Store",
      qrDataUrl: "data:image/png;base64,abc",
    });

    expect(html).toContain("KRA FISCAL TAX INVOICE");
    expect(html).toContain("BANJAB RICE 25KG");
    expect(html).toContain("1786006888");
    expect(html).toContain("KRACU0300007379");
    expect(html).toContain("0090876");
    expect(html).toContain("Acme Ltd");
    expect(html).toContain("P051234567X");
    expect(html).toContain("Served by: Jane Wanjiku");
    expect(html).toContain("74");
    expect(html).toContain("KRA eTIMS FISCAL RECEIPT");
    expect(html).toContain("data:image/png;base64,abc");
  });

  it("builds credit note print title and original CU", () => {
    const enriched = enrichKraReportRow({
      kra_response_id: 229,
      order_no: 74,
      channel: "pos",
      invoice_number: "1786006999",
      status: "success",
      order_total: 5660,
      total_vat: 780.69,
      document_type: "credit_note",
      relevant_invoice_number: "1786006888",
      request_payload: {
        plu_data: [{ item_Name: "BANJAB RICE 25KG", SaleQty: "25", SalePrice: "147.20" }],
        sign_structure: { InvoiceType: "credit", relevantInvoiceNumber: "1786006888" },
      },
      response_payload: {
        document_type: "credit_note",
        relevant_invoice_number: "1786006888",
        scu_id: "KRACU0300007379",
      },
    });

    expect(enriched.isCreditNote).toBe(true);
    expect(enriched.relevantInvoiceNumber).toBe("1786006888");

    const html = buildKraFiscalReceiptHtml(enriched, { orgName: "Demo Store" });
    expect(html).toContain("KRA FISCAL CREDIT NOTE");
    expect(html).toContain("KRA eTIMS FISCAL CREDIT NOTE");
    expect(html).toContain("Original CU");
    expect(html).toContain("1786006888");
  });
});
