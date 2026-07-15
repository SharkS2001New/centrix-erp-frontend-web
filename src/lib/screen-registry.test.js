import { describe, expect, it } from "vitest";
import {
  isRegisteredHref,
  pathnameFromTabHref,
  resolveScreen,
  SCREEN_REGISTRY,
} from "@/lib/screen-registry";

describe("screen registry (full ERP)", () => {
  it("registers a large set of workspace routes", () => {
    expect(SCREEN_REGISTRY.length).toBeGreaterThan(100);
  });

  it("resolves first-slice and dynamic screens", () => {
    expect(resolveScreen("/dashboard")?.id).toBe("dashboard");
    expect(resolveScreen("/sales/pos")?.id).toBe("sales-pos");
    expect(resolveScreen("/customers")?.id).toBe("customers");
    expect(resolveScreen("/customers/42")?.id).toBe("customers-id");
    expect(resolveScreen("/customers/42/edit")?.id).toBe("customers-id-edit");
    expect(resolveScreen("/customers/new")?.id).toBe("customers-new");
    expect(resolveScreen("/products/ABC/edit")?.id).toBe("products-code-edit");
  });

  it("does not let [id] steal static sibling routes", () => {
    expect(resolveScreen("/customers/new")?.id).toBe("customers-new");
    expect(resolveScreen("/customers/new")?.id).not.toBe("customers-id");
  });

  it("matches pathname only (ignores query)", () => {
    expect(resolveScreen("/customers?q=acme")?.id).toBe("customers");
    expect(pathnameFromTabHref("/customers?q=acme")).toBe("/customers");
  });

  it("excludes platform routes from registry expectations", () => {
    expect(isRegisteredHref("/platform/invoices")).toBe(false);
  });
});
