import { describe, expect, it } from "vitest";
import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { isSidebarFeatureEnabled } from "@/lib/nav-feature-gates";
import {
  normalizeSidebarFeatures,
  SIDEBAR_FEATURE_CATALOG,
} from "@/lib/sidebar-features";

describe("sidebar feature limits", () => {
  it("leaves sidebar links unchanged unless a setup type enables limits", () => {
    expect(
      isSidebarFeatureEnabled(
        { module_settings: { sales: { sidebar_features: { "/products": false } } } },
        "/products",
      ),
    ).toBe(true);
  });

  it("hides unselected links and allows organization-specific grants", () => {
    const capabilities = {
      module_settings: {
        sales: {
          limit_sidebar_features: true,
          sidebar_features: { "/products": false, "/categories": true },
          sidebar_feature_overrides: { "/products": true },
        },
      },
    };

    expect(isSidebarFeatureEnabled(capabilities, "/products")).toBe(true);
    expect(isSidebarFeatureEnabled(capabilities, "/categories")).toBe(true);
    expect(isSidebarFeatureEnabled(capabilities, "/unconfigured-feature")).toBe(false);
  });

  it("uses the feature limit when deciding whether a sidebar link is visible", () => {
    const item = navSections
      .find((section) => section.id === "products")
      .items.find((navItem) => navItem.href === "/products");
    const context = {
      capabilities: {
        module_settings: {
          sales: {
            limit_sidebar_features: true,
            sidebar_features: { "/products": false },
          },
        },
      },
      hasPermission: () => true,
      hasNavPermission: () => true,
      isModuleEnabled: () => true,
      isSuperAdmin: () => false,
      user: {},
      organization: {},
    };

    expect(isNavItemVisible(item, context)).toBe(false);
    expect(
      isNavItemVisible(item, {
        ...context,
        capabilities: {
          module_settings: {
            sales: {
              ...context.capabilities.module_settings.sales,
              sidebar_feature_overrides: { "/products": true },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("provides a default-on entry for each configured sidebar link", () => {
    const features = normalizeSidebarFeatures(null);

    expect(SIDEBAR_FEATURE_CATALOG.some((feature) => feature.key === "/products")).toBe(true);
    expect(features["/products"]).toBe(true);
    expect(normalizeSidebarFeatures(null, false)["/products"]).toBe(false);
  });
});
