import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_TEMPLATE_ID,
  ORG_DOCUMENT_DESIGN_TEMPLATES,
  orgDocumentTemplateCss,
  resolveOrgDocumentTemplateId,
} from "@/lib/document-print-templates";
import { professionalA4Styles } from "@/lib/professional-a4-print";

describe("org document print templates", () => {
  it("defaults unknown ids to default", () => {
    expect(resolveOrgDocumentTemplateId(null)).toBe(DEFAULT_DOCUMENT_TEMPLATE_ID);
    expect(resolveOrgDocumentTemplateId("nope")).toBe(DEFAULT_DOCUMENT_TEMPLATE_ID);
    expect(resolveOrgDocumentTemplateId("modern")).toBe("modern");
  });

  it("emits no theme css for default layout", () => {
    expect(orgDocumentTemplateCss("default")).toBe("");
    expect(professionalA4Styles(null, "sale_invoice", "default")).not.toContain(
      "Org document theme",
    );
  });

  it("applies accent theme css for professional templates", () => {
    const css = orgDocumentTemplateCss("modern", { layout: "professional" });
    expect(css).toContain("#2563eb");
    expect(css).toContain("table.pro-items");

    const classic = orgDocumentTemplateCss("corporate", { layout: "classic" });
    expect(classic).toContain("table.items");
    expect(classic).toContain("#0f172a");
  });

  it("emits thermal-safe overlay css", () => {
    const css = orgDocumentTemplateCss("modern", { layout: "thermal" });
    expect(css).toContain("#2563eb");
    expect(css).toContain(".receipt");
    expect(css).not.toContain("table.pro-items");
  });

  it("includes theme overlay in professional styles when selected", () => {
    const css = professionalA4Styles(null, "lpo", "safari");
    expect(css).toContain("Org document theme: safari");
    expect(css).toContain("#92400e");
  });

  it("catalog includes Default plus professional themes", () => {
    expect(ORG_DOCUMENT_DESIGN_TEMPLATES[0].id).toBe("default");
    expect(ORG_DOCUMENT_DESIGN_TEMPLATES.length).toBeGreaterThan(10);
  });
});
