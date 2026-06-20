"use client";

import AdminUsersPage from "@/app/(app)/admin/users/page";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminUsersPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Users" }]}>
      <AdminUsersPage />
    </PlatformAdminScreen>
  );
}
