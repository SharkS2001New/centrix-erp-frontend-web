"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminOverviewCards } from "@/components/admin/admin-overview-cards";
import { AdminSettingsSearch } from "@/components/admin/admin-settings-search";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

export function AdminScreen() {
  return (
    <CatalogPageShell
      title="Admin home"
      subtitle="Search any setting to jump there, or use the shortcuts below."
    >
      <AdminBreadcrumb items={[{ label: "Admin home" }]} />
      <AdminSettingsSearch />
      <AdminOverviewCards />
    </CatalogPageShell>
  );
}
