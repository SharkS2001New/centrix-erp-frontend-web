"use client";

import { PlatformAdminMpesaPaybillsScreen } from "@/components/tab-screens/admin-mpesa-paybills";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminMpesaPaybillsPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "M-Pesa Paybills" }]}>
      <PlatformAdminMpesaPaybillsScreen />
    </PlatformAdminScreen>
  );
}
