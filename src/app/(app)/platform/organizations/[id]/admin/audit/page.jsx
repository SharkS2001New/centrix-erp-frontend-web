"use client";

import { AdminAuditScreen } from "@/components/tab-screens/admin-audit";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminAuditPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Audit log" }]}>
      <AdminAuditScreen />
    </PlatformAdminScreen>
  );
}
