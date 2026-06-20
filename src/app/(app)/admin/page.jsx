"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminOverviewCards } from "@/components/admin/admin-overview-cards";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

export default function AdminOverviewPage() {
  return (
    <CatalogPageShell
      title="Admin home"
      subtitle="Shortcuts to company setup, users, access control, and organization settings."
    >
      <AdminBreadcrumb items={[{ label: "Admin home" }]} />
      <AdminOverviewCards />
    </CatalogPageShell>
  );
}
