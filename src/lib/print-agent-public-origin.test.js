import { describe, expect, it } from "vitest";
import { resolvePrintAgentPublicOrigin } from "@/lib/print-agent-public-origin";

function makeRequest(url, headers = {}) {
  return new Request(url, { headers });
}

describe("resolvePrintAgentPublicOrigin", () => {
  it("prefers the browser origin query param over internal localhost", () => {
    const request = makeRequest(
      "http://localhost:3000/api/print-agent/bootstrap?platform=windows&origin=https%3A%2F%2Ferp.example.com",
      { host: "localhost:3000" },
    );

    expect(resolvePrintAgentPublicOrigin(request)).toBe("https://erp.example.com");
  });

  it("uses forwarded host headers when no origin param is provided", () => {
    const request = makeRequest("http://localhost:3000/api/print-agent/bootstrap", {
      host: "localhost:3000",
      "x-forwarded-host": "erp.example.com",
      "x-forwarded-proto": "https",
    });

    expect(resolvePrintAgentPublicOrigin(request)).toBe("https://erp.example.com");
  });

  it("falls back to NEXT_PUBLIC_APP_URL when headers are internal", () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://erp.example.com";

    try {
      const request = makeRequest("http://localhost:3000/api/print-agent/bootstrap", {
        host: "localhost:3000",
      });

      expect(resolvePrintAgentPublicOrigin(request)).toBe("https://erp.example.com");
    } finally {
      process.env.NEXT_PUBLIC_APP_URL = previous;
    }
  });
});
