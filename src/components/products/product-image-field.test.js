import { describe, expect, it } from "vitest";
import {
  isHttpImageUrl,
  isImportableImageUrl,
  isProductImageFileApiUrl,
  resolveProductImageUrlForEditor,
} from "@/components/products/product-image-field";

describe("isHttpImageUrl", () => {
  it("accepts public http(s) links", () => {
    expect(isHttpImageUrl("https://cdn.example.com/cola.jpg")).toBe(true);
    expect(isHttpImageUrl(" http://images.example.com/a.png ")).toBe(true);
  });

  it("rejects empty, relative, and non-http values", () => {
    expect(isHttpImageUrl("")).toBe(false);
    expect(isHttpImageUrl("/products/x/image/file")).toBe(false);
    expect(isHttpImageUrl("ftp://cdn.example.com/a.jpg")).toBe(false);
    expect(isHttpImageUrl("not a url")).toBe(false);
  });
});

describe("isProductImageFileApiUrl / isImportableImageUrl", () => {
  it("treats authenticated catalogue file URLs as non-importable", () => {
    const api =
      "http://localhost:8000/api/v1/products/2234431/image/file?v=e3e9803cb9ac402c";
    expect(isProductImageFileApiUrl(api)).toBe(true);
    expect(isImportableImageUrl(api)).toBe(false);
  });

  it("allows public CDN links for import", () => {
    expect(isImportableImageUrl("https://cdn.example.com/cola.jpg")).toBe(true);
  });
});

describe("resolveProductImageUrlForEditor", () => {
  it("returns a public remote source when image_path is a web URL", () => {
    expect(
      resolveProductImageUrlForEditor({
        image_path: "https://cdn.example.com/photo.jpg",
        image_url: "http://localhost:8000/api/v1/products/1/image/file?v=1",
      }),
    ).toBe("https://cdn.example.com/photo.jpg");
  });

  it("does not put the local /image/file serve URL into Image URL", () => {
    expect(
      resolveProductImageUrlForEditor({
        image_path: "orgs/DEMO/products/2234431/a.jpg",
        image_url:
          "http://localhost:8000/api/v1/products/2234431/image/file?v=e3e9803cb9ac402c",
      }),
    ).toBe("");
  });

  it("prefers an explicit remote source field when present", () => {
    expect(
      resolveProductImageUrlForEditor({
        image_path: "orgs/DEMO/products/1/a.jpg",
        image_url: "http://localhost:8000/api/v1/products/1/image/file?v=1",
        image_source_url: "https://images.example.com/menu.png",
      }),
    ).toBe("https://images.example.com/menu.png");
  });
});
