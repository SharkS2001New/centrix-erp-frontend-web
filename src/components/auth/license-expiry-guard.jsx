"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";
import {
  dismissLicenseWarning,
  isLicenseExpired,
  isLicenseExpiringSoon,
  licenseExpiredMessage,
  licenseWarningMessage,
  wasLicenseWarningDismissed,
} from "@/lib/organization-license";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

/**
 * Enforces org licence lock: expired → sign out all (client fallback).
 * Within 7 days of expiry → always warn on login / session (modal once per tab + banner).
 * Platform super-admins are exempt so they can extend licences.
 */
export function LicenseExpiryGuard({ children }) {
  const { organizationLicense, loading, isSuperAdmin, logout } = useAuth();
  const [promptOpen, setPromptOpen] = useState(false);
  const lockingOut = useRef(false);

  useEffect(() => {
    if (loading || !hasAuthSession() || isSuperAdmin()) return;
    if (!organizationLicense || !isLicenseExpired(organizationLicense)) return;
    if (lockingOut.current) return;
    lockingOut.current = true;
    void logout({ reason: "license" });
  }, [organizationLicense, isSuperAdmin, loading, logout]);

  useEffect(() => {
    if (loading || !hasAuthSession() || isSuperAdmin()) {
      setPromptOpen(false);
      return;
    }
    if (!organizationLicense || isLicenseExpired(organizationLicense)) {
      setPromptOpen(false);
      return;
    }
    if (!isLicenseExpiringSoon(organizationLicense)) {
      setPromptOpen(false);
      return;
    }
    if (wasLicenseWarningDismissed()) {
      setPromptOpen(false);
      return;
    }
    setPromptOpen(true);
  }, [organizationLicense, isSuperAdmin, loading]);

  function handleDismiss() {
    dismissLicenseWarning();
    setPromptOpen(false);
  }

  const expired =
    !loading &&
    hasAuthSession() &&
    !isSuperAdmin() &&
    organizationLicense &&
    isLicenseExpired(organizationLicense);

  if (expired) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-slate-600">
          {licenseExpiredMessage(organizationLicense)} Signing you out…
        </p>
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
              After expiry, all users (web and mobile) are signed out and cannot use Centrix until the
              licence is renewed or extended by the platform administrator.
            </p>
            <div className="mt-5 flex justify-end">
              <PrimaryButton type="button" showIcon={false} onClick={handleDismiss}>
                I understand
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
