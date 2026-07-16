"use client";

import { VatsScreen } from "@/components/tab-screens/vats";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminVatsPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "VAT rates" }]}>
      <VatsScreen />
    </PlatformAdminScreen>
  );
}
