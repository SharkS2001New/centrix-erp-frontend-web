"use client";

import { AdminLicenseScreen } from "@/components/tab-screens/admin-license";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminLicensePage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "License Information" }]}>
      <AdminLicenseScreen />
    </PlatformAdminScreen>
  );
}
