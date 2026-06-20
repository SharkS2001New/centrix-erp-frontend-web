"use client";

import AdminAuditPage from "@/app/(app)/admin/audit/page";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminAuditPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Audit log" }]}>
      <AdminAuditPage />
    </PlatformAdminScreen>
  );
}
