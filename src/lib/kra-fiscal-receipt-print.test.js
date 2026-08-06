import { describe, expect, it } from "vitest";
import {
  buildKraFiscalReceiptHtml,
  enrichKraReportRow,
  parseKraPluLines,
} from "@/lib/kra-fiscal-receipt-print";

describe("kra fiscal receipt print", () => {
  it("parses plu_data lines from request payload", () => {
    const lines = parseKraPluLines({
      sn: "DEJA02220240050",
      plu_data: [
        {
          item_Name: "BANJAB RICE 25KG",
          SaleQty: "25",
          SalePrice: "147.20",
          SaleAmount: "3680.00",
          Levy: "0",
        },
      ],
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe("BANJAB RICE 25KG");
    expect(lines[0].qty).toBe(25);
    expect(lines[0].unitPrice).toBe(147.2);
    expect(lines[0].amount).toBe(3680);
  });

  it("builds printable html with fiscal metadata and line items", () => {
    const enriched = enrichKraReportRow({
      kra_response_id: 228,
      order_no: 1980,
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
    expect(html).toContain("KRA eTIMS FISCAL RECEIPT");
    expect(html).toContain("data:image/png;base64,abc");
  });
});
