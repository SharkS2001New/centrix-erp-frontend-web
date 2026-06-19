"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { ProfilePanel } from "@/components/layout/profile-panel";

export default function ProfilePage() {
  return (
    <CatalogPageShell title="My profile" subtitle="Account details and security.">
      <AdminBreadcrumb items={[{ label: "Profile" }]} />
      <div className="mt-6">
        <ProfilePanel />
      </div>
    </CatalogPageShell>
  );
}
