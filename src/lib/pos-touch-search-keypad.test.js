import { describe, expect, it } from "vitest";
import { isPosTouchSearchKeypadEnabled } from "@/lib/pos-touch-search-keypad";

describe("isPosTouchSearchKeypadEnabled", () => {
  it("is off by default", () => {
    expect(isPosTouchSearchKeypadEnabled(null)).toBe(false);
    expect(isPosTouchSearchKeypadEnabled({})).toBe(false);
  });

  it("reads sales module settings from capabilities", () => {
    expect(
      isPosTouchSearchKeypadEnabled({
        module_settings: { sales: { pos_touch_search_keypad: true } },
      }),
    ).toBe(true);
    expect(
      isPosTouchSearchKeypadEnabled({
        module_settings: { sales: { pos_touch_search_keypad: false } },
      }),
    ).toBe(false);
  });
});
