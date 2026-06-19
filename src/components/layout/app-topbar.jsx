"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { useLockScreen } from "@/contexts/lock-screen-context";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ProfileModal } from "@/components/layout/profile-modal";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { GlobalModuleSearch } from "@/components/layout/global-module-search";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { workspaceDefinition } from "@/lib/workspaces";

function MenuIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function UserAvatar({ name }) {
  const initial = (name?.trim()?.[0] ?? "U").toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#405189] text-xs font-semibold text-white">
      {initial}
    </span>
  );
}

function accessSubtitle(user, capabilities) {
  if (user?.is_super_admin || capabilities?.is_super_admin) return "Platform admin";
  if (user?.is_admin || capabilities?.is_admin) return "Administrator";
  return user?.access_scope === "org" ? "Organization" : "Branch user";
}

export function AppTopbar({ onToggleSidebar, sidebarCollapsed = false, mobileSidebarOpen = false }) {
  const { user, organization, capabilities, logout, memberships } = useAuth();
  const { lockScreen } = useLockScreen();
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const workspaceId = getStoredWorkspace();
  const workspace = workspaceId ? workspaceDefinition(workspaceId, capabilities) : null;
  const displayName = user?.full_name ?? user?.username ?? "User";
  const roleLabel = useMemo(() => accessSubtitle(user, capabilities), [capabilities, user]);

  return (
    <>
      <header className="app-topbar flex h-[70px] shrink-0 items-center gap-3 border-b px-4 md:px-5">
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
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <WorkspaceSwitcher />
          <ThemeToggle compact className="hidden sm:inline-flex" />

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="app-topbar-user-btn flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition sm:pr-2.5"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <UserAvatar name={displayName} />
              <span className="hidden text-left md:block">
                <span className="block max-w-[140px] truncate text-sm font-semibold leading-tight">
                  {displayName}
                </span>
                <span className="block max-w-[140px] truncate text-[11px] leading-tight opacity-70">
                  {roleLabel}
                </span>
              </span>
            </button>

            {menuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="velzon-user-dropdown absolute right-0 z-50 mt-2 w-56 py-2 shadow-lg" role="menu">
                  <div className="border-b px-4 py-3">
                    <p className="truncate text-sm font-semibold">{displayName}</p>
                    <p className="truncate text-xs opacity-70">{user?.email ?? user?.username}</p>
                    {workspace ? (
                      <p className="mt-1 truncate text-[11px] opacity-60">{workspace.label}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="velzon-user-dropdown-item flex w-full px-4 py-2 text-left text-sm"
                    onClick={() => {
                      setMenuOpen(false);
                      setProfileOpen(true);
                    }}
                  >
                    My profile
                  </button>
                  {(memberships?.length ?? 0) > 1 ? (
                    <Link
                      href="/choose-workspace"
                      role="menuitem"
                      className="velzon-user-dropdown-item block px-4 py-2 text-sm"
                      onClick={() => setMenuOpen(false)}
                    >
                      Switch organization
                    </Link>
                  ) : null}
                  <div className="my-1 border-t sm:hidden">
                    <div className="px-3 py-2">
                      <ThemeToggle className="w-full justify-center" />
                    </div>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="velzon-user-dropdown-item flex w-full px-4 py-2 text-left text-sm"
                    onClick={() => {
                      setMenuOpen(false);
                      lockScreen();
                    }}
                  >
                    Lock screen
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="velzon-user-dropdown-item flex w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400"
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
