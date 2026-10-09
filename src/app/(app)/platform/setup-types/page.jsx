"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { PlatformSetupTypesPanel } from "@/components/platform/platform-setup-types-panel";

export default function PlatformSetupTypesPage() {
  return (
    <CatalogPageShell
      title="Setup types"
      subtitle="Applications and menu groups for each setup type, such as Small shop. External POS is listed with the other applications."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Setup types" }]} />
      <PlatformSetupTypesPanel />
    </CatalogPageShell>
  );
}
