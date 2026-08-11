/**
 * Organization brand accent (primary + logo) — practical theming, not full theme packs.
 */

export const DEFAULT_ORG_PRIMARY = "#4C5BA4";

export function normalizeOrgPrimaryColor(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = raw.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${hex.toUpperCase()}`;
}

function hexToRgb(hex) {
  const normalized = normalizeOrgPrimaryColor(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function relativeLuminance({ r, g, b }) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** CSS vars for ERP chrome primary (sidebar accent + primary buttons). */
export function orgPrimaryThemeVars(primaryHex, { mode = "light" } = {}) {
  const primary = normalizeOrgPrimaryColor(primaryHex) ?? DEFAULT_ORG_PRIMARY;
  const rgb = hexToRgb(primary) ?? hexToRgb(DEFAULT_ORG_PRIMARY);
  const onPrimary = relativeLuminance(rgb) > 0.55 ? "#0F172A" : "#FFFFFF";
  const subtle =
    mode === "dark"
      ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`
      : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
  const muted =
    mode === "dark"
      ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`
      : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;

  return {
    "--theme-primary": primary,
    "--theme-primary-hover": primary,
    "--theme-primary-muted": muted,
    "--theme-primary-subtle": subtle,
    "--theme-on-primary": onPrimary,
    "--theme-accent-text": primary,
  };
}

export function applyOrgPrimaryTheme(primaryHex, { mode = "light" } = {}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const vars = orgPrimaryThemeVars(primaryHex, { mode });
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

export function clearOrgPrimaryTheme() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const key of [
    "--theme-primary",
    "--theme-primary-hover",
    "--theme-primary-muted",
    "--theme-primary-subtle",
    "--theme-on-primary",
    "--theme-accent-text",
  ]) {
    // Only clear if we aren't relying on classic POS pack — caller clears full theme separately.
    root.style.removeProperty(key);
  }
}

export function resolveOrganizationLogoUrl(organization, { apiBase = "" } = {}) {
  if (!organization?.has_logo || !organization?.logo_file_path) return null;
  const path = String(organization.logo_file_path);
  if (path.startsWith("http")) return path;
  const base = String(apiBase || "").replace(/\/$/, "");
  const apiPath = path.startsWith("/api/")
    ? path
    : `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
  return `${base}${apiPath}`;
}
