/** PWA install + browser notification engage prompts (dismiss persistence). */

export const PWA_INSTALL_DISMISS_KEY = "centrix:pwa-install-dismissed";
export const PWA_NOTIF_DISMISS_KEY = "centrix:browser-notif-dismissed";

/** Re-show dismissed prompts after this many days. */
const DISMISS_TTL_DAYS = 30;

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
    // iOS Safari
    if (typeof navigator !== "undefined" && navigator.standalone === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const chrome = /CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && !chrome;
}

function readDismissedAt(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const at = Number(parsed?.at ?? parsed);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

export function isPromptDismissed(key) {
  const at = readDismissedAt(key);
  if (at == null) return false;
  const ageMs = Date.now() - at;
  return ageMs < DISMISS_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export function dismissPrompt(key) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}

export function clearPromptDismiss(key) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function browserNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

export function canRequestBrowserNotifications() {
  return browserNotificationPermission() === "default";
}

/**
 * Show a system notification when permission is granted.
 * Prefer service worker notifications so clicks work in background.
 */
export async function showBrowserNotification({ title, body, url = "/notifications", tag } = {}) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;

  const payload = {
    body: body || "",
    icon: "/branding/centrix-logo-icon.png",
    badge: "/branding/centrix-mark.png",
    tag: tag || "centrix-notification",
    data: { url },
  };

  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) {
      await reg.showNotification(title || "Centrix", payload);
      return true;
    }
  } catch {
    /* fall through */
  }

  try {
    const n = new Notification(title || "Centrix", payload);
    void n;
    return true;
  } catch {
    return false;
  }
}

/** Register the minimal Centrix service worker (idempotent). */
export async function registerCentrixServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  // Prefer secure contexts (localhost + https).
  if (!window.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}
