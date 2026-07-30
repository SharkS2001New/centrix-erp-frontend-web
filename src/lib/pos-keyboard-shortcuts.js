/**
 * External POS (classic / PWA) function-key helpers.
 * Chromium PWAs often steal F10 (menu) and F12 (DevTools) unless we claim them
 * immediately on capture with { passive: false }.
 */

export const POS_FN_KEYS = new Set(["F2", "F8", "F9", "F10", "F12"]);

/** Dispatched when F10 is pressed while the payment dialog is already open. */
export const CENTRIX_POS_COMPLETE_PAYMENT_EVENT = "centrix:pos-complete-payment";

const F_KEY_BY_CODE = {
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  116: "F5",
  117: "F6",
  118: "F7",
  119: "F8",
  120: "F9",
  121: "F10",
  122: "F11",
  123: "F12",
};

export function isPosFunctionKeyEvent(e) {
  const key = String(e?.key ?? "");
  const code = String(e?.code ?? "");
  const keyCode = Number(e?.keyCode || e?.which || 0);
  if (/^F([1-9]|1[0-2])$/i.test(key) || /^F\d+$/i.test(code)) return true;
  return Boolean(F_KEY_BY_CODE[keyCode]);
}

/** Normalize F-keys / payment aliases across browsers, OS, and PWA shells. */
export function resolvePosShortcutKey(e) {
  const key = String(e?.key || "");
  const code = String(e?.code || "");
  const keyCode = Number(e?.keyCode || e?.which || 0);

  const fromKeyCode = F_KEY_BY_CODE[keyCode];
  if (fromKeyCode) return fromKeyCode;

  if (key === "F2" || code === "F2") return "F2";
  if (key === "F8" || code === "F8") return "F8";
  if (key === "F9" || code === "F9") return "F9";
  if (key === "F10" || code === "F10") return "F10";
  if (key === "F12" || code === "F12") return "F12";

  // Payment when the OS/browser swallows bare F10 (Mac Fn layer, Windows menu focus).
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === "Enter" || code === "Enter" || keyCode === 13)) {
    return "F10";
  }
  // Ctrl/Cmd+F10 — same as F10 when bare F10 is reserved by the shell.
  if ((e.ctrlKey || e.metaKey) && (key === "F10" || code === "F10" || keyCode === 121)) {
    return "F10";
  }
  // Ctrl/Cmd+F12 — retail/wholesale when bare F12 opens DevTools.
  if ((e.ctrlKey || e.metaKey) && (key === "F12" || code === "F12" || keyCode === 123)) {
    return "F12";
  }
  // Ctrl+Shift+U — reliable retail/wholesale toggle (U = unit/pricing mode).
  if (
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey &&
    !e.altKey &&
    (key === "u" || key === "U" || code === "KeyU")
  ) {
    return "F12";
  }

  return key;
}

/** Block browser chrome (DevTools / menu) for POS function keys. */
export function claimPosFunctionKeyEvent(e) {
  if (!e) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === "function") {
    e.stopImmediatePropagation();
  }
}

export function isPosFunctionShortcutKey(key) {
  return POS_FN_KEYS.has(key);
}

/** True when Alt/Option is active (event flags, OS latch, or getModifierState). */
export function isPosAltModifierActive(e, { altHeld = false } = {}) {
  if (!e || e.metaKey) return false;
  if (e.altKey || altHeld) return true;
  try {
    if (typeof e.getModifierState === "function" && e.getModifierState("Alt")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function isPosAltKeyEvent(e) {
  const key = String(e?.key ?? "");
  const code = String(e?.code ?? "");
  return (
    key === "Alt"
    || key === "AltGraph"
    || code === "AltLeft"
    || code === "AltRight"
  );
}

/** Physical letter key for Alt+letter shortcuts (ignores Option dead-key glyphs like ˙). */
export function isPosLetterCode(e, letter) {
  const upper = String(letter ?? "")
    .trim()
    .toUpperCase();
  if (!upper || upper.length !== 1 || !/[A-Z]/.test(upper)) return false;
  const key = String(e?.key ?? "");
  const code = String(e?.code ?? "");
  const lower = upper.toLowerCase();
  // keyCode 65–90 = A–Z (legacy Windows shells that omit e.code).
  const keyCode = Number(e?.keyCode || e?.which || 0);
  const fromKeyCode = keyCode >= 65 && keyCode <= 90 ? String.fromCharCode(keyCode) : "";
  return (
    key === lower
    || key === upper
    || code === `Key${upper}`
    || fromKeyCode === upper
  );
}

/**
 * Alt+letter POS shortcuts — prefer e.code so Mac Option layers still match (e.g. Option+H → ˙).
 * Pass altHeld when the listener tracks AltLeft/AltRight down (Windows menu-bar quirks).
 */
export function isPosAltLetterShortcut(e, letter, { altHeld = false } = {}) {
  // Do not require !ctrlKey: Right Alt is AltGr on many layouts (ctrl+alt together).
  // Still ignore Cmd/Win chords.
  if (!isPosAltModifierActive(e, { altHeld })) return false;
  return isPosLetterCode(e, letter);
}

/**
 * POS Alt shortcuts: Alt+H hold, Alt+F float, Alt+P reprint.
 * Name kept for callers; applies to classic and modern POS layouts.
 */
export function isPosClassicAltShortcut(e, { altHeld = false } = {}) {
  return isPosAltLetterShortcut(e, "h", { altHeld })
    || isPosAltLetterShortcut(e, "f", { altHeld })
    || isPosAltLetterShortcut(e, "p", { altHeld });
}
