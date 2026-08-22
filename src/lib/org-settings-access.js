/** Settings still owned by the platform operator (module provisioning, workflows, integration gates). */
export const ORG_SETTINGS_PLATFORM_MESSAGE =
  "Module access, checkout flow, mobile orders, order pipeline, accounting books setup, and M-Pesa/KRA/AI feature toggles remain platform-managed.";

/** Hint for tenant-managed organization settings. */
export const TENANT_ORG_SETTINGS_SUBTITLE =
  "Operational preferences for your enabled modules. KRA lives under Tax; M-Pesa and Paybills live under Finance. AI and WhatsApp remain platform-managed.";

/** Redirect map for tabs promoted out of tenant Organization settings. */
export const TENANT_ORG_SETTINGS_TAB_REDIRECTS = {
  finance: "/admin/kra-settings",
  ai: "/admin/settings",
  whatsapp: "/admin/settings",
};

/** @param {string|number} orgId */
export function platformOrgSettingsHref(orgId) {
  return `/platform/organizations/${orgId}/settings`;
}
