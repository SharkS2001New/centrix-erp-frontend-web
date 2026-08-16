import { describe, expect, it, vi } from "vitest";
import { printHospitalityCheckReceipt, resolveGuestCheckTitle } from "./hospitality-check-receipt-print";

vi.mock("@/lib/print-dispatch", () => ({
  dispatchPrintJob: vi.fn(async () => ({ mode: "agent", ok: true, printer: "Star TSP143" })),
}));

import { dispatchPrintJob } from "@/lib/print-dispatch";

describe("resolveGuestCheckTitle", () => {
  it("prints VOID ORDER for a voided check even if the caller passed an unpaid title", () => {
    expect(resolveGuestCheckTitle("Unpaid order", { status: "void" }, "void")).toBe("VOID ORDER");
  });

  it("prints VOID ORDER for a voided paid receipt reprint", () => {
    expect(resolveGuestCheckTitle("Paid receipt", { status: "void" }, "void")).toBe("VOID ORDER");
  });
});

describe("printHospitalityCheckReceipt", () => {
  it("sends the check through Centrix Print Agent dispatch (silent when agent is on)", async () => {
    vi.stubGlobal("window", {});
    const check = {
      id: 12,
      check_number: "HTL-9",
      status: "paid",
      lines: [{ description: "Soda", qty: 1, unit_price: 150, line_total: 150 }],
      total: 150,
    };

    const result = await printHospitalityCheckReceipt(check, {
      title: "Paid receipt",
      printSettings: { check_receipt_copies: 1 },
    });

    expect(dispatchPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "receipt",
        documentId: 12,
        copies: 1,
      }),
    );
    expect(result).toMatchObject({ mode: "agent", ok: true });
  });
});
