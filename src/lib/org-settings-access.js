/** Operational org settings (sales, finance, security, etc.) are platform-super-admin only. */

export const ORG_SETTINGS_PLATFORM_MESSAGE =
  "Organization settings are managed by your platform administrator.";

/** @param {string|number} orgId */
export function platformOrgSettingsHref(orgId) {
  return `/platform/organizations/${orgId}/settings`;
}
