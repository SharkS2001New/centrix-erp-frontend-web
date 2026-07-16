"use client";

import { AdminRolesScreen } from "@/components/tab-screens/admin-roles";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminRolesPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Roles & permissions" }]}>
      <AdminRolesScreen />
    </PlatformAdminScreen>
  );
}
