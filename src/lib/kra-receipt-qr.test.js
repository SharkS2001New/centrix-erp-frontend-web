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

  it("still requires a QR when the sale was fiscalized but the link is missing", async () => {
    await expect(
      ensureKraQrForPrint(
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
      ),
    ).rejects.toThrow(/verification link/i);
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
