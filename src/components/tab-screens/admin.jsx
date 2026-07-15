"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminOverviewCards } from "@/components/admin/admin-overview-cards";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

export function AdminScreen() {
  return (
    <CatalogPageShell
      title="Admin home"
      subtitle="Shortcuts to company setup, users, and access control."
    >
      <AdminBreadcrumb items={[{ label: "Admin home" }]} />
      <AdminOverviewCards />
    </CatalogPageShell>
  );
}
