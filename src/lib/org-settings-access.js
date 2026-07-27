/** Settings still owned by the platform operator (module provisioning, workflows, integration gates). */
export const ORG_SETTINGS_PLATFORM_MESSAGE =
  "Module access, checkout flow, mobile orders, order pipeline, accounting books setup, and M-Pesa/KRA/AI feature toggles remain platform-managed.";

/** Hint for tenant-managed organization settings. */
export const TENANT_ORG_SETTINGS_SUBTITLE =
  "Operational preferences for your enabled modules. Platform administrators control module provisioning, order workflow, and integration gates.";

/** @param {string|number} orgId */
export function platformOrgSettingsHref(orgId) {
  return `/platform/organizations/${orgId}/settings`;
}
