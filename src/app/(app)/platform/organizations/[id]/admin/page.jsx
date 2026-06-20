"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { OrganizationUsersPanel } from "@/components/admin/organization-platform-config";
import { PlatformAdminShell } from "@/components/platform/platform-admin-shell";

const ADMIN_LINKS = [
  { href: "branches", label: "Branches", description: "Store locations, M-Pesa tills, and branch managers." },
  { href: "roles", label: "Roles & permissions", description: "Role templates and permission assignments." },
  { href: "payment-methods", label: "Payment methods", description: "Cash, M-Pesa, bank, and other tender types." },
  { href: "company", label: "Company profile & logo", description: "Legal identity and branding shown on documents." },
  { href: "audit", label: "Audit log", description: "Who changed what across this organization." },
];

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
        {ADMIN_LINKS.map((item) => (
          <Link
            key={item.href}
            href={`/platform/organizations/${orgId}/admin/${item.href}`}
            className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-sm transition hover:border-[#185FA5]/40"
          >
            <p className="theme-heading text-sm font-medium">{item.label}</p>
            <p className="theme-subtext mt-1 text-xs">{item.description}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <OrganizationUsersPanel organizationId={orgId} detailed />
      </div>
    </PlatformAdminShell>
  );
}
