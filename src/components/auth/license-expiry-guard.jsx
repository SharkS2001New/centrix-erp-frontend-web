"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";
import {
  isLicenseExpiringSoon,
  isLimitedLicencePath,
  licenceNeedsPayment,
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
  const { organizationLicense, loading, isSuperAdmin } = useAuth();
  const [promptOpen, setPromptOpen] = useState(false);
  const limited =
    !loading && hasAuthSession() && !isSuperAdmin() && licenceNeedsPayment(organizationLicense);
  const allowed = isLimitedLicencePath(pathname);

  useEffect(() => {
    if (!limited || allowed) return;
    router.replace("/subscribe");
  }, [allowed, limited, router]);

  useEffect(() => {
    if (loading || !hasAuthSession() || isSuperAdmin() || limited) {
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
  }, [organizationLicense, isSuperAdmin, limited, loading]);

  if (limited && !allowed) {
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
