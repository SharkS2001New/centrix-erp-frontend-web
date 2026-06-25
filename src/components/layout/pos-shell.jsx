"use client";

import { Suspense } from "react";
import { PosAuthGuard } from "@/components/auth/pos-auth-guard";
import { PosWorkspaceGuard } from "@/components/auth/pos-workspace-guard";
import { PasswordExpiryGuard } from "@/components/auth/password-expiry-guard";

export function PosShell({ children }) {
  return (
    <PosAuthGuard>
      <Suspense fallback={null}>
        <PasswordExpiryGuard>
          <PosWorkspaceGuard>
            <div className="flex h-screen min-h-0 flex-col overflow-hidden app-main-bg">{children}</div>
          </PosWorkspaceGuard>
        </PasswordExpiryGuard>
      </Suspense>
    </PosAuthGuard>
  );
}
