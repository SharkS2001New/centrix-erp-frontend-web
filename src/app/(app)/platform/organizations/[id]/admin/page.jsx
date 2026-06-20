"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PlatformAdminShell } from "@/components/platform/platform-admin-shell";
import { PLATFORM_ADMIN_LINKS, platformAdminHref, platformOrgSettingsHref } from "@/lib/platform-admin-nav";

export default function PlatformOrganizationAdminPage() {
  const params = useParams();
  const orgId = params?.id;

  return (
    <PlatformAdminShell
      title="Platform admin"
      subtitle="Manage tenant setup while Administration is disabled for this organization."
      breadcrumbTail={[{ label: "Admin hub" }]}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {PLATFORM_ADMIN_LINKS.map((item) => (
          <Link
            key={item.href}
            href={platformAdminHref(orgId, item.href)}
            className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-sm transition hover:border-[#185FA5]/40"
          >
            <p className="theme-heading text-sm font-medium">{item.label}</p>
            <p className="theme-subtext mt-1 text-xs">{item.description}</p>
          </Link>
        ))}
        <Link
          href={platformOrgSettingsHref(orgId)}
          className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-sm transition hover:border-[#185FA5]/40"
        >
          <p className="theme-heading text-sm font-medium">Organization settings</p>
          <p className="theme-subtext mt-1 text-xs">
            Sales, finance, distribution, notifications, and other operational preferences.
          </p>
        </Link>
      </div>
    </PlatformAdminShell>
  );
}
