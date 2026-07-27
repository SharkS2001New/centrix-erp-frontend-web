import { describe, expect, it } from "vitest";
import {
  CENTRIX_POS_COMPLETE_PAYMENT_EVENT,
  claimPosFunctionKeyEvent,
  isPosFunctionKeyEvent,
  isPosFunctionShortcutKey,
  resolvePosShortcutKey,
} from "@/lib/pos-keyboard-shortcuts";

function fakeEvent(partial) {
  return {
    key: "",
    code: "",
    keyCode: 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    stopImmediatePropagation() {
      this.immediateStopped = true;
    },
    ...partial,
  };
}

describe("resolvePosShortcutKey", () => {
  it("maps bare function keys", () => {
    expect(resolvePosShortcutKey(fakeEvent({ key: "F10", code: "F10", keyCode: 121 }))).toBe("F10");
    expect(resolvePosShortcutKey(fakeEvent({ key: "F12", code: "F12", keyCode: 123 }))).toBe("F12");
    expect(resolvePosShortcutKey(fakeEvent({ key: "F2", keyCode: 113 }))).toBe("F2");
    expect(resolvePosShortcutKey(fakeEvent({ key: "", code: "", keyCode: 121 }))).toBe("F10");
  });

  it("maps payment aliases when F10 is swallowed", () => {
    expect(
      resolvePosShortcutKey(fakeEvent({ key: "Enter", code: "Enter", keyCode: 13, ctrlKey: true })),
    ).toBe("F10");
    expect(
      resolvePosShortcutKey(fakeEvent({ key: "F10", code: "F10", keyCode: 121, ctrlKey: true })),
    ).toBe("F10");
  });

  it("maps retail-toggle aliases when F12 opens DevTools", () => {
    expect(
      resolvePosShortcutKey(fakeEvent({ key: "F12", code: "F12", keyCode: 123, ctrlKey: true })),
    ).toBe("F12");
    expect(
      resolvePosShortcutKey(
        fakeEvent({ key: "u", code: "KeyU", ctrlKey: true, shiftKey: true }),
      ),
    ).toBe("F12");
  });
});

describe("claimPosFunctionKeyEvent", () => {
  it("marks the event as fully cancelled", () => {
    const e = fakeEvent({ key: "F12" });
    claimPosFunctionKeyEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(e.propagationStopped).toBe(true);
    expect(e.immediateStopped).toBe(true);
  });

  it("recognizes POS function shortcut keys", () => {
    expect(isPosFunctionShortcutKey("F10")).toBe(true);
    expect(isPosFunctionShortcutKey("Enter")).toBe(false);
  });

  it("detects function key events for input passthrough", () => {
    expect(isPosFunctionKeyEvent(fakeEvent({ key: "F8", code: "F8" }))).toBe(true);
    expect(isPosFunctionKeyEvent(fakeEvent({ key: "", code: "", keyCode: 123 }))).toBe(true);
    expect(isPosFunctionKeyEvent(fakeEvent({ key: "a", code: "KeyA" }))).toBe(false);
    expect(CENTRIX_POS_COMPLETE_PAYMENT_EVENT).toBe("centrix:pos-complete-payment");
  });
});
