/**
 * External POS (classic / PWA) function-key helpers.
 * Chromium PWAs often steal F10 (menu) and F12 (DevTools) unless we claim them
 * immediately on capture with { passive: false }.
 */

export const POS_FN_KEYS = new Set(["F2", "F8", "F9", "F10", "F12"]);

/** Normalize F-keys / payment aliases across browsers, OS, and PWA shells. */
export function resolvePosShortcutKey(e) {
  const key = String(e?.key || "");
  const code = String(e?.code || "");
  const keyCode = Number(e?.keyCode || e?.which || 0);

  if (key === "F2" || code === "F2" || keyCode === 113) return "F2";
  if (key === "F8" || code === "F8" || keyCode === 119) return "F8";
  if (key === "F9" || code === "F9" || keyCode === 120) return "F9";
  if (key === "F10" || code === "F10" || keyCode === 121) return "F10";
  if (key === "F12" || code === "F12" || keyCode === 123) return "F12";

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
