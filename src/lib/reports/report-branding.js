import { organizationLogoFileUrl } from "@/lib/api";
import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
  orgPrintPx,
} from "@/lib/print-typography";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function organizationHasLogo(organization) {
  if (!organization) return false;
  if (organization.has_logo != null) return Boolean(organization.has_logo);
  return typeof organization.logo === "string" && organization.logo.startsWith("organizations/");
}

export function resolveDisplay(preference, hasLogo) {
  switch (preference) {
    case "logo":
      return hasLogo ? "logo" : "name";
    case "name":
      return "name";
    case "logo_and_name":
      return hasLogo ? "logo_and_name" : "name";
    default:
      return hasLogo ? "logo" : "name";
  }
}

/** @param {{ organization?: object, generalSettings?: object, organizationNameFallback?: string }} options */
export function resolveReportBranding({
  organization,
  generalSettings,
  organizationNameFallback = "",
} = {}) {
  const settings = generalSettings ?? {};
  const showHeader = settings.show_organization_on_documents !== false;
  const preference = settings.document_header_display ?? "auto";
  const organizationName =
    organization?.org_name ??
    organization?.name ??
    organizationNameFallback ??
    "";
  const hasLogo = organizationHasLogo(organization);
  const logoUrl =
    hasLogo && organization?.id
      ? organizationLogoFileUrl(organization.id, {
          filePath: organization.logo_file_path ?? undefined,
        })
      : null;

  return {
    showHeader,
    display: resolveDisplay(preference, hasLogo),
    organizationName,
    logoUrl,
    watermarkText: organizationName || "Centrix ERP",
    documentFooterText: settings.document_footer_text?.trim?.() || "",
  };
}

/** @param {ReturnType<resolveReportBranding>} branding */
export function buildReportOrgHeaderHtml(branding) {
  if (!branding?.showHeader) return "";

  const parts = [];
  if ((branding.display === "logo" || branding.display === "logo_and_name") && branding.logoUrl) {
    parts.push(
      `<img class="org-logo" src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.organizationName)}">`,
    );
  }
  if (
    (branding.display === "name" || branding.display === "logo_and_name") &&
    branding.organizationName
  ) {
    parts.push(`<div class="org-name">${escapeHtml(branding.organizationName)}</div>`);
  }

  return parts.length ? `<div class="org-header">${parts.join("")}</div>` : "";
}

/** @param {ReturnType<resolveReportBranding>} branding */
export function buildReportWatermarkHtml(branding) {
  const text = branding?.watermarkText?.trim?.() || "";
  if (!text) return "";

  const logo =
    branding.logoUrl && branding.display !== "name"
      ? `<img class="watermark-logo" src="${escapeHtml(branding.logoUrl)}" alt="">`
      : "";

  return `<div class="watermark"><div class="watermark-text">${escapeHtml(text)}</div>${logo}</div>`;
}

export function reportDocumentStyles(generalSettings = null) {
  const px = (base, print = false) => orgPrintPx(base, generalSettings, { variant: "report", print });
  const font = orgPrintFontFamilyFromSettings(generalSettings, "report");
  return `
  body { font-family: ${font}; padding: 24px; color: #000; font-size: ${px(11)}; position: relative; ${orgPrintInkStyles(generalSettings, "report")} }
  .org-header { text-align: center; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #000; }
  .org-logo { display: block; margin: 0 auto 8px; max-height: 64px; max-width: 260px; object-fit: contain; }
  .org-name { font-size: ${px(18)}; font-weight: var(--print-w-strong, 800); margin: 0; line-height: 1.25; color: #000; }
  .meta { margin-bottom: 20px; text-align: center; }
  .meta h1 { font-size: ${px(16)}; margin: 0 0 4px; font-weight: var(--print-w-emphasis, 700); color: #000; }
  .meta p { margin: 2px 0; font-size: ${px(12)}; color: #000; font-weight: var(--print-w-body, 600); }
  .doc-footer { margin-top: 18px; text-align: center; font-size: ${px(10)}; color: #000; font-weight: var(--print-w-body, 600); }
  table { width: 100%; border-collapse: collapse; position: relative; z-index: 1; font-size: ${px(11)}; color: #000; }
  th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
  th { background: #f3f4f6; font-weight: var(--print-w-emphasis, 700); }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: var(--print-w-emphasis, 700); background: #f3f4f6; }
  .watermark { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
  .watermark-text {
    position: absolute;
    top: 48%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-32deg);
    font-size: ${px(64)};
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(15, 23, 42, 0.06);
    white-space: nowrap;
  }
  .watermark-logo {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 70%;
    max-height: 70%;
    opacity: 0.05;
    object-fit: contain;
  }
  @media print {
    body { font-size: ${px(11, true)}; }
    .org-name { font-size: ${px(18, true)}; }
    .meta h1 { font-size: ${px(16, true)}; }
    .meta p { font-size: ${px(12, true)}; }
    .doc-footer { font-size: ${px(10, true)}; }
    table { font-size: ${px(11, true)}; }
    .watermark-text { color: rgba(15, 23, 42, 0.08); font-size: ${px(64, true)}; }
  }
`;
}

/** @param {object} meta @param {ReturnType<resolveReportBranding>} [branding] */
export function reportDetailMetaLines(meta, branding) {
  const lines = [
    meta.organizationName,
    meta.title,
    meta.subtitle,
    meta.periodLine,
    meta.branchLine,
    ...(meta.extraLines ?? []),
    meta.printedLine,
  ].filter(Boolean);

  if (branding?.showHeader && lines.length) {
    return lines.slice(1);
  }

  return lines;
}

/** @param {{ organization?: object, generalSettings?: object }} options */
export function buildReportBrandingContext(options = {}) {
  const generalSettings = options.generalSettings ?? mergeGeneralSettings({});
  return resolveReportBranding({
    organization: options.organization,
    generalSettings,
  });
}
