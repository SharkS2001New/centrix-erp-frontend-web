"use client";

import { PlatformAdminKraSettingsScreen } from "@/components/tab-screens/admin-kra-settings";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminKraSettingsPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "KRA settings" }]}>
      <PlatformAdminKraSettingsScreen />
    </PlatformAdminScreen>
  );
}
