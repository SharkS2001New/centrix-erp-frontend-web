"use client";

import { SuperAdminGuard } from "@/components/admin/super-admin-guard";
import { PlatformTwoFactorGate } from "@/components/platform/platform-two-factor-gate";

export default function PlatformLayout({ children }) {
  return (
    <SuperAdminGuard>
      <PlatformTwoFactorGate>{children}</PlatformTwoFactorGate>
    </SuperAdminGuard>
  );
}
