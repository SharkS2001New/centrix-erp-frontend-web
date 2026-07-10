"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  isLicenseExpired,
  isLicenseExpiringSoon,
  licenseExpiredMessage,
  licenseWarningMessage,
} from "@/lib/organization-license";

/**
 * Sticky banner when the org licence is expired or within the 7-day warning window.
 * Super-admins are not blocked by tenant licence state.
 */
export function LicenseExpiryBanner({ className = "" }) {
  const { organizationLicense, isSuperAdmin } = useAuth();

  if (isSuperAdmin?.() || !organizationLicense) return null;

  const expired = isLicenseExpired(organizationLicense);
  const soon = isLicenseExpiringSoon(organizationLicense);
  if (!expired && !soon) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm ${
        expired
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
      } ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <p className="font-medium">
        {expired
          ? licenseExpiredMessage(organizationLicense)
          : licenseWarningMessage(organizationLicense)}
      </p>
      {!expired ? (
        <span className="shrink-0 text-xs font-medium opacity-80">Contact your Centrix administrator to renew.</span>
      ) : null}
    </div>
  );
}
