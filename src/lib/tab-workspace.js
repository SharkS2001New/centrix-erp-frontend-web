/** Desktop-style in-app tab workspace (platform-controlled per organization). */

export const TAB_WORKSPACE_MAX_TABS = 10;

/** Routes that always use full-page navigation without the tab bar. */
export const TAB_WORKSPACE_EXCLUDED_PREFIXES = [
  "/sales/pos",
  "/change-password",
  "/login",
  "/platform",
];

export function isTabWorkspaceEnabled(capabilities) {
  return capabilities?.platform_tab_workspace_enabled === true;
}

export function isTabWorkspaceRoute(pathname) {
  if (!pathname || pathname === "/") return true;
  return !TAB_WORKSPACE_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function normalizeTabHref(href) {
  if (!href) return "/";
  try {
    const url = new URL(href, "http://local");
    return `${url.pathname}${url.search}`;
  } catch {
    return href.split("#")[0] || "/";
  }
}

export function titleFromPathname(pathname) {
  const path = normalizeTabHref(pathname);
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "Home";

  const last = segments[segments.length - 1];
  if (/^\d+$/.test(last) && segments.length > 1) {
    return humanizeSegment(segments[segments.length - 2]);
  }

  return humanizeSegment(last);
}

function humanizeSegment(segment) {
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function tabStorageKey(organizationId) {
  return `centrix-tab-workspace:${organizationId ?? "default"}`;
}
