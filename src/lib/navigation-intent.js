import {
  beginNavigationIntent,
  isNavigationPending,
} from "./app-loading";
import { shouldReuseOpenTabHref } from "./tab-workspace";

function isModifiedClick(event) {
  return (
    event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || event.defaultPrevented
  );
}

function resolveInternalHref(anchor) {
  const raw = anchor.getAttribute("href");
  if (!raw) return null;
  if (raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.origin !== window.location.origin) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  return raw;
}

/**
 * Capture-phase listener: start route skeleton immediately on internal link clicks.
 * Attach once on the app shell root.
 */
export function handleNavigationIntentClick(event) {
  if (isModifiedClick(event)) return;

  const anchor = event.target?.closest?.("a[href]");
  if (!anchor) return;
  if (anchor.getAttribute("target") === "_blank") return;
  if (anchor.hasAttribute("download")) return;
  if (anchor.dataset.navIgnore === "true") return;

  const href = resolveInternalHref(anchor);
  if (!href) return;

  const current = `${window.location.pathname}${window.location.search}`;
  if (href === current || href === window.location.pathname) return;

  // Already-open mounted tab: keep-alive switches without remount.
  if (shouldReuseOpenTabHref(href)) return;

  if (isNavigationPending()) return;

  beginNavigationIntent("Opening page…", href);
}
