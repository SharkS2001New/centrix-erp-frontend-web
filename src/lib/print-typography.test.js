import { describe, expect, it } from "vitest";
import { buildSaleInvoiceHtml } from "@/components/sales/sale-invoice-print";
import { buildSaleReceiptHtml } from "@/components/sales/sale-receipt-print";
import { buildHospitalityCheckReceiptHtml } from "@/components/hospitality/hospitality-check-receipt-print";
import { buildLpoPrintHtml } from "@/components/lpo/lpo-print-html";
import { serializeFooterLines } from "@/lib/footer-line-format";
import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
} from "@/lib/print-typography";
import { resolveOrgPrintFontSettings } from "@/lib/print-font-settings";
import {
  THERMAL_CONTENT_WIDTH_MM,
  THERMAL_PAPER_WIDTH_MM,
} from "@/lib/thermal-receipt-layout";

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
    expect(html).toContain("Invoice Receipt");
    expect(html).not.toContain("Terms and Conditions");
  });

  it("embeds editable terms on proforma A4 HTML only", () => {
    const general = generalWithFonts();
    const html = buildSaleInvoiceHtml(sampleSale, {
      generalSettings: general,
      documentType: "proforma",
      seller: { name: "Test Org" },
      branding: { showHeader: true, display: "name", organizationName: "Test Org" },
      salesSettings: {
        show_proforma_terms: true,
        proforma_print_terms: "Custom proforma term one\nCustom proforma term two",
      },
    });

    expect(html).toContain("PROFORMA INVOICE");
    expect(html).toContain("Terms and Conditions");
    expect(html).toContain("Custom proforma term one");
    expect(html).toContain("Prepared By");
  });

  it("uses admin printout settings for A4 invoice fonts", () => {
    const general = mergeGeneralSettings({
      general: {
        print_font_invoice_family: "arial",
        print_font_invoice_scale: "custom",
        print_font_invoice_size_px: 10,
        print_font_invoice_weight: "bold",
      },
    });
    const printPx = createOrgPrintPx(general, "sale_invoice");

    expect(resolveOrgPrintFontSettings(general, "sale_invoice")).toMatchObject({
      family: "arial",
      scale: "custom",
      size_px: 10,
      weight: "bold",
    });
    expect(printPx.body(12)).toContain("px");
    expect(orgPrintFontFamilyFromSettings(general, "sale_invoice")).toContain("Arial");
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

  it("floors hotel check body size to Large Arial so restaurant thermals match readable retail receipts", () => {
    const html = buildHospitalityCheckReceiptHtml(
      {
        check_number: "HTL-1",
        status: "paid",
        lines: [{ description: "Tea", qty: 1, unit_price: 100, line_total: 100 }],
        total: 100,
      },
      {
        generalSettings: {
          print_font_hospitality_check_family: "arial",
          print_font_hospitality_check_scale: "standard",
        },
        seller: { name: "Test Org" },
      },
    );
    const expected = createOrgPrintPx(
      {
        print_font_hospitality_check_family: "arial",
        print_font_hospitality_check_scale: "large",
      },
      "thermal_check",
    );

    expect(html).toContain("Arial");
    expect(html).toContain(`font-size: ${expected.body(10)}`);
    expect(html).toContain(`font-size: ${expected.body(11)}`);
  });

  it("applies hotel check font settings independently of thermal receipts", () => {
    const general = generalWithFonts({
      print_font_hospitality_check_family: "georgia",
      print_font_hospitality_check_scale: "compact",
    });
    const html = buildHospitalityCheckReceiptHtml(
      {
        check_number: "HTL-1",
        status: "paid",
        lines: [{ description: "Tea", qty: 1, unit_price: 100, line_total: 100 }],
        total: 100,
      },
      { generalSettings: general, seller: { name: "Test Org" } },
    );

    expect(html).toContain("Georgia");
    expect(html).toContain(`font-size: ${createOrgPrintPx(general, "thermal_check").body(10)}`);
    expect(html).not.toContain("Courier");
  });

  it("falls back to thermal receipt fonts when hotel check fonts are not set", () => {
    const general = {
      print_font_receipt_family: "courier",
      print_font_receipt_scale: "large",
    };
    const html = buildHospitalityCheckReceiptHtml(
      {
        check_number: "HTL-1",
        status: "paid",
        lines: [{ description: "Tea", qty: 1, unit_price: 100, line_total: 100 }],
        total: 100,
      },
      { generalSettings: general, seller: { name: "Test Org" } },
    );

    expect(html).toContain("Courier");
    expect(resolveOrgPrintFontSettings(general, "thermal_check")).toMatchObject({
      family: "courier",
      scale: "large",
      settingKey: "hospitality_check",
    });
  });

  it("uses dotted separators instead of solid lines before totals and under column headers", () => {
    const html = buildSaleReceiptHtml(sampleSale, {
      seller: { name: "Test Org" },
      branding: { showHeader: false, display: "name", organizationName: "Test Org" },
    });

    expect(html).not.toMatch(/\.amount-line-grand\s*\{[^}]*border-top:\s*1px solid/);
    expect(html).not.toMatch(/min-width:\s*4\.5rem/);
    expect(html).toContain('class="summary-table"');
    expect(html).not.toMatch(/\.table thead th\s*\{[^}]*border-bottom:\s*1px solid/);
    expect(html).toContain(".divider { border-top: 1px dashed #000;");
    expect(html).toContain(".table tbody tr { border-top: 1px dashed #000; }");
  });

  it("uses compact thermal table columns and wraps sale number in meta grid", () => {
    const html = buildSaleReceiptHtml(
      {
        ...sampleSale,
        order_num: 1001,
        order_total: 12820,
        cash: 5000,
        mpesa_amount: 7820,
      },
      {
        seller: { name: "Test Org" },
        branding: { showHeader: false, display: "name", organizationName: "Test Org" },
      },
    );

    expect(html).toContain("<colgroup>");
    expect(html).toContain('col class="col-amount"');
    expect(html).toContain(">AMOUNT</th>");
    expect(html).toContain('<div class="meta-full"><span class="meta-label">Till No:</span>');
    expect(html).toContain('<div class="meta-full"><span class="meta-label">Order #:</span>');
    expect(html).toContain("S1001");
    expect(html).not.toContain("Cash Sales #:");
    expect(html).toContain(`width: ${THERMAL_CONTENT_WIDTH_MM}mm`);
    expect(html).toContain("text-align: right");
    expect(html).not.toContain("max-width: 0");
    expect(html).toContain("font-variant-numeric: tabular-nums");
    expect(html).toContain('<td class="amount-label">Total</td>');
    expect(html).toContain('<td class="amount-label">Cash</td>');
  });

  it("prints POS thermal receipts with Cash Sales # only (no S00xx Order # line)", () => {
    const html = buildSaleReceiptHtml(
      {
        ...sampleSale,
        order_num: 33,
        pos_order_num: 4,
        channel: "pos",
        order_source: "pos",
      },
      {
        seller: { name: "Test Org" },
        branding: { showHeader: false, display: "name", organizationName: "Test Org" },
      },
    );

    expect(html).toContain('<div class="meta-full"><span class="meta-label">Cash Sales #:</span> 4</div>');
    expect(html).not.toContain("Order #:");
    expect(html).not.toContain("S0033");
  });

  it("prints KRA eTIMS QR below Designed & Developed on thermal receipts", () => {
    const html = buildSaleReceiptHtml(sampleSale, {
      seller: { name: "Test Org" },
      branding: { showHeader: false, display: "name", organizationName: "Test Org" },
      kraData: {
        signatureLink: "https://etims.example/verify/abc",
        invoiceNumber: "CU-1",
      },
      kraQrDataUrl: "data:image/png;base64,aaa",
    });

    const bodyHtml = html.split("</head>")[1] ?? html;
    const designedAt = Math.max(
      bodyHtml.indexOf("Designed &amp; Developed By"),
      bodyHtml.indexOf("Designed & Developed By"),
    );
    const qrAt = bodyHtml.indexOf('class="kra-etims-block"');
    expect(designedAt).toBeGreaterThan(-1);
    expect(qrAt).toBeGreaterThan(designedAt);
    expect(bodyHtml).toContain("Scan to verify this invoice on KRA eTIMS platform");
    expect(bodyHtml).toContain('class="receipt-tearoff"');
    expect(bodyHtml.indexOf('class="receipt-tearoff"')).toBeGreaterThan(qrAt);
  });

  it("preserves footer line casing on thermal receipts", () => {
    const footerText = serializeFooterLines(
      [
        {
          text: "You were served by: {username}",
          align: "left",
          bold: false,
          italic: false,
          size: "md",
        },
        {
          text: "Thankyou for shopping with us",
          align: "left",
          bold: false,
          italic: false,
          size: "md",
        },
      ],
      { forEditor: true },
    );

    const html = buildSaleReceiptHtml(
      { ...sampleSale, cashier_name: "Preview cashier" },
      {
        seller: { name: "Test Org" },
        branding: { showHeader: false, display: "name", organizationName: "Test Org" },
        documentFooterText: footerText,
        preparedBy: "Preview cashier",
      },
    );

    expect(html).toContain("You were served by: Preview cashier");
    expect(html).toContain("Thankyou for shopping with us");
    expect(html).not.toContain("YOU WERE SERVED BY");
    expect(html).not.toContain("THANKYOU FOR SHOPPING WITH US");
    expect(html).toMatch(/\.footer-text\s*\{[^}]*text-transform:\s*none/);
    expect(html).not.toMatch(/\.footer-text\s*\{[^}]*text-transform:\s*uppercase/);
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
    expect(html).not.toContain("Our PIN");
  });
});
