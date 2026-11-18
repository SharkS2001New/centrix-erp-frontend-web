"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { PlatformSetupTypesPanel } from "@/components/platform/platform-setup-types-panel";

export default function PlatformSetupTypesPage() {
  return (
    <CatalogPageShell
      title="Setup types"
      subtitle="Create per-industry setup types, then configure their applications, sidebar features, menus, and Instant trial business types."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Setup types" }]} />
      <PlatformSetupTypesPanel />
    </CatalogPageShell>
  );
}
