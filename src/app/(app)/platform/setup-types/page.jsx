"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { PlatformSetupTypesPanel } from "@/components/platform/platform-setup-types-panel";

export default function PlatformSetupTypesPage() {
  return (
    <CatalogPageShell
      title="Setup types"
      subtitle="Configure applications, sales behaviour, order workflows, and business defaults that are applied when an organization uses a setup type."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Setup types" }]} />
      <PlatformSetupTypesPanel />
    </CatalogPageShell>
  );
}
