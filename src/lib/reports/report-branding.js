import { organizationLogoFileUrl } from "@/lib/api";
import { mergeGeneralSettings } from "@/lib/general-settings";

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

/** @param {{ organization?: object, generalSettings?: object }} options */
export function resolveReportBranding({ organization, generalSettings } = {}) {
  const settings = generalSettings ?? {};
  const showHeader = settings.show_organization_on_documents !== false;
  const preference = settings.document_header_display ?? "auto";
  const organizationName = organization?.org_name ?? organization?.name ?? "";
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

export function reportDocumentStyles() {
  return `
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; font-size: 11px; position: relative; }
  .org-header { text-align: center; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
  .org-logo { display: block; margin: 0 auto 8px; max-height: 64px; max-width: 260px; object-fit: contain; }
  .org-name { font-size: 18px; font-weight: 700; margin: 0; line-height: 1.25; color: #0f172a; }
  .meta { margin-bottom: 20px; text-align: center; }
  .meta h1 { font-size: 16px; margin: 0 0 4px; font-weight: 600; }
  .meta p { margin: 2px 0; font-size: 12px; color: #475569; }
  .doc-footer { margin-top: 18px; text-align: center; font-size: 10px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; position: relative; z-index: 1; font-size: 11px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f8fafc; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: 600; background: #f8fafc; }
  .watermark { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
  .watermark-text {
    position: absolute;
    top: 48%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-32deg);
    font-size: 64px;
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
    .watermark-text { color: rgba(15, 23, 42, 0.08); }
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
