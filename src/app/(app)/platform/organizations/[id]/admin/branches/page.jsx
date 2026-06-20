"use client";

import AdminBranchesPage from "@/app/(app)/admin/branches/page";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminBranchesPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Branches" }]}>
      <AdminBranchesPage />
    </PlatformAdminScreen>
  );
}
