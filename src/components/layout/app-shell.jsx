"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { RoutePermissionGuard } from "@/components/route-permission-guard";
import { Sidebar } from "@/components/layout/sidebar";
import { AiAssistPanel } from "@/components/ai/ai-assist-panel";

export function AppShell({ children }) {
  const pathname = usePathname();
  const isPos = pathname === "/sales/pos";

  return (
    <AuthGuard>
      <RoutePermissionGuard>
        <div className="app-shell-bg flex h-screen overflow-hidden">
          <Sidebar />
          <main
            className={
              isPos
                ? "app-main-bg flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                : "app-main-bg min-h-0 flex-1 overflow-y-auto p-6 md:p-8"
            }
          >
            {children}
          </main>
          <AiAssistPanel />
        </div>
      </RoutePermissionGuard>
    </AuthGuard>
  );
}
