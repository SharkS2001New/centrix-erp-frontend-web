import { describe, expect, it } from "vitest";
import { organizationHasLogo, resolveReportBranding } from "@/lib/reports/report-branding";

describe("organizationHasLogo", () => {
  it("accepts has_logo from profile payload", () => {
    expect(organizationHasLogo({ id: 1, has_logo: true })).toBe(true);
    expect(organizationHasLogo({ id: 1, has_logo: false })).toBe(false);
  });

  it("accepts legacy organizations/ storage paths", () => {
    expect(
      organizationHasLogo({ id: 1, logo: "organizations/1/logo.png" }),
    ).toBe(true);
  });

  it("accepts orgs/{code}/ storage paths used by OrganizationPublicStorage", () => {
    expect(
      organizationHasLogo({ id: 1, logo: "orgs/DEMO/logo/abc.png" }),
    ).toBe(true);
  });

  it("accepts logo_file_path from profile array", () => {
    expect(
      organizationHasLogo({
        id: 1,
        logo_file_path: "/organizations/1/logo/file",
      }),
    ).toBe(true);
  });
});

describe("resolveReportBranding logo", () => {
  it("builds a logo URL when org uses orgs/ storage without has_logo", () => {
    const branding = resolveReportBranding({
      organization: { id: 9, org_name: "Demo", logo: "orgs/DEMO/logo/x.png" },
      generalSettings: {
        show_organization_on_documents: true,
        document_header_display: "logo_and_name",
      },
    });
    expect(branding.display).toBe("logo_and_name");
    expect(branding.logoUrl).toContain("/organizations/9/logo/file");
  });
});
