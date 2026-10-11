import { describe, expect, it } from "vitest";
import { buildDrivingFeeReceipt, buildServiceReceiptHtml, buildSpaSaleReceipt } from "@/lib/service-receipt";

describe("service receipt", () => {
  const spa = {
    branch: "Westlands",
    profile: { name: "Centrix SPA & Kinyozi", phone: "0711 000 220", email: "westlands@centrixspa.co.ke", address: "Mpaka Road", pin: "P051234567K" },
    receipt: { footer: "Karibu tena.", showPin: true },
    clients: [{ id: "c1", name: "Achieng Otieno", phone: "0712 345 678", email: "achieng@email.com" }],
  };

  it("builds an official A4 receipt instead of a retail till slip", () => {
    const model = buildSpaSaleReceipt({
      number: "S-1102",
      at: "2025-01-22T09:20:00",
      clientId: "c1",
      lines: [{ name: "Haircut", qty: 1, price: 500, kind: "service" }, { name: "Beard oil", qty: 1, price: 650, kind: "product", sku: "BO-014" }],
      discount: 0,
      tax: 0,
      total: 1150,
      payment: { method: "mpesa", reference: "RFE82K1Q", parts: [] },
    }, spa);
    const html = buildServiceReceiptHtml(model, "a4");
    expect(html).toContain("RECEIPT PAID");
    expect(html).toContain("CUSTOMER COPY");
    expect(html).toContain("Service description");
    expect(html).toContain("ACHIENG OTIENO");
    expect(html).toContain("S-1102");
    expect(html).toContain("Haircut");
    expect(html).toContain("BO-014");
    expect(html).not.toContain(">QTY<");
    expect(html).not.toContain(">ITEMS<");
  });

  it("builds a thermal driving-school fee receipt", () => {
    const model = buildDrivingFeeReceipt({
      payment: { id: 21, amount: 10000, method: "mpesa", reference: "DEMO-MPESA", received_on: "2025-01-22", outstanding: 15000 },
      invoice: { invoice_number: "DRV-1001", kind: "tuition", outstanding: 15000 },
      student: { full_name: "Mary Akinyi", phone: "0711000001", email: "mary@example.com", id_document_number: "12345678" },
      organization: { org_name: "Demo Driving School", org_address: "Ngong Road", primary_tel: "0700000000" },
    });
    const html = buildServiceReceiptHtml(model, "thermal");
    expect(html).toContain("centrix-print-thermal");
    expect(html).toContain("RECEIPT PAID");
    expect(html).toContain("MARY AKINYI");
    expect(html).toContain("RCP-21");
    expect(html).toContain("DEMO-MPESA");
    expect(html).toContain("Tuition DRV-1001");
    expect(html).toContain("Balance outstanding");
    expect(html).toContain("80mm");
  });
});
