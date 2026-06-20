"use client";

import VatsPage from "@/app/(app)/vats/page";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminVatsPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "VAT rates" }]}>
      <VatsPage />
    </PlatformAdminScreen>
  );
}
