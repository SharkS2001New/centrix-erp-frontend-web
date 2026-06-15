export const THEME_STORAGE_KEY = "pos_erp_theme";
const THEME_CHANGE_EVENT = "pos-erp-theme-change";

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
