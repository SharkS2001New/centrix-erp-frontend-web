import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildKraThermalQrHtml,
  extractKraReceiptData,
  ensureKraQrForPrint,
  sanitizeKraSignatureLink,
  kraReceiptQrDataUrl,
} from "@/lib/kra-receipt-qr";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api";

describe("kra receipt QR", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("repairs a junk year prefix so the eTIMS payload can be encoded as a QR", () => {
    const dirty =
      "úb26-10-08 10:04 DEJA02220240050 0000311 https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=P052177271G00WQPSBIRXYBUPAZIY_test";
    expect(sanitizeKraSignatureLink(dirty)).toBe(
      "2026-10-08 10:04 DEJA02220240050 0000311 https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=P052177271G00WQPSBIRXYBUPAZIY_test",
    );
  });

  it("keeps seconds in the eTIMS clock so the QR payload stays scannable", () => {
    expect(
      sanitizeKraSignatureLink(
        "2026-10-12 10:04:31 DEJA02220240050 0000311 https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=ABC",
      ),
    ).toBe(
      "2026-10-12 10:04:31 DEJA02220240050 0000311 https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=ABC",
    );
  });

  it("keeps a clean https verification link", () => {
    expect(sanitizeKraSignatureLink("https://etims.example/verify/1")).toBe(
      "https://etims.example/verify/1",
    );
  });

  it("draws a QR from a receipt signature when signature_link is empty", async () => {
    const payload =
      "úb26-10-08 11:27 DEJA02220240050 0000314 https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=P052177271G00OPG3THZSANEFZJDR_test";
    const kra = extractKraReceiptData({
      kra_response: {
        status: "success",
        invoice_number: "1791447390",
        serial_number: "DEJA02220240050",
        receipt_signature: payload,
        signature_link: null,
        kra_timestamp: "2026-10-08 11:26:31",
      },
    });
    expect(kra?.signatureLink).toBe(
      "2026-10-08 11:27 DEJA02220240050 0000314 https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=P052177271G00OPG3THZSANEFZJDR_test",
    );
    expect(kra?.receiptSignature).toBeNull();

    const { kraData, kraQrDataUrl } = await ensureKraQrForPrint(
      { kra_response: { status: "success", receipt_signature: payload, invoice_number: "1791447390" } },
      { allowNetwork: false },
    );
    expect(kraQrDataUrl).toMatch(/^data:image\/png;base64,/);
    const html = buildKraThermalQrHtml(kraData, null);
    expect(html).toContain("<svg");
    expect(html).toContain('class="kra-etims-qr"');
    expect(html).not.toContain("úb26-10-08");
    expect(html).not.toContain("indexEtimsReceiptData");
  });

  it("builds a QR image from a junk-prefixed eTIMS payload", async () => {
    const dataUrl = await kraReceiptQrDataUrl(
      "úb26-10-08 10:04 DEJA02220240050 0000311 https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=ABC_test",
    );
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("extracts signature link from nested response_payload aliases", () => {
    const kra = extractKraReceiptData({
      kra_response: {
        status: "success",
        invoice_number: "CU-1b",
        response_payload: {
          data: {
            QRCode: "https://etims.example/verify/nested",
          },
        },
      },
    });
    expect(kra?.signatureLink).toBe("https://etims.example/verify/nested");
  });

  it("extracts signature link from response_payload aliases", () => {
    const kra = extractKraReceiptData({
      kra_response: {
        status: "success",
        invoice_number: "CU-1",
        response_payload: {
          "Signature Link": "https://etims.example/verify/1",
        },
      },
    });
    expect(kra?.signatureLink).toBe("https://etims.example/verify/1");
    expect(kra?.invoiceNumber).toBe("CU-1");
  });

  it("extracts buyer PIN from KRA request payload", () => {
    const kra = extractKraReceiptData({
      kra_response: {
        status: "success",
        invoice_number: "CU-2",
        signature_link: "https://etims.example/verify/2",
        request_payload: {
          sign_structure: { pinOfBuyer: "P052177271G" },
        },
      },
    });
    expect(kra?.buyerPin).toBe("P052177271G");
  });

  it("prints customer KRA PIN after the thermal QR", () => {
    const kraData = {
      signatureLink: "https://etims.example/verify/3",
      invoiceNumber: "CU-3",
      buyerPin: "P051234567X",
    };
    const html = buildKraThermalQrHtml(kraData, "data:image/png;base64,abc", {
      buyerPin: "P051234567X",
    });
    expect(html).toContain("<svg");
    expect(html).toContain("Customer KRA PIN: P051234567X");
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("Customer KRA PIN"));
    expect(html).not.toContain("https://etims.example/verify/3");
  });

  it("falls back to CU invoice after QR when buyer PIN is missing", () => {
    const html = buildKraThermalQrHtml(
      { signatureLink: "https://etims.example/verify/4", invoiceNumber: "CU-4" },
      "data:image/png;base64,abc",
    );
    expect(html).toContain("CU Invoice: CU-4");
    expect(html).not.toContain("Customer KRA PIN");
    expect(html).toContain("overflow:visible");
    expect(html).toContain("width:100px;height:100px;max-width:none");
    expect(html).toContain("<svg");
    expect(html).not.toContain("https://etims.example/verify/4");
    expect(html).not.toMatch(/kra-etims-block[^>]*overflow:hidden/);
  });

  it("requires a QR data URL when KRA fiscalization is active", async () => {
    const sale = {
      id: 9,
      status: "completed",
      order_total: 100,
      kra_response: {
        status: "success",
        invoice_number: "CU-9",
        signature_link: "https://etims.example/verify/9",
      },
    };

    const { kraData, kraQrDataUrl } = await ensureKraQrForPrint(sale, {
      moduleSettings: {
        finance: {
          enable_kra_integration: true,
          enable_kra_device: true,
          default_submit_kra: true,
        },
      },
      allowNetwork: false,
      qrSize: 80,
    });

    expect(kraData?.signatureLink).toContain("etims.example");
    expect(kraQrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(buildKraThermalQrHtml(kraData, null)).toContain("<svg");
  });

  it("prints without QR when KRA is enabled but the sale was not fiscalized", async () => {
    const result = await ensureKraQrForPrint(
      { id: 3, status: "completed", order_total: 50 },
      {
        moduleSettings: {
          finance: {
            enable_kra_integration: true,
            enable_kra_device: true,
            default_submit_kra: true,
          },
        },
        allowNetwork: false,
      },
    );

    expect(result.kraQrDataUrl).toBeNull();
    expect(result.kraData).toBeNull();
  });

  it("never contacts the API when KRA device is not configured", async () => {
    const result = await ensureKraQrForPrint(
      {
        id: 11,
        status: "completed",
        order_total: 80,
        kra_response: {
          status: "success",
          signature_link: "https://etims.example/verify/11",
        },
      },
      {
        moduleSettings: {
          finance: {
            enable_kra_integration: false,
            enable_kra_device: false,
          },
        },
        allowNetwork: true,
      },
    );

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.kraData?.signatureLink).toContain("etims.example");
    expect(result.kraQrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("prints CU details without QR when fiscalized but the eTIMS link is missing", async () => {
    const result = await ensureKraQrForPrint(
      {
        id: 5,
        status: "completed",
        order_total: 50,
        kra_response: { status: "success", invoice_number: "CU-5" },
      },
      {
        moduleSettings: {
          finance: {
            enable_kra_integration: true,
            enable_kra_device: true,
            default_submit_kra: true,
          },
        },
        allowNetwork: false,
      },
    );

    expect(result.kraQrDataUrl).toBeNull();
    expect(result.kraData?.invoiceNumber).toBe("CU-5");
    expect(result.kraData?.signatureLink).toBeFalsy();
  });

  it("prints without QR immediately when KRA soft-failed", async () => {
    const result = await ensureKraQrForPrint(
      {
        id: 7,
        status: "completed",
        order_total: 50,
        kra_response: {
          status: "failed",
          error_message: "Device timeout",
          invoice_number: null,
        },
      },
      {
        moduleSettings: {
          finance: {
            enable_kra_integration: true,
            enable_kra_device: true,
            default_submit_kra: true,
          },
        },
        allowNetwork: true,
      },
    );

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.kraQrDataUrl).toBeNull();
    expect(result.kraData).toBeNull();
  });

  it("looks up kra_response from the sale when missing inline", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      id: 4,
      kra_response: {
        status: "success",
        signature_link: "https://etims.example/verify/4",
        invoice_number: "CU-4",
      },
    });

    const { kraQrDataUrl } = await ensureKraQrForPrint(
      { id: 4, status: "completed", order_total: 20 },
      {
        moduleSettings: {
          finance: {
            enable_kra_integration: true,
            enable_kra_device: true,
            default_submit_kra: true,
          },
        },
        allowNetwork: true,
      },
    );

    expect(apiRequest).toHaveBeenCalledWith(
      "/sales/4",
      expect.objectContaining({ loading: false }),
    );
    expect(kraQrDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
