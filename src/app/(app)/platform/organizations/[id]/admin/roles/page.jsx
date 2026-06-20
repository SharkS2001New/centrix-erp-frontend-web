"use client";

import AdminRolesPage from "@/app/(app)/admin/roles/page";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminRolesPage() {
  return (
    <PlatformAdminScreen>
      <AdminRolesPage />
    </PlatformAdminScreen>
  );
}
