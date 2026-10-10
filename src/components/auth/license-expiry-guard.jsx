"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";
import {
  isLicenseExpiringSoon,
  isLimitedLicencePath,
  licenceNeedsPayment,
  licencePlanPath,
  externalPosRequiresDatedSubscription,
  parseLicenceInstant,
  rememberLicenceReturn,
  licenseWarningMessage,
  wasLicenseWarningDismissed,
  dismissLicenseWarning,
} from "@/lib/organization-license";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

/**
 * An active free trial uses the whole system.
 * After the trial or a paid period ends, the user stays signed in.
 * Pages outside products, customers, suppliers, and sales reports
 * go to the Centrix payment screen.
 */
export function LicenseExpiryGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { organizationLicense, loading, isSuperAdmin, refreshCapabilities } = useAuth();
  const [promptOpen, setPromptOpen] = useState(false);
  const posNeedsSubscription =
    !loading &&
    hasAuthSession() &&
    !isSuperAdmin() &&
    externalPosRequiresDatedSubscription(organizationLicense) &&
    (pathname === "/pos" || pathname.startsWith("/pos/"));
  const limited =
    !loading && hasAuthSession() && !isSuperAdmin() && licenceNeedsPayment(organizationLicense);
  const allowed = isLimitedLicencePath(pathname);
  const planPath = licencePlanPath(pathname);
  const choosingPlan =
    pathname === "/subscribe" ||
    pathname.startsWith("/subscribe/") ||
    pathname === "/billing" ||
    pathname.startsWith("/billing/");

  useEffect(() => {
    if (loading || !organizationLicense || isSuperAdmin()) return undefined;
    const start = parseLicenceInstant(organizationLicense.starts_at, { dateOnly: "start" });
    const end = parseLicenceInstant(organizationLicense.expires_at, { dateOnly: "end" });
    const next = [start, end]
      .filter(Boolean)
      .map((instant) => instant.getTime())
      .filter((time) => time > Date.now())
      .sort((a, b) => a - b)[0];
    if (!next) return undefined;
    const delay = Math.min(Math.max(next - Date.now() + 1000, 1000), 60 * 60 * 1000);
    const timer = window.setTimeout(() => {
      void refreshCapabilities?.({ force: true });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [isSuperAdmin, loading, organizationLicense, refreshCapabilities]);

  useEffect(() => {
    if (!posNeedsSubscription) return;
    if (pathname === "/subscribe" || pathname.startsWith("/subscribe/")) return;
    rememberLicenceReturn(pathname);
    router.replace("/subscribe?for=pos");
  }, [pathname, posNeedsSubscription, router]);

  useEffect(() => {
    if (!limited || allowed) return;
    if (pathname === planPath || pathname.startsWith(`${planPath}/`)) return;
    rememberLicenceReturn(pathname);
    router.replace(planPath);
  }, [allowed, limited, pathname, planPath, router]);

  useEffect(() => {
    if (loading || !hasAuthSession() || isSuperAdmin() || limited || choosingPlan) {
      setPromptOpen(false);
      return;
    }
    if (!organizationLicense || !isLicenseExpiringSoon(organizationLicense)) {
      setPromptOpen(false);
      return;
    }
    if (wasLicenseWarningDismissed()) {
      setPromptOpen(false);
      return;
    }
    setPromptOpen(true);
  }, [choosingPlan, organizationLicense, isSuperAdmin, limited, loading]);

  if (posNeedsSubscription || (limited && !allowed)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-slate-600">Opening the Centrix payment page…</p>
      </div>
    );
  }

  return (
    <>
      {children}
      {promptOpen && organizationLicense ? (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/50 p-4">
          <div
            className="theme-modal w-full max-w-md rounded-xl border p-6 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="license-warning-title"
          >
            <h2 id="license-warning-title" className="text-base font-semibold text-slate-900">
              Licence expiring soon
            </h2>
            <p className="mt-3 text-sm text-slate-600">{licenseWarningMessage(organizationLicense)}</p>
            <p className="mt-2 text-xs text-slate-500">
              After expiry you can still sign in, but only products, customers, suppliers, and sales reports
              stay open until you renew on the Centrix Paybill.
            </p>
            <div className="mt-5 flex justify-end">
              <PrimaryButton type="button" showIcon={false} onClick={() => { dismissLicenseWarning(); setPromptOpen(false); }}>
                I understand
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
