"use client";

import { AdminBranchesScreen } from "@/components/tab-screens/admin-branches";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminBranchesPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Branches" }]}>
      <AdminBranchesScreen />
    </PlatformAdminScreen>
  );
}
