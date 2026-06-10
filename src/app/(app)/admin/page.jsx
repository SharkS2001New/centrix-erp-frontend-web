"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminOverviewCards } from "@/components/admin/admin-overview-cards";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

export default function AdminOverviewPage() {
  return (
    <CatalogPageShell
      title="Administration"
      subtitle="Manage company profile, users, access control, and system configuration."
    >
      <AdminBreadcrumb items={[{ label: "Administration" }]} />
      <AdminOverviewCards />
    </CatalogPageShell>
  );
}
