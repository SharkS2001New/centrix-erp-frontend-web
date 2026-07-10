import { P } from "@/lib/permission-codes";

/** Company code for the platform shell organization (not a trading tenant). */
export const PLATFORM_COMPANY_CODE = "PLATFORM";

/** Permissions that configure a tenant organization — not platform operations. */
export const ORG_ADMIN_PERMISSION_PREFIXES = ["admin.", "accounting.account_mappings"];

/** Nav/settings scope for tenant org administration (not platform operational settings). */
export const ORG_ADMIN_SETTINGS_PATH_PREFIXES = [
  "/admin/company",
  "/admin/branches",
  "/admin/users",
  "/admin/roles",
  "/admin/audit",
  "/admin/payment-methods",
  "/admin/kra-responses",
  "/vats",
];

export function isPlatformOrganization(organization) {
  const code = String(organization?.company_code ?? "").toUpperCase();
  if (code === PLATFORM_COMPANY_CODE) return true;
  return Boolean(organization?.module_settings?.platform);
}

const TRADING_MODULE_KEYS = [
  "sales",
  "sales.pos",
  "sales.backend",
  "sales.mobile",
  "inventory",
  "customers_suppliers",
  "accounting",
  "payments",
  "hr_payroll",
  "distribution",
];

const OPERATIONAL_MODULE_KEYS = [
  "admin",
  "sales",
  "inventory",
  "customers_suppliers",
  "accounting",
  "payments",
  "hr_payroll",
  "distribution",
];

/** Whether the tenant has any operational ERP module (can print documents, run sales, etc.). */
export function hasOperationalModule(capabilities) {
  const modules = capabilities?.modules ?? {};
  return OPERATIONAL_MODULE_KEYS.some((key) => Boolean(modules[key]));
}

/** Whether the tenant Administration workspace/module is enabled for this organization. */
export function isAdministrationModuleEnabled(capabilities) {
  if (Boolean(capabilities?.modules?.admin)) {
    return true;
  }
  const modules = capabilities?.modules ?? {};
  return TRADING_MODULE_KEYS.some((key) => Boolean(modules[key]));
}

/** Organization preferences (printouts, sales, security) without the full Administration workspace. */
export function canAccessTenantOrganizationSettings({
  organization,
  isSuperAdmin,
  hasPermission,
  user,
  capabilities,
}) {
  if (shouldHideOrgAdminFromPlatformSuperAdmin({ organization, isSuperAdmin })) {
    return false;
  }
  if (!hasOperationalModule(capabilities)) {
    return false;
  }
  if (isSuperAdmin?.()) {
    return true;
  }
  if (isOrgAdministrator(user, capabilities)) {
    return true;
  }
  return hasPermission(P.admin.manage);
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
  if (!isAdministrationModuleEnabled(capabilities)) {
    return false;
  }
  if (isSuperAdmin?.()) {
    return true;
  }
  if (isOrgAdministrator(user, capabilities)) {
    return true;
  }
  return hasPermission(P.admin.overview.view);
}

export function canAccessPlatformAdmin(isSuperAdmin) {
  return Boolean(isSuperAdmin?.());
}
