import { describe, expect, it } from "vitest";
import { resolvePrintoutSections } from "@/lib/printouts-settings";

describe("resolvePrintoutSections", () => {
  it("limits small shop (sales only) to sales docs", () => {
    const sections = resolvePrintoutSections({
      modules: { sales: true },
      module_settings: { sales: { enable_mobile_orders: false } },
      mobile_orders_enabled: false,
    });
    expect(sections.hasRoutePrintouts).toBe(false);
    expect(sections.availableKinds).toEqual(["receipt", "invoice"]);
  });

  it("adds route printouts when distribution is enabled", () => {
    const sections = resolvePrintoutSections({
      modules: { sales: true, distribution: true },
      module_settings: { sales: { enable_mobile_orders: false } },
    });
    expect(sections.hasRoutePrintouts).toBe(true);
    expect(sections.availableKinds).toContain("loading_sheet");
    expect(sections.availableKinds).toContain("picking_list");
    expect(sections.availableKinds).toContain("trip_chart");
  });

  it("adds route printouts when mobile orders are enabled without distribution", () => {
    const sections = resolvePrintoutSections({
      modules: { sales: true, "sales.mobile": true },
      module_settings: { sales: { enable_mobile_orders: true } },
      mobile_orders_enabled: true,
    });
    expect(sections.hasMobileSales).toBe(true);
    expect(sections.hasRoutePrintouts).toBe(true);
    expect(sections.availableKinds).toEqual([
      "receipt",
      "invoice",
      "loading_sheet",
      "picking_list",
      "trip_chart",
    ]);
  });
});
