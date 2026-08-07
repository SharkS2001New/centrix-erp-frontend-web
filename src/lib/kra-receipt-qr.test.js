import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildKraThermalQrHtml,
  extractKraReceiptData,
  ensureKraQrForPrint,
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
    expect(html).toContain("<img");
    expect(html).toContain("Customer KRA PIN: P051234567X");
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("Customer KRA PIN"));
  });

  it("falls back to CU invoice after QR when buyer PIN is missing", () => {
    const html = buildKraThermalQrHtml(
      { signatureLink: "https://etims.example/verify/4", invoiceNumber: "CU-4" },
      "data:image/png;base64,abc",
    );
    expect(html).toContain("CU Invoice: CU-4");
    expect(html).not.toContain("Customer KRA PIN");
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
    expect(buildKraThermalQrHtml(kraData, kraQrDataUrl)).toContain("<img");
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

  it("prints without QR when fiscalized but the eTIMS link is missing", async () => {
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
