"use client";

import { Suspense } from "react";
import { PosAuthGuard } from "@/components/auth/pos-auth-guard";
import { PosWorkspaceGuard } from "@/components/auth/pos-workspace-guard";
import { PasswordExpiryGuard } from "@/components/auth/password-expiry-guard";
import { LicenseExpiryGuard } from "@/components/auth/license-expiry-guard";
import { WorkspaceNavigationTracker } from "@/components/layout/workspace-navigation-tracker";
import { NetworkStatusBanner } from "@/components/shared/network-status-banner";
import { LicenseExpiryBanner } from "@/components/shared/license-expiry-banner";
import { OrderPrintTypePickerHost } from "@/components/sales/order-print-type-picker-host";

export function PosShell({ children }) {
  return (
    <PosAuthGuard>
      <Suspense fallback={null}>
        <LicenseExpiryGuard>
          <PasswordExpiryGuard>
            <PosWorkspaceGuard>
              <WorkspaceNavigationTracker />
              <div className="flex h-screen min-h-0 flex-col overflow-hidden app-main-bg">
                <NetworkStatusBanner />
                <LicenseExpiryBanner />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
                <OrderPrintTypePickerHost />
              </div>
            </PosWorkspaceGuard>
          </PasswordExpiryGuard>
        </LicenseExpiryGuard>
      </Suspense>
    </PosAuthGuard>
  );
}
