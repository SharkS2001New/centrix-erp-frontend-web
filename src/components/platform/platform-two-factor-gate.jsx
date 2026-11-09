"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { ProfileTwoFactorSection } from "@/components/layout/profile-two-factor-section";

/**
 * Blocks platform tools until the signed-in platform admin enables 2FA.
 * Auth /2fa setup endpoints remain available (not behind erp.super_admin).
 */
export function PlatformTwoFactorGate({ children }) {
  const { loading, capabilities, refreshCapabilities } = useAuth();
  const required = Boolean(capabilities?.platform_two_factor_required);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!required) {
    return children;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Two-factor authentication required</p>
        <p className="mt-1 text-amber-900/90">
          Every platform administrator must enable 2FA (email or Google Authenticator) before using
          platform tools. Set it up below, then continue.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <ProfileTwoFactorSection
          onEnabled={() => {
            void refreshCapabilities?.({ force: true });
          }}
        />
      </div>
      <p className="text-xs text-slate-500">
        You can also open{" "}
        <Link href="/profile" className="font-medium text-[#185FA5] hover:underline">
          My profile
        </Link>{" "}
        later to review security settings. Platform admin 2FA cannot be turned off.
      </p>
    </div>
  );
}
