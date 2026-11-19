import { describe, expect, it } from "vitest";
import { isPosTouchSearchKeypadEnabled } from "@/lib/pos-touch-search-keypad";

describe("isPosTouchSearchKeypadEnabled", () => {
  it("is disabled for non-hospitality organizations even when configured on", () => {
    expect(isPosTouchSearchKeypadEnabled(null)).toBe(false);
    expect(
      isPosTouchSearchKeypadEnabled({
        industry: "commerce",
        module_settings: { sales: { pos_touch_search_keypad: true } },
      }),
    ).toBe(false);
  });

  it("is enabled by default for hospitality and respects its sales setting", () => {
    expect(
      isPosTouchSearchKeypadEnabled({
        industry: "hospitality",
      }),
    ).toBe(true);
    expect(
      isPosTouchSearchKeypadEnabled({
        deployment_profile: "hotel_bar",
        module_settings: { sales: { pos_touch_search_keypad: true } },
      }),
    ).toBe(true);
    expect(
      isPosTouchSearchKeypadEnabled({
        industry: "hospitality",
        module_settings: { sales: { pos_touch_search_keypad: false } },
      }),
    ).toBe(false);
  });

  it("respects the hospitality-specific setting", () => {
    expect(
      isPosTouchSearchKeypadEnabled({
        industry: "hospitality",
        module_settings: { hospitality: { pos_touch_search_keypad: false } },
      }),
    ).toBe(false);
  });
});
