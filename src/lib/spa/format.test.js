import { describe, expect, it } from "vitest";
import { businessLabel, featuresFor, ksh, resolveSpaFeatures, stockStatus } from "@/lib/spa/format";
import { isPublicImageUrl, serviceImageSrc, servicePhoto } from "@/lib/spa/image";

describe("spa format", () => {
  it("formats Kenyan shillings", () => {
    expect(ksh(28450)).toBe("KSh 28,450");
  });

  it("turns spa tools on without duplicating the shop", () => {
    expect(featuresFor("spa").rooms).toBe(true);
    expect(featuresFor("spa").chairs).toBe(false);
    expect(featuresFor("kinyozi").combos).toBe(true);
    expect(featuresFor("combined").packages).toBe(true);
    expect(businessLabel("combined")).toBe("Centrix SPA & Kinyozi");
    expect(resolveSpaFeatures("spa", { chairs: true }).chairs).toBe(true);
    expect(resolveSpaFeatures("kinyozi", { combos: false }).combos).toBe(false);
  });

  it("marks low stock at the reorder level", () => {
    expect(stockStatus({ qty: 6, reorder: 8 })).toBe("Low stock");
    expect(stockStatus({ qty: 0, reorder: 8 })).toBe("Out of stock");
  });

  it("keeps only a photo data url on a service", () => {
    expect(servicePhoto("data:image/jpeg;base64,abc")).toBe("data:image/jpeg;base64,abc");
    expect(servicePhoto("https://example.com/cut.jpg")).toBe("");
    expect(servicePhoto("")).toBe("");
    expect(isPublicImageUrl("https://cdn.example.com/cut.jpg")).toBe(true);
    expect(isPublicImageUrl("notaurl")).toBe(false);
    expect(serviceImageSrc({ imageUrl: "https://cdn.example.com/cut.jpg" })).toBe("https://cdn.example.com/cut.jpg");
    expect(serviceImageSrc({ image: "data:image/jpeg;base64,abc", imageUrl: "https://cdn.example.com/cut.jpg" })).toBe("data:image/jpeg;base64,abc");
  });
});
