"use client";

import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isLicenseExpiringSoon,
  licenceNeedsPayment,
  licencePlanPath,
  rememberLicenceReturn,
  licenseAccessMode,
  licenseWarningMessage,
  yearlyRenewalOpen,
} from "@/lib/organization-license";
import { LicensePaybillInstructions } from "@/components/shared/license-paybill-instructions";

/**
 * Sticky banner when the org licence is expired or within the 7-day warning window.
 * Super-admins are not blocked by tenant licence state.
 */
export function LicenseExpiryBanner({ className = "" }) {
  const pathname = usePathname();
  const { organizationLicense, isSuperAdmin, isOrgAdmin } = useAuth();
  const canPay = Boolean(isOrgAdmin?.());

  if (isSuperAdmin?.() || !organizationLicense) return null;

  const limited = licenceNeedsPayment(organizationLicense);
  const soon = isLicenseExpiringSoon(organizationLicense);
  const mode = licenseAccessMode(organizationLicense);
  const renew = yearlyRenewalOpen(organizationLicense);
  if (!limited && !soon && mode !== "token" && mode !== "trial") return null;
  if (limited) return null;
  const tokenBalance = Number(organizationLicense.token_balance ?? 0);
  const limitedMessage =
    mode === "trial"
      ? `You are on a free trial${organizationLicense.plan_name ? ` of ${organizationLicense.plan_name}` : ""}${organizationLicense.expires_at ? ` until ${organizationLicense.expires_at}` : ""}. You can use the modules on that package. Pay the Centrix Paybill to keep them.`
      : mode === "token"
      ? `This organisation has ${tokenBalance} Centrix token${tokenBalance === 1 ? "" : "s"}. Each completed sale uses ${Number(organizationLicense.sale_tokens ?? 1)} when it is saved online, including when an offline order syncs. Reading is free.`
      : mode === "expired"
        ? `${organizationLicense.plan_name ? `Your trial or paid period for ${organizationLicense.plan_name} has ended.` : "Your trial or paid period has ended."} This organisation is now on ${organizationLicense.current_package || organizationLicense.free_plan?.name || "Package 1"}, the free plan. Pay the Centrix Paybill to open a bigger plan again.`
        : `This organisation is on ${organizationLicense.current_package || organizationLicense.free_plan?.name || "Package 1"}, the free plan. Pay the Centrix Paybill to open a bigger plan.`;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm ${
        mode === "token" || mode === "trial"
          ? "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100"
          : limited
            ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
            : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
      } ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">{limited || mode === "token" || mode === "trial" ? limitedMessage : licenseWarningMessage(organizationLicense)}</p>
        {canPay ? <LicensePaybillInstructions paybill={organizationLicense.paybill} /> : null}
      </div>
      {canPay ? (
        <Link
          href={renew ? "/subscribe?renew=1&modal=1" : `${licencePlanPath(pathname)}?modal=1`}
          className="shrink-0 text-xs font-semibold underline"
          onClick={() => rememberLicenceReturn(pathname)}
        >
          {renew ? "Renew" : mode === "trial" ? "See modules and pay" : mode === "expired" || mode === "free" ? "Choose a plan" : "View payment options"}
        </Link>
      ) : null}
    </div>
  );
}
