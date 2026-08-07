/**
 * External POS (classic / PWA) function-key helpers.
 * Chromium PWAs often steal F10 (menu) and F12 (DevTools) unless we claim them
 * immediately on capture with { passive: false }.
 */

export const POS_FN_KEYS = new Set(["F2", "F8", "F10", "F12"]);

/** Dispatched when F10 is pressed while the payment dialog is already open. */
export const CENTRIX_POS_COMPLETE_PAYMENT_EVENT = "centrix:pos-complete-payment";

/**
 * How long after Alt/Option is released we still treat letter keys as Alt+letter.
 * Windows/Chromium often clear e.altKey on the letter event, or deliver letter
 * keydown a few ms after Alt keyup when the chord is released quickly.
 * Keep this short — a long grace steals H/P from Hold dialog name fields and
 * shows false "close the open dialog" errors after Alt+H.
 */
const POS_ALT_RELEASE_GRACE_MS = 100;

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

/** Module latch so every POS listener sees the same Alt state (scan field, qty inputs, window). */
let posAltPhysicallyDown = false;
let posAltLatchUntil = 0;

export function clearPosAltLatch() {
  posAltPhysicallyDown = false;
  posAltLatchUntil = 0;
}

export function isPosAltLatched() {
  return posAltPhysicallyDown || Date.now() < posAltLatchUntil;
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

/**
 * Call from capture keydown/keyup when Alt/Option is pressed or released.
 * @param {"keydown"|"keyup"} phase
 */
export function notePosAltKeyEvent(e, phase) {
  if (!isPosAltKeyEvent(e)) return false;
  if (phase === "keydown") {
    posAltPhysicallyDown = true;
    posAltLatchUntil = 0;
  } else {
    posAltPhysicallyDown = false;
    posAltLatchUntil = Date.now() + POS_ALT_RELEASE_GRACE_MS;
  }
  return true;
}

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

/**
 * Common Developer Tools / Inspect / View Source shortcuts cashiers hit by accident.
 * Excludes POS-owned chords (bare F12, Ctrl/Cmd+F12, Ctrl/Cmd+Shift+U).
 * Cannot block chrome:// menu → More tools → Developer tools (needs OS/kiosk policy).
 */
export function isBrowserDevToolsShortcut(e) {
  if (!e) return false;
  const key = String(e.key ?? "");
  const code = String(e.code ?? "");
  const keyCode = Number(e.keyCode || e.which || 0);
  const lower = key.toLowerCase();
  const ctrlOrMeta = Boolean(e.ctrlKey || e.metaKey);

  // Ctrl/Cmd+Shift+I — Inspect / DevTools
  if (ctrlOrMeta && e.shiftKey && (lower === "i" || code === "KeyI" || keyCode === 73)) {
    return true;
  }
  // Ctrl/Cmd+Shift+J — Console
  if (ctrlOrMeta && e.shiftKey && (lower === "j" || code === "KeyJ" || keyCode === 74)) {
    return true;
  }
  // Ctrl/Cmd+Shift+C — Inspect element
  if (ctrlOrMeta && e.shiftKey && (lower === "c" || code === "KeyC" || keyCode === 67)) {
    return true;
  }
  // Ctrl/Cmd+U — View source (not Ctrl+Shift+U — that is POS retail/wholesale)
  if (ctrlOrMeta && !e.shiftKey && !e.altKey && (lower === "u" || code === "KeyU" || keyCode === 85)) {
    return true;
  }
  // Mac: Cmd+Option+I / J / C
  if (e.metaKey && e.altKey && (lower === "i" || lower === "j" || lower === "c"
    || code === "KeyI" || code === "KeyJ" || code === "KeyC")) {
    return true;
  }

  return false;
}

/**
 * Browser reload / refresh shortcuts (Ctrl/Cmd+R, F5, hard refresh).
 * External POS blocks these while offline so in-memory + IndexedDB sell state is not wiped.
 */
export function isBrowserReloadShortcut(e) {
  if (!e) return false;
  const key = String(e.key ?? "");
  const code = String(e.code ?? "");
  const keyCode = Number(e.keyCode || e.which || 0);
  const lower = key.toLowerCase();
  const ctrlOrMeta = Boolean(e.ctrlKey || e.metaKey);

  // F5 / Ctrl+F5 / Shift+F5 / Cmd+Shift+R
  if (key === "F5" || code === "F5" || keyCode === 116) {
    return true;
  }
  // Ctrl/Cmd+R — Reload (with or without Shift for hard reload). Ignore Alt chords.
  if (
    ctrlOrMeta
    && !e.altKey
    && (lower === "r" || code === "KeyR" || keyCode === 82)
  ) {
    return true;
  }

  return false;
}

/**
 * Capture listeners that block DevTools shortcuts + the browser context menu
 * for the standalone External POS PWA only. Returns cleanup.
 *
 * Right-click: preventDefault only (hides Inspect / browser menu). Does not
 * stopPropagation, so in-app onContextMenu handlers still work. Opt out of the
 * browser-menu block with [data-allow-context-menu] when a native menu is needed.
 * Backoffice Create order and Sales/LPO lists never install this lockdown.
 */
export function installPosDevToolsLockdown() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const opts = { capture: true, passive: false };

  function onKeyDown(e) {
    if (!isBrowserDevToolsShortcut(e)) return;
    // preventDefault only — do not stopImmediatePropagation so POS F-key handlers still run.
    e.preventDefault();
    e.stopPropagation();
  }

  function onContextMenu(e) {
    const el = e.target;
    if (el && typeof el.closest === "function" && el.closest("[data-allow-context-menu]")) {
      return;
    }
    // Block browser Inspect / native menu only — leave React context menus alone.
    e.preventDefault();
  }

  const targets = [document.documentElement, window, document];
  for (const target of targets) {
    target.addEventListener("keydown", onKeyDown, opts);
  }
  document.addEventListener("contextmenu", onContextMenu, opts);

  return () => {
    for (const target of targets) {
      target.removeEventListener("keydown", onKeyDown, opts);
    }
    document.removeEventListener("contextmenu", onContextMenu, opts);
  };
}

