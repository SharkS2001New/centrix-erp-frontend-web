import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CENTRIX_POS_COMPLETE_PAYMENT_EVENT,
  claimPosFunctionKeyEvent,
  clearPosAltLatch,
  isBrowserDevToolsShortcut,
  isPosAltLatched,
  isPosAltLetterShortcut,
  isPosClassicAltShortcut,
  isPosFunctionKeyEvent,
  isPosFunctionShortcutKey,
  isPosRealAltActive,
  notePosAltKeyEvent,
  resolvePosAltShortcutLetter,
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
});

describe("isBrowserDevToolsShortcut", () => {
  it("detects Inspect / Console / View source chords", () => {
    expect(
      isBrowserDevToolsShortcut(fakeEvent({ key: "i", code: "KeyI", ctrlKey: true, shiftKey: true })),
    ).toBe(true);
    expect(
      isBrowserDevToolsShortcut(fakeEvent({ key: "j", code: "KeyJ", ctrlKey: true, shiftKey: true })),
    ).toBe(true);
    expect(
      isBrowserDevToolsShortcut(fakeEvent({ key: "c", code: "KeyC", metaKey: true, shiftKey: true })),
    ).toBe(true);
    expect(
      isBrowserDevToolsShortcut(fakeEvent({ key: "u", code: "KeyU", ctrlKey: true })),
    ).toBe(true);
    expect(
      isBrowserDevToolsShortcut(fakeEvent({ key: "i", code: "KeyI", metaKey: true, altKey: true })),
    ).toBe(true);
  });

  it("leaves POS-owned F12 / Ctrl+Shift+U alone", () => {
    expect(isBrowserDevToolsShortcut(fakeEvent({ key: "F12", code: "F12", keyCode: 123 }))).toBe(false);
    expect(
      isBrowserDevToolsShortcut(fakeEvent({ key: "F12", code: "F12", keyCode: 123, ctrlKey: true })),
    ).toBe(false);
    expect(
      isBrowserDevToolsShortcut(fakeEvent({ key: "u", code: "KeyU", ctrlKey: true, shiftKey: true })),
    ).toBe(false);
  });
});

describe("pos alt / function helpers", () => {
  it("detects function key events for input passthrough", () => {
    expect(isPosFunctionKeyEvent(fakeEvent({ key: "F8", code: "F8" }))).toBe(true);
    expect(isPosFunctionKeyEvent(fakeEvent({ key: "", code: "", keyCode: 123 }))).toBe(true);
    expect(isPosFunctionKeyEvent(fakeEvent({ key: "a", code: "KeyA" }))).toBe(false);
    expect(CENTRIX_POS_COMPLETE_PAYMENT_EVENT).toBe("centrix:pos-complete-payment");
  });

  it("detects classic Alt+letter shortcuts via key or code", () => {
    expect(isPosAltLetterShortcut(fakeEvent({ key: "h", code: "KeyH", altKey: true }), "h")).toBe(
      true,
    );
    expect(
      isPosAltLetterShortcut(fakeEvent({ key: "˙", code: "KeyH", altKey: true }), "h"),
    ).toBe(true);
    expect(isPosClassicAltShortcut(fakeEvent({ key: "P", code: "KeyP", altKey: true }))).toBe(true);
    // Right Alt is AltGr on many keyboards (ctrl+alt) — must still match.
    expect(
      isPosAltLetterShortcut(
        fakeEvent({ key: "h", code: "KeyH", altKey: true, ctrlKey: true }),
        "h",
      ),
    ).toBe(true);
    expect(
      isPosAltLetterShortcut(
        fakeEvent({ key: "h", code: "KeyH", altKey: true, metaKey: true }),
        "h",
      ),
    ).toBe(false);
    // Windows menu-bar quirk: letter key may lose altKey while Alt is still held.
    expect(
      isPosAltLetterShortcut(fakeEvent({ key: "h", code: "KeyH", altKey: false }), "h", {
        altHeld: true,
      }),
    ).toBe(true);
    expect(
      isPosAltLetterShortcut(fakeEvent({ key: "˙", code: "KeyH", keyCode: 72, altKey: false }), "h", {
        altHeld: true,
      }),
    ).toBe(true);
  });
});

describe("POS Alt latch / release grace", () => {
  afterEach(() => {
    clearPosAltLatch();
    vi.useRealTimers();
  });

  it("treats letter as Alt+letter while Alt is latched even if altKey is false", () => {
    notePosAltKeyEvent(fakeEvent({ key: "Alt", code: "AltLeft" }), "keydown");
    expect(isPosAltLatched()).toBe(true);
    expect(
      resolvePosAltShortcutLetter(fakeEvent({ key: "h", code: "KeyH", altKey: false })),
    ).toBe("h");
    expect(isPosClassicAltShortcut(fakeEvent({ key: "p", code: "KeyP", altKey: false }))).toBe(
      true,
    );
  });

  it("keeps matching briefly after Alt keyup (Windows chord release race)", () => {
    vi.useFakeTimers();
    notePosAltKeyEvent(fakeEvent({ key: "Alt", code: "AltLeft" }), "keydown");
    notePosAltKeyEvent(fakeEvent({ key: "Alt", code: "AltLeft" }), "keyup");
    expect(isPosAltLatched()).toBe(true);
    expect(
      resolvePosAltShortcutLetter(fakeEvent({ key: "f", code: "KeyF", altKey: false })),
    ).toBe("f");
    vi.advanceTimersByTime(101);
    expect(isPosAltLatched()).toBe(false);
    expect(
      resolvePosAltShortcutLetter(fakeEvent({ key: "f", code: "KeyF", altKey: false })),
    ).toBe(null);
  });

  it("distinguishes real Alt from post-release grace latch", () => {
    notePosAltKeyEvent(fakeEvent({ key: "Alt", code: "AltLeft" }), "keydown");
    expect(
      isPosRealAltActive(fakeEvent({ key: "h", code: "KeyH", altKey: false }), { altHeld: true }),
    ).toBe(true);
    notePosAltKeyEvent(fakeEvent({ key: "Alt", code: "AltLeft" }), "keyup");
    expect(
      isPosRealAltActive(fakeEvent({ key: "h", code: "KeyH", altKey: false }), { altHeld: false }),
    ).toBe(false);
    expect(isPosAltLatched()).toBe(true);
  });
});
