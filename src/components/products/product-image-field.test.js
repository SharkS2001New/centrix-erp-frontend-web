import { describe, expect, it } from "vitest";
import { isHttpImageUrl } from "@/components/products/product-image-field";

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
