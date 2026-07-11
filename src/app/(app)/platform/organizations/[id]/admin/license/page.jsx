"use client";

import AdminLicensePage from "@/app/(app)/admin/license/page";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminLicensePage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "License Information" }]}>
      <AdminLicensePage />
    </PlatformAdminScreen>
  );
}
