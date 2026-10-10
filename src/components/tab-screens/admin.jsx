"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminOverviewCards } from "@/components/admin/admin-overview-cards";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { useAuth } from "@/contexts/auth-context";
import { isSpaIndustry } from "@/lib/org-settings-tabs";

export function AdminScreen() {
  const { capabilities } = useAuth();
  return (
    <CatalogPageShell
      title="Admin home"
      subtitle={
        isSpaIndustry(capabilities)
          ? "Company, branches, users, and roles for this salon or barbershop. Day-to-day work stays in SPA & Kinyozi."
          : "Use the top search to find any setting, user, or page — or open a shortcut below."
      }
    >
      <AdminBreadcrumb items={[{ label: "Admin home" }]} />
      <AdminOverviewCards />
    </CatalogPageShell>
  );
}
