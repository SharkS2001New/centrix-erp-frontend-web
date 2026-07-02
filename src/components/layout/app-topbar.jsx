"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { GlobalModuleSearch } from "@/components/layout/global-module-search";
import { BackgroundTaskHeaderBar } from "@/components/shared/background-task-header-bar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserAccountMenu } from "@/components/layout/user-account-menu";

function MenuIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function AppTopbar({ onToggleSidebar, sidebarCollapsed = false, mobileSidebarOpen = false }) {
  return (
    <>
      <header
        data-app-shell-nav
        data-pos-leave-ignore="true"
        className="app-topbar flex h-[70px] shrink-0 items-center gap-3 border-b px-4 md:px-5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="app-topbar-icon-btn shrink-0 lg:hidden"
            aria-label={mobileSidebarOpen ? "Close menu" : "Open menu"}
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={onToggleSidebar}
            className="app-topbar-icon-btn hidden shrink-0 lg:inline-flex"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar to icons"}
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <GlobalModuleSearch />
          <BackgroundTaskHeaderBar />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <NotificationBell />
          <WorkspaceSwitcher />
          <ThemeToggle compact className="hidden sm:inline-flex" />
          <UserAccountMenu />
        </div>
      </header>
    </>
  );
}
