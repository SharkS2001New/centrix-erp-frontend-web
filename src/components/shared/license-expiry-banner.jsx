"use client";

import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import {
  isLicenseExpiringSoon,
  licenceNeedsPayment,
  licenseAccessMode,
  licenseWarningMessage,
} from "@/lib/organization-license";
import { LicensePaybillInstructions } from "@/components/shared/license-paybill-instructions";

/**
 * Sticky banner when the org licence is expired or within the 7-day warning window.
 * Super-admins are not blocked by tenant licence state.
 */
export function LicenseExpiryBanner({ className = "" }) {
  const { organizationLicense, isSuperAdmin } = useAuth();

  if (isSuperAdmin?.() || !organizationLicense) return null;

  const limited = licenceNeedsPayment(organizationLicense);
  const soon = isLicenseExpiringSoon(organizationLicense);
  const mode = licenseAccessMode(organizationLicense);
  if (!limited && !soon && mode !== "token" && mode !== "trial") return null;
  const tokenBalance = Number(organizationLicense.token_balance ?? 0);
  const limitedMessage =
    mode === "trial"
      ? `You are on a free trial${organizationLicense.expires_at ? ` until ${organizationLicense.expires_at}` : ""}. Centrix stays open. Pay the Centrix Paybill when you want to keep these modules.`
      : mode === "token"
      ? `This organisation has ${tokenBalance} Centrix token${tokenBalance === 1 ? "" : "s"}. Each create, update, or delete uses 1 token. Reading is free.`
      : mode === "expired"
        ? "This Centrix licence has expired. You can still sign in. Products, customers, suppliers, and sales reports stay open. Pay the Centrix Paybill to restore the modules."
        : "This organisation has no paid Centrix plan yet. Products, customers, suppliers, and sales reports are open. Choose modules and pay the Centrix Paybill to use the rest.";

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
        <LicensePaybillInstructions paybill={organizationLicense.paybill} />
      </div>
      <Link href="/billing" className="shrink-0 text-xs font-semibold underline">
        {mode === "trial" ? "See modules and pay" : limited ? "Choose a plan" : "View payment options"}
      </Link>
    </div>
  );
}
