"use client";

import { PlatformAdminEquityAccountsScreen } from "@/components/tab-screens/admin-equity-accounts";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminEquityAccountsPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Equity Bank accounts" }]}>
      <PlatformAdminEquityAccountsScreen />
    </PlatformAdminScreen>
  );
}
