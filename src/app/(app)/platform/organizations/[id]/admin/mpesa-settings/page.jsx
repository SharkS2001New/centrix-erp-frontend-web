"use client";

import { PlatformAdminMpesaSettingsScreen } from "@/components/tab-screens/admin-mpesa-settings";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminMpesaSettingsPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "M-Pesa settings" }]}>
      <PlatformAdminMpesaSettingsScreen />
    </PlatformAdminScreen>
  );
}
