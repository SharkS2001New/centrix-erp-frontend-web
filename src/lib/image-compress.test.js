import { describe, expect, it } from "vitest";
import {
  IMAGE_COMPRESS_PRESETS,
  compressPresetForUpload,
} from "./image-compress";

describe("compressPresetForUpload", () => {
  it("picks logo for organization logo paths", () => {
    expect(compressPresetForUpload("/organizations/1/logo", "image")).toBe("logo");
  });

  it("picks document for attachments and proofs", () => {
    expect(compressPresetForUpload("/lpo-attachments", "file")).toBe("document");
    expect(compressPresetForUpload("/employees/1/documents", "file")).toBe("document");
    expect(compressPresetForUpload("", "signature")).toBe("document");
    expect(compressPresetForUpload("/returns/proof", "proof")).toBe("document");
  });

  it("picks photo for profile and shop images", () => {
    expect(compressPresetForUpload("/employees/1/photo", "image")).toBe("photo");
    expect(compressPresetForUpload("/customers/x/shop-image", "image")).toBe("photo");
  });

  it("falls back to default", () => {
    expect(compressPresetForUpload("/misc/upload", "image")).toBe("default");
  });
});

describe("IMAGE_COMPRESS_PRESETS", () => {
  it("keeps logo smaller than photo/document", () => {
    expect(IMAGE_COMPRESS_PRESETS.logo.maxWidth).toBeLessThan(
      IMAGE_COMPRESS_PRESETS.photo.maxWidth,
    );
    expect(IMAGE_COMPRESS_PRESETS.logo.targetMaxBytes).toBeLessThan(
      IMAGE_COMPRESS_PRESETS.document.targetMaxBytes,
    );
  });
});
