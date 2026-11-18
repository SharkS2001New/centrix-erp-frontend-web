import { describe, expect, it } from "vitest";
import picomatch from "picomatch";

describe("picomatch repeated extglobs", () => {
  it.each([
    ["+(*)", "^(?:\\+\\(\\*\\))$"],
    ["+(*a)", "^(?:\\+\\(\\*a\\))$"],
    ["*(a*)", "^(?:\\*\\(a\\*\\))$"],
    ["+(+(a))", "^(?:\\+\\(\\+\\(a\\)\\))$"],
  ])("literalizes nested repetition in %s", (pattern, expectedRegex) => {
    expect(picomatch.makeRe(pattern).source).toBe(expectedRegex);
    expect(picomatch.isMatch(pattern, pattern)).toBe(true);
  });

  it("preserves safe repeated extglobs and stars inside character classes", () => {
    expect(picomatch.isMatch("abab", "+(ab)")).toBe(true);
    expect(picomatch.isMatch("a*a*", "+(a[*])")).toBe(true);
  });
});
