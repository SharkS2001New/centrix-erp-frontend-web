"use client";

import Link from "next/link";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { ORG_SETTINGS_PLATFORM_MESSAGE } from "@/lib/org-settings-access";

export default function AdminSettingsPage() {
  return (
    <AdminGuard strict>
      <CatalogPageShell
        title="Organization settings"
        subtitle="Operational preferences for sales, finance, inventory, and security."
      >
        <AdminBreadcrumb items={[{ label: "Administration", href: "/admin" }, { label: "Organization settings" }]} />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          <h2 className="font-medium">Managed by the platform</h2>
          <p className="mt-2">{ORG_SETTINGS_PLATFORM_MESSAGE}</p>
          <p className="mt-2 text-xs text-amber-800">
            Checkout rules, M-Pesa, distribution, notifications, session timeouts, and other company-wide
            preferences are configured from Platform administration — not from the tenant Administration workspace.
          </p>
          <Link
            href="/admin"
            className="mt-4 inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
          >
            Back to Administration
          </Link>
        </div>
      </CatalogPageShell>
    </AdminGuard>
  );
}
