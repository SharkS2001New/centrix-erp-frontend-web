import { P } from "@/lib/permission-codes";

/** Company code for the platform shell organization (not a trading tenant). */
export const PLATFORM_COMPANY_CODE = "PLATFORM";

/** Permissions that configure a tenant organization — not platform operations. */
export const ORG_ADMIN_PERMISSION_PREFIXES = ["admin.", "accounting.account_mappings"];

/** Nav/settings scope for tenant org administration. */
export const ORG_ADMIN_SETTINGS_PATH_PREFIXES = [
  "/admin/settings",
  "/admin/company",
  "/admin/branches",
  "/admin/users",
  "/admin/roles",
  "/admin/audit",
  "/admin/payment-methods",
  "/admin/kra-responses",
];

export function isPlatformOrganization(organization) {
  const code = String(organization?.company_code ?? "").toUpperCase();
  if (code === PLATFORM_COMPANY_CODE) return true;
  return Boolean(organization?.module_settings?.platform);
}

export function isOrgAdministrator(user, capabilities) {
  return Boolean(user?.is_admin || capabilities?.is_admin);
}

export function isOrgScopedPermission(code) {
  if (!code) return false;
  return ORG_ADMIN_PERMISSION_PREFIXES.some((prefix) => String(code).startsWith(prefix));
}

export function isOrgAdminSettingsPath(pathname) {
  if (!pathname) return false;
  return ORG_ADMIN_SETTINGS_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Super admins on the platform shell org manage tenants via /platform — not tenant ERP settings.
 */
export function shouldHideOrgAdminFromPlatformSuperAdmin({ organization, isSuperAdmin }) {
  return Boolean(isSuperAdmin?.()) && isPlatformOrganization(organization);
}

export function canAccessOrgAdminSettings({ organization, isSuperAdmin, hasPermission, user, capabilities }) {
  if (shouldHideOrgAdminFromPlatformSuperAdmin({ organization, isSuperAdmin })) {
    return false;
  }
  if (isOrgAdministrator(user, capabilities)) {
    return true;
  }
  return hasPermission(P.admin.settings.view);
}

export function canAccessPlatformAdmin(isSuperAdmin) {
  return Boolean(isSuperAdmin?.());
}
