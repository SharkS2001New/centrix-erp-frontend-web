"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { WorkspaceGuard } from "@/components/auth/workspace-guard";
import { RoutePermissionGuard } from "@/components/route-permission-guard";
import { BackgroundTaskProvider } from "@/contexts/background-task-context";
import { SystemIssueProvider } from "@/contexts/system-issue-context";
import { Sidebar } from "@/components/layout/sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { AiAssistPanel } from "@/components/ai/ai-assist-panel";
import { AppLoadingOverlay } from "@/components/shared/app-loading-overlay";
import { NetworkStatusBanner } from "@/components/shared/network-status-banner";
import { beginPageNavigation, endPageNavigation, getAppLoadingState } from "@/lib/app-loading";

const SIDEBAR_COLLAPSED_KEY = "velzon-sidebar-collapsed";

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell({ children }) {
  const pathname = usePathname();
  const isPos = pathname === "/sales/pos";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(readSidebarCollapsed());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    beginPageNavigation();
    const idle = window.setTimeout(() => {
      if (getAppLoadingState().pending === 0) endPageNavigation();
    }, 400);
    const safety = window.setTimeout(() => endPageNavigation(), 3000);
    return () => {
      window.clearTimeout(idle);
      window.clearTimeout(safety);
    };
  }, [pathname]);

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileSidebarOpen((v) => !v);
      return;
    }
    setSidebarCollapsed((v) => !v);
  }

  return (
    <AuthGuard>
      <WorkspaceGuard>
        <RoutePermissionGuard>
          <SystemIssueProvider>
          <BackgroundTaskProvider>
          <div className="app-shell-bg flex h-screen overflow-hidden">
            <Sidebar
              collapsed={sidebarCollapsed}
              mobileOpen={mobileSidebarOpen}
              onMobileClose={() => setMobileSidebarOpen(false)}
            />
            {mobileSidebarOpen ? (
              <button
                type="button"
                className="fixed inset-0 z-30 bg-black/40 lg:hidden"
                aria-label="Close sidebar"
                onClick={() => setMobileSidebarOpen(false)}
              />
            ) : null}
            <div className="app-content-column flex min-h-0 min-w-0 flex-1 flex-col">
              <AppTopbar
                sidebarCollapsed={sidebarCollapsed}
                mobileSidebarOpen={mobileSidebarOpen}
                onToggleSidebar={toggleSidebar}
              />
              <NetworkStatusBanner />
              <main
                className={
                  isPos
                    ? "app-main-bg flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0"
                    : "app-main-bg min-h-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8"
                }
              >
                {children}
              </main>
            </div>
            <AiAssistPanel />
            <AppLoadingOverlay />
          </div>
          </BackgroundTaskProvider>
          </SystemIssueProvider>
        </RoutePermissionGuard>
      </WorkspaceGuard>
    </AuthGuard>
  );
}
