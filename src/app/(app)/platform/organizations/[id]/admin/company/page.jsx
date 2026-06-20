"use client";

import AdminCompanyPage from "@/app/(app)/admin/company/page";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminCompanyPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Company profile" }]}>
      <AdminCompanyPage />
    </PlatformAdminScreen>
  );
}
