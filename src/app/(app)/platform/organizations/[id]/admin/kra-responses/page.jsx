"use client";

import { AdminKraResponsesScreen } from "@/components/tab-screens/admin-kra-responses";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminKraResponsesPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "KRA device log" }]}>
      <AdminKraResponsesScreen />
    </PlatformAdminScreen>
  );
}
