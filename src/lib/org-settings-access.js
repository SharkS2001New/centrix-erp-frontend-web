/** Settings still owned by the platform operator (module provisioning, workflows, integration gates). */
export const ORG_SETTINGS_PLATFORM_MESSAGE =
  "Module access, checkout flow, mobile orders, order pipeline, accounting books setup, and M-Pesa/KRA/WhatsApp feature toggles remain platform-managed. Free platform AI is offered per org; tenants configure keys under Organization settings → AI.";

/** Hint for tenant-managed organization settings. */
export const TENANT_ORG_SETTINGS_SUBTITLE =
  "Operational preferences for your enabled modules. KRA lives under Tax; M-Pesa, paybills, and Equity accounts live under Administration → Finance. Configure AI under the AI tab. WhatsApp remains platform-managed.";

/** Redirect map for tabs promoted out of tenant Organization settings. */
export const TENANT_ORG_SETTINGS_TAB_REDIRECTS = {
  finance: "/admin/kra-settings",
  whatsapp: "/admin/settings",
};

/** @param {string|number} orgId */
export function platformOrgSettingsHref(orgId) {
  return `/platform/organizations/${orgId}/settings`;
}
