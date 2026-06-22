"use client";

import { PosAuthGuard } from "@/components/auth/pos-auth-guard";
import { PosWorkspaceGuard } from "@/components/auth/pos-workspace-guard";
import { MustChangePasswordGuard } from "@/components/auth/must-change-password-guard";

export function PosShell({ children }) {
  return (
    <PosAuthGuard>
      <MustChangePasswordGuard>
        <PosWorkspaceGuard>
          <div className="flex h-screen min-h-0 flex-col overflow-hidden app-main-bg">{children}</div>
        </PosWorkspaceGuard>
      </MustChangePasswordGuard>
    </PosAuthGuard>
  );
}
