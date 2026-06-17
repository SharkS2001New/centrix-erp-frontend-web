"use client";

import { PosAuthGuard } from "@/components/auth/pos-auth-guard";
import { PosWorkspaceGuard } from "@/components/auth/pos-workspace-guard";

export function PosShell({ children }) {
  return (
    <PosAuthGuard>
      <PosWorkspaceGuard>
        <div className="flex h-screen min-h-0 flex-col overflow-hidden app-main-bg">{children}</div>
      </PosWorkspaceGuard>
    </PosAuthGuard>
  );
}
