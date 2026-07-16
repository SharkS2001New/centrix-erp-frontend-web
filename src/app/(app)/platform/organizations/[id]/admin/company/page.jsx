"use client";

import { AdminCompanyScreen } from "@/components/tab-screens/admin-company";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminCompanyPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Company profile & logo" }]}>
      <AdminCompanyScreen />
    </PlatformAdminScreen>
  );
}
