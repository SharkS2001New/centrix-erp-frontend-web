"use client";

import Link from "next/link";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { PlatformQuickLinks } from "@/components/platform/platform-quick-links";

export default function PlatformOverviewPage() {
  return (
    <CatalogPageShell
      title="Platform administration"
      subtitle="Register and manage tenant organizations — profile, sales behaviour, modules, and users."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/platform/organizations"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Tenant organizations
          </Link>
          <Link href="/platform/organizations/new">
            <PrimaryButton type="button">Register organization</PrimaryButton>
          </Link>
        </div>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform" }]} />

      <div className="mb-6">
        <PlatformQuickLinks />
      </div>
    </CatalogPageShell>
  );
}
