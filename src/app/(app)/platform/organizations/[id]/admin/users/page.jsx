"use client";

import { AdminUsersScreen } from "@/components/tab-screens/admin-users";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminUsersPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Users" }]}>
      <AdminUsersScreen />
    </PlatformAdminScreen>
  );
}
