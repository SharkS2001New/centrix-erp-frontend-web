import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/print-dispatch", () => ({
  printHtmlDocument: vi.fn(async (html) => html),
}));

vi.mock("@/lib/reports/report-branding", () => ({
  resolveReportBranding: () => ({ orgName: "Demo Org", logoUrl: null }),
  buildReportOrgHeaderHtml: () => `<div class="org-header"><div class="org-name">Demo Org</div></div>`,
}));

import { printHtmlDocument } from "@/lib/print-dispatch";
import { printCashAdvanceVoucher } from "@/components/hr/cash-advance-voucher-print";

describe("printCashAdvanceVoucher", () => {
  it("keeps the print footer inside the sheet so it stays on page 1", async () => {
    const html = await printCashAdvanceVoucher({
      advance: {
        id: 42,
        amount: 5000,
        balance: 5000,
        status: "pending",
        advance_date: "2026-08-20",
        repayment_mode: "full_next_cycle",
        notes: "Emergency",
      },
      employee: { first_name: "Jane", last_name: "Doe", employee_code: "E1" },
      organization: { name: "Demo Org" },
      printedByUser: { full_name: "HR Admin" },
    });

    expect(html).toContain("cash-advance-voucher");
    expect(html).toContain('class="sheet"');
    expect(html).toContain('class="sheet-body"');
    expect(html).toMatch(/\.sheet[\s\S]*doc-print-edge-footer/);
    expect(html).toMatch(
      /body\.cash-advance-voucher[\s\S]*\.doc-print-edge-footer[\s\S]*position:\s*static\s*!important/,
    );
    expect(html).toContain("CA-42");
    expect(printHtmlDocument).toHaveBeenCalled();
  });
});
