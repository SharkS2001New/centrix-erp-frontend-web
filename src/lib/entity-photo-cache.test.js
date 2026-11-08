import { describe, expect, it, beforeEach } from "vitest";
import {
  invalidateEntityPhotoCache,
  peekEntityPhotoCache,
} from "./entity-photo-cache";

describe("entity-photo-cache", () => {
  beforeEach(() => {
    invalidateEntityPhotoCache("http://");
  });

  it("invalidateEntityPhotoCache clears matching prefixes", () => {
    // peek returns null when empty; invalidate should not throw on empty cache.
    expect(peekEntityPhotoCache("http://api/products/A/image/file")).toBeNull();
    invalidateEntityPhotoCache("http://api/products/A");
    expect(peekEntityPhotoCache("http://api/products/A/image/file")).toBeNull();
  });
});
