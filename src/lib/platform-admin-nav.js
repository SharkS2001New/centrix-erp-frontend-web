/** Shared platform admin hub links for tenant setup when Administration is disabled. */

export const PLATFORM_ADMIN_LINKS = [
  { href: "users", label: "Users", description: "Create users, assign branches, roles, and permission overrides." },
  { href: "branches", label: "Branches", description: "Store locations, M-Pesa tills, and branch managers." },
  { href: "roles", label: "Roles & permissions", description: "Role templates and permission assignments." },
  { href: "payment-methods", label: "Payment methods", description: "Cash, M-Pesa, bank, and other tender types." },
  { href: "company", label: "Company profile & logo", description: "Legal identity and branding shown on documents." },
  { href: "vats", label: "VAT rates", description: "Tax codes and percentages used on products." },
  { href: "kra-responses", label: "KRA device log", description: "Fiscal receipt submissions and retry status." },
  { href: "audit", label: "Audit log", description: "Who changed what across this organization." },
];

/** @param {string|number} orgId */
export function platformAdminHref(orgId, segment) {
  if (!segment) return `/platform/organizations/${orgId}/admin`;
  return `/platform/organizations/${orgId}/admin/${segment}`;
}

/** @param {string|number} orgId */
export function platformOrgSettingsHref(orgId) {
  return `/platform/organizations/${orgId}/settings`;
}

/** @param {string|number} orgId */
export function platformOrgHref(orgId) {
  return `/platform/organizations/${orgId}`;
}
