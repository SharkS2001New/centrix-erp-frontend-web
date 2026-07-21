"use client";

import Link from "next/link";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import { useAuth } from "@/contexts/auth-context";
import { platformOrgSettingsHref } from "@/lib/org-settings-access";

export function AccountingSettingsScreen() {
  const { organization, isSuperAdmin } = useAuth();
  const platformHref =
    isSuperAdmin?.() && organization?.id ? platformOrgSettingsHref(organization.id) : null;

  return (
    <CatalogPageShell
      title="Accounting settings"
      subtitle="Auto-posting, ledger mode, and GL account codes"
    >
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <p className="text-sm text-slate-700">
          <OrgSettingsPlatformHint area="Accounting settings" />
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Auto-post toggles, built-in vs external ledger mode, and default GL account codes are configured per
          organization by platform administrators. This prevents accidental changes during day-to-day accounting work.
        </p>
        {platformHref ? (
          <Link
            href={platformHref}
            className="mt-4 inline-flex text-sm font-medium text-[#185FA5] hover:underline"
          >
            Open organization settings (platform) → Accounting
          </Link>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Contact your platform administrator if books setup or auto-posting needs to change.
          </p>
        )}
      </section>
    </CatalogPageShell>
  );
}