/**
 * While External POS is offline / slow-offline, block Ctrl+R / F5 so a browser
 * reload cannot drop the live cart or break local-first selling.
 * @param {{ getShouldBlock: () => boolean, onBlocked?: () => void }} options
 */
export function installPosOfflineReloadGuard({ getShouldBlock, onBlocked } = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const opts = { capture: true, passive: false };

  function onKeyDown(e) {
    if (!isBrowserReloadShortcut(e)) return;
    if (typeof getShouldBlock === "function" && !getShouldBlock()) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }
    onBlocked?.();
  }

  const targets = [document.documentElement, window, document];
  for (const target of targets) {
    target.addEventListener("keydown", onKeyDown, opts);
  }

  return () => {
    for (const target of targets) {
      target.removeEventListener("keydown", onKeyDown, opts);
    }
  };
}

export function isPosFunctionShortcutKey(key) {
  return POS_FN_KEYS.has(key);
}

/** True when Alt/Option is active (event flags, OS latch, or getModifierState). */
export function isPosAltModifierActive(e, { altHeld = false } = {}) {
  if (!e || e.metaKey) return false;
  if (e.altKey || altHeld || isPosAltLatched()) return true;
  try {
    if (typeof e.getModifierState === "function" && e.getModifierState("Alt")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * True only when Alt is actually held (or getModifierState), not the post-release grace latch.
 * Use this to avoid treating typed H/P after Alt+H as another shortcut while a dialog is open.
 */
export function isPosRealAltActive(e, { altHeld = false } = {}) {
  if (!e || e.metaKey) return false;
  if (e.altKey || altHeld) return true;
  try {
    if (typeof e.getModifierState === "function" && e.getModifierState("Alt")) return true;
  } catch {
    /* ignore */
  }
  return false;
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
 * Which Alt+letter shortcut this event is, if any: "h" | "f" | "p" | null.
 */
export function resolvePosAltShortcutLetter(e, { altHeld = false } = {}) {
  if (!isPosAltModifierActive(e, { altHeld })) return null;
  if (isPosLetterCode(e, "h")) return "h";
  if (isPosLetterCode(e, "f")) return "f";
  if (isPosLetterCode(e, "p")) return "p";
  return null;
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
  return resolvePosAltShortcutLetter(e, { altHeld }) != null;
}
