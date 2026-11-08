"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { PlatformSetupTypesPanel } from "@/components/platform/platform-setup-types-panel";

export default function PlatformSetupTypesPage() {
  return (
    <CatalogPageShell
      title="Setup types"
      subtitle="Per industry setup: tick applications, menu parts (Customers, Suppliers, etc.), and which business types appear on Instant trial. Unticked apps stay hidden."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Setup types" }]} />
      <PlatformSetupTypesPanel />
    </CatalogPageShell>
  );
}
