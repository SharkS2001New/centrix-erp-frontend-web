"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";
import {
  isLicenseExpiringSoon,
  isFreePlanPath,
  isLimitedLicencePath,
  licenceNeedsPayment,
  usesPackageOne,
  requiresPaymentOnly,
  licencePlanPath,
  licenseAccessMode,
  externalPosRequiresDatedSubscription,
  parseLicenceInstant,
  rememberLicenceReturn,
  licenseWarningMessage,
  wasLicenseWarningDismissed,
  dismissLicenseWarning,
} from "@/lib/organization-license";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

/**
 * Free organisations may open the plan chooser; expired licences are restricted to it.
 */
export function LicenseExpiryGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { organization, organizationLicense, loading, isSuperAdmin, isOrgAdmin, refreshCapabilities } = useAuth();
  const canPay = Boolean(isOrgAdmin?.());
  const [promptOpen, setPromptOpen] = useState(false);
  const [dismissedExpiredRoute, setDismissedExpiredRoute] = useState(null);
  const planPromptOpenedFor = useRef(null);
  const posNeedsSubscription =
    !loading &&
    hasAuthSession() &&
    !isSuperAdmin() &&
    externalPosRequiresDatedSubscription(organizationLicense) &&
    (pathname === "/pos" || pathname.startsWith("/pos/"));
  const paymentOnly = requiresPaymentOnly(organization, organizationLicense);
  const onPackageOne = !paymentOnly && usesPackageOne(organizationLicense);
  const mode = licenseAccessMode(organizationLicense);
  const limited =
    !loading &&
    hasAuthSession() &&
    !isSuperAdmin() &&
    (licenceNeedsPayment(organizationLicense) || onPackageOne || paymentOnly);
  const allowed = paymentOnly || mode === "expired"
    ? pathname === "/subscribe"
      || pathname.startsWith("/subscribe/")
      || pathname === "/billing"
      || pathname.startsWith("/billing/")
      || (!paymentOnly
        && dismissedExpiredRoute?.organizationId === organization?.id
        && pathname === dismissedExpiredRoute.path)
    : onPackageOne
      ? isFreePlanPath(pathname, organizationLicense)
      : isLimitedLicencePath(pathname);
  const planPath = licencePlanPath(pathname);
  const chooserPath = `${planPath}?modal=1`;
  const choosingPlan =
    pathname === "/subscribe" ||
    pathname.startsWith("/subscribe/") ||
    pathname === "/billing" ||
    pathname.startsWith("/billing/");

  useEffect(() => {
    function onExpiredLicensePromptDismissed(event) {
      const path = String(event.detail?.path || "").split("?")[0].replace(/\/$/, "") || "/";
      setDismissedExpiredRoute({ organizationId: event.detail?.organizationId, path });
    }

    window.addEventListener("centrix:expired-license-prompt-dismissed", onExpiredLicensePromptDismissed);
    return () => window.removeEventListener("centrix:expired-license-prompt-dismissed", onExpiredLicensePromptDismissed);
  }, []);

  useEffect(() => {
    if (mode !== "expired") setDismissedExpiredRoute(null);
  }, [mode, organization?.id]);

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
    if (!posNeedsSubscription || !canPay) return;
    if (pathname === "/subscribe" || pathname.startsWith("/subscribe/")) return;
    rememberLicenceReturn(pathname);
    router.replace("/subscribe?for=pos");
  }, [canPay, pathname, posNeedsSubscription, router]);

  useEffect(() => {
    if (
      planPromptOpenedFor.current === organization?.id ||
      loading ||
      !hasAuthSession() ||
      isSuperAdmin() ||
      !limited ||
      mode === "expired" ||
      !canPay ||
      !organization?.id ||
      choosingPlan
    ) {
      return;
    }

    planPromptOpenedFor.current = organization.id;
    rememberLicenceReturn(pathname);
    router.replace(chooserPath);
  }, [canPay, choosingPlan, isSuperAdmin, limited, loading, mode, organization?.id, pathname, chooserPath, router]);

  useEffect(() => {
    if (!limited || allowed) return;
    if (pathname === planPath || pathname.startsWith(`${planPath}/`)) return;
    rememberLicenceReturn(pathname);
    router.replace(chooserPath);
  }, [allowed, limited, pathname, planPath, chooserPath, router]);

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

  if ((posNeedsSubscription && canPay) || (limited && !allowed)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-slate-600">
          {canPay
            ? "Opening Centrix subscription options…"
            : "This organisation’s licence has expired. Ask your organisation admin to choose a plan."}
        </p>
      </div>
    );
  }

  if (posNeedsSubscription && !canPay) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-slate-600">Ask your organisation admin to pay for Centrix.</p>
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
              {paymentOnly
                ? "After Instant trial ends, CentrixERP opens only the payment screen until you choose a monthly or yearly plan."
                : "After expiry you can still sign in on Package 1, the free plan, until you renew on the Centrix Paybill."}
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
