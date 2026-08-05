import { DEFAULT_PWA_THEME_COLOR, DARK_PWA_THEME_COLOR } from "@/lib/branding";

export const THEME_STORAGE_KEY = "pos_erp_theme";
const THEME_CHANGE_EVENT = "centrix-erp-theme-change";

function syncFallbackThemeColor(mode) {
  if (typeof document === "undefined") return;
  const color = mode === "dark" ? DARK_PWA_THEME_COLOR : DEFAULT_PWA_THEME_COLOR;
  let metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
    metas = document.querySelectorAll('meta[name="theme-color"]');
  }
  // Only set fallback when no org theme chrome is active yet.
  const root = document.documentElement;
  if (root.dataset.erpTheme || root.dataset.classicPosActive === "true") {
    return;
  }
  metas.forEach((meta) => {
    meta.setAttribute("content", color);
  });
}

export function readStoredTheme() {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return "light";
}

export function getTheme() {
  if (typeof document === "undefined") return "light";
  const fromDom = document.documentElement.dataset.theme;
  if (fromDom === "dark" || fromDom === "light") return fromDom;
  return readStoredTheme();
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return theme === "dark" ? "dark" : "light";

  const value = theme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  root.dataset.theme = value;
  root.classList.remove("light", "dark");
  root.classList.add(value);
  root.style.colorScheme = value;
  syncFallbackThemeColor(value);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    /* private browsing */
  }

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  return value;
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  return applyTheme(next);
}

export function subscribeTheme(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}
