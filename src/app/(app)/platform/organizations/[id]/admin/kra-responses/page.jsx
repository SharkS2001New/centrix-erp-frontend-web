"use client";

import KraResponsesPage from "@/app/(app)/admin/kra-responses/page";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminKraResponsesPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "KRA device log" }]}>
      <KraResponsesPage />
    </PlatformAdminScreen>
  );
}
