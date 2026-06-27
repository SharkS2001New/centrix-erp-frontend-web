"use client";

import { Suspense } from "react";
import { PosAuthGuard } from "@/components/auth/pos-auth-guard";
import { PosWorkspaceGuard } from "@/components/auth/pos-workspace-guard";
import { PasswordExpiryGuard } from "@/components/auth/password-expiry-guard";
import { WorkspaceNavigationTracker } from "@/components/layout/workspace-navigation-tracker";
import { NetworkStatusBanner } from "@/components/shared/network-status-banner";

export function PosShell({ children }) {
  return (
    <PosAuthGuard>
      <Suspense fallback={null}>
        <PasswordExpiryGuard>
          <PosWorkspaceGuard>
            <WorkspaceNavigationTracker />
            <div className="flex h-screen min-h-0 flex-col overflow-hidden app-main-bg">
              <NetworkStatusBanner />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </div>
          </PosWorkspaceGuard>
        </PasswordExpiryGuard>
      </Suspense>
    </PosAuthGuard>
  );
}
