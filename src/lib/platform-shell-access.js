import { shouldHideOrgAdminFromPlatformSuperAdmin } from "@/lib/admin-scope";

/** Routes platform super admins may use (tenant ERP is hidden). */
export const PLATFORM_SHELL_PREFIXES = ["/platform", "/profile"];

export function isPlatformShellRoute(pathname) {
  if (!pathname) return false;
  return PLATFORM_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isPlatformShellUser({ user, organization, capabilities, isSuperAdmin }) {
  const superAdmin =
    typeof isSuperAdmin === "function"
      ? isSuperAdmin()
      : Boolean(user?.is_super_admin || capabilities?.is_super_admin);
  return shouldHideOrgAdminFromPlatformSuperAdmin({ organization, isSuperAdmin: () => superAdmin });
}
