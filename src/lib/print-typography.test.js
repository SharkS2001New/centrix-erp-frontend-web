import { describe, expect, it } from "vitest";
import { buildSaleInvoiceHtml } from "@/components/sales/sale-invoice-print";
import { buildSaleReceiptHtml } from "@/components/sales/sale-receipt-print";
import { buildLpoPrintHtml } from "@/components/lpo/lpo-print-html";
import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
} from "@/lib/print-typography";
import { resolveOrgPrintFontSettings } from "@/lib/print-font-settings";

const sampleSale = {
  id: 1,
  order_num: 1001,
  order_total: 1160,
  total_vat: 160,
  created_at: "2026-07-01T10:00:00Z",
  items: [
    {
      product_code: "P1",
      product_name: "Sample product",
      quantity: 1,
      unit_price: 1000,
      line_total: 1000,
    },
  ],
};

function generalWithFonts(overrides = {}) {
  return mergeGeneralSettings({
    general: {
      print_font_invoice_family: "arial",
      print_font_invoice_scale: "extra_large",
      print_font_invoice_weight: "bold",
      print_font_receipt_family: "courier",
      print_font_receipt_scale: "large",
      print_font_lpo_family: "georgia",
      print_font_lpo_scale: "compact",
      ...overrides,
    },
  });
}

describe("org print typography settings", () => {
  it("resolves per-document font family and scale from general settings", () => {
    const general = generalWithFonts();

    expect(resolveOrgPrintFontSettings(general, "sale_invoice")).toMatchObject({
      family: "arial",
      scale: "extra_large",
      weight: "bold",
    });
    expect(resolveOrgPrintFontSettings(general, "thermal")).toMatchObject({
      family: "courier",
      scale: "large",
    });
    expect(resolveOrgPrintFontSettings(general, "lpo")).toMatchObject({
      family: "georgia",
      scale: "compact",
    });

    expect(orgPrintFontFamilyFromSettings(general, "sale_invoice")).toContain("Arial");
    expect(orgPrintFontFamilyFromSettings(general, "thermal")).toContain("Courier");
  });

  it("scales invoice body font sizes when org scale is extra large", () => {
    const scaled = createOrgPrintPx(generalWithFonts(), "sale_invoice");
    const standard = createOrgPrintPx(mergeGeneralSettings({ general: {} }), "sale_invoice");

    expect(scaled.body(12)).not.toBe(standard.body(12));
    expect(Number.parseFloat(scaled.body(12))).toBeGreaterThan(Number.parseFloat(standard.body(12)));
  });

  it("embeds org invoice font family and scaled sizes in A4 invoice HTML", () => {
    const general = generalWithFonts();
    const html = buildSaleInvoiceHtml(sampleSale, {
      generalSettings: general,
      seller: { name: "Test Org" },
      branding: { showHeader: true, display: "name", organizationName: "Test Org" },
    });

    expect(html).toContain("Arial");
    expect(html).toContain(`font-size: ${createOrgPrintPx(general, "sale_invoice").body(12)}`);
    expect(html).toContain(`font-size: ${createOrgPrintPx(general, "sale_invoice").header(24)}`);
  });

  it("embeds org receipt font family and scaled sizes in thermal receipt HTML", () => {
    const general = generalWithFonts();
    const html = buildSaleReceiptHtml(sampleSale, {
      generalSettings: general,
      seller: { name: "Test Org" },
      branding: { showHeader: true, display: "name", organizationName: "Test Org" },
    });

    expect(html).toContain("Courier");
    expect(html).toContain(`font-size: ${createOrgPrintPx(general, "thermal").body(10)}`);
    expect(html).not.toContain('style="font-size:14px;font-weight:700');
  });

  it("embeds org LPO font family from printout settings", () => {
    const general = generalWithFonts();
    const html = buildLpoPrintHtml({
      lpo: {
        lpo_no: 1,
        order_date: "2026-07-01",
        due_date: "2026-07-15",
        delivery_address: "Nairobi warehouse",
        supplier_name: "Supplier Co",
      },
      lines: [],
      generalSettings: general,
      organization: { org_name: "Test Org" },
    });

    expect(html).toContain("Georgia");
    expect(html).toContain(`font-size: ${createOrgPrintPx(general, "lpo").body(11)}`);
  });
});
