"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminOverviewCards } from "@/components/admin/admin-overview-cards";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

export function AdminScreen() {
  return (
    <CatalogPageShell
      title="Admin home"
      subtitle="Use the top search to find any setting, user, or page — or open a shortcut below."
    >
      <AdminBreadcrumb items={[{ label: "Admin home" }]} />
      <AdminOverviewCards />
    </CatalogPageShell>
  );
}
