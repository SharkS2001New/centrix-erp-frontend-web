"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { WorkspaceGuard } from "@/components/auth/workspace-guard";
import { RoutePermissionGuard } from "@/components/route-permission-guard";
import { BackgroundTaskProvider } from "@/contexts/background-task-context";
import { TabWorkspaceProvider } from "@/contexts/tab-workspace-context";
import { SystemIssueProvider } from "@/contexts/system-issue-context";
import { AppErrorBoundary } from "@/components/shared/app-error-boundary";
import { GlobalErrorCapture } from "@/components/shared/global-error-capture";
import { WorkspaceNavigationTracker } from "@/components/layout/workspace-navigation-tracker";
import { Sidebar } from "@/components/layout/sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { WorkspaceTabBar } from "@/components/layout/workspace-tab-bar";
import { TabWorkspaceMain } from "@/components/layout/tab-workspace-main";
import { AccountingHelpDialog } from "@/components/accounting/accounting-help";
import { OrderPrintTypePickerHost } from "@/components/sales/order-print-type-picker-host";
import { AiAssistPanel } from "@/components/ai/ai-assist-panel";
import { AppRouteLoading } from "@/components/shared/app-route-loading";
import { useNavigationBusy, usePendingNavigationHref } from "@/components/shared/navigation-progress-bar";
import { NetworkStatusBanner } from "@/components/shared/network-status-banner";
import {
  beginNavigationIntent,
  finishNavigation,
} from "@/lib/app-loading";
import { handleNavigationIntentClick } from "@/lib/navigation-intent";

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
  const navigationBusy = useNavigationBusy();
  const pendingHref = usePendingNavigationHref();
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
    document.addEventListener("click", handleNavigationIntentClick, true);
    return () => document.removeEventListener("click", handleNavigationIntentClick, true);
  }, []);

  useEffect(() => {
    function onPopState() {
      beginNavigationIntent("Opening page…", window.location.pathname);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const safetyTimer = window.setTimeout(() => finishNavigation(), 10000);
    return () => window.clearTimeout(safetyTimer);
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
      <WorkspaceNavigationTracker />
      <WorkspaceGuard>
        <RoutePermissionGuard>
          <SystemIssueProvider>
          <GlobalErrorCapture />
          <BackgroundTaskProvider>
          <TabWorkspaceProvider>
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
              <WorkspaceTabBar />
              <main
                className={
                  isPos
                    ? "app-main-bg relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0"
                    : "app-main-bg relative min-h-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8"
                }
                aria-busy={navigationBusy || undefined}
              >
                <AppErrorBoundary>
                  <div className={isPos ? "flex min-h-0 min-w-0 flex-1 flex-col" : "flex min-h-0 min-w-0 flex-1 flex-col"}>
                    <TabWorkspaceMain>{children}</TabWorkspaceMain>
                  </div>
                </AppErrorBoundary>
                {navigationBusy ? (
                  <div
                    className={
                      isPos
                        ? "absolute inset-0 z-10 overflow-hidden bg-[var(--theme-page-bg)]"
                        : "absolute inset-0 z-10 overflow-y-auto bg-[var(--theme-page-bg)] p-4 md:p-6 lg:p-8"
                    }
                  >
                    <AppRouteLoading pathname={pendingHref ?? pathname} />
                  </div>
                ) : null}
              </main>
            </div>
            <AiAssistPanel />
            <OrderPrintTypePickerHost />
            <AccountingHelpDialog />
          </div>
          </TabWorkspaceProvider>
          </BackgroundTaskProvider>
          </SystemIssueProvider>
        </RoutePermissionGuard>
      </WorkspaceGuard>
    </AuthGuard>
  );
}
