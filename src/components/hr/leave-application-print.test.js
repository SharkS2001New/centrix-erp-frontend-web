import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/print-dispatch", () => ({
  printHtmlDocument: vi.fn(async (html) => html),
}));

vi.mock("@/lib/reports/report-branding", () => ({
  resolveReportBranding: () => ({ orgName: "Demo Org", logoUrl: null }),
  buildReportOrgHeaderHtml: () => `<div class="org-header"><div class="org-name">Demo Org</div></div>`,
}));

import { printHtmlDocument } from "@/lib/print-dispatch";
import { printLeaveApplication } from "@/components/hr/leave-application-print";

describe("printLeaveApplication", () => {
  it("keeps the print footer inside the sheet so it stays on page 1", async () => {
    const html = await printLeaveApplication({
      leave: {
        id: 17,
        approval_status: "approved",
        start_date: "2026-09-10",
        end_date: "2026-09-11",
        total_days: 2,
        total_hours: 18,
        deduct_from: "annual",
        notes: "personal",
      },
      employee: { first_name: "Purity", last_name: "Muronyi", employee_code: "E2" },
      organization: { name: "Demo Org" },
      printedByUser: { full_name: "HR Admin" },
    });

    expect(html).toContain("leave-application");
    expect(html).toContain('class="sheet"');
    expect(html).toContain('class="sheet-body"');
    expect(html).toMatch(/\.sheet[\s\S]*doc-print-edge-footer/);
    expect(html).toMatch(
      /body\.leave-application[\s\S]*\.doc-print-edge-footer[\s\S]*position:\s*static\s*!important/,
    );
    expect(html).toContain("size: 210mm 297mm");
    expect(html).toContain("LV-17");
    expect(printHtmlDocument).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ jobType: "leave_application", documentId: 17 }),
    );
  });

  it("prints hourly duration as hours", async () => {
    const html = await printLeaveApplication({
      leave: {
        id: 18,
        approval_status: "pending",
        start_date: "2026-09-11",
        end_date: "2026-09-11",
        duration_type: "hourly",
        total_days: 0.13,
        total_hours: 1,
        deduct_from: "annual",
        notes: "clinic",
      },
      employee: { first_name: "Purity", last_name: "Muronyi", employee_code: "E2" },
      organization: { name: "Demo Org" },
      printedByUser: { full_name: "HR Admin" },
    });

    expect(html).toContain("1 hour");
  });
});
