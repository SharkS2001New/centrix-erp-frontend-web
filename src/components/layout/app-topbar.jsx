"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { GlobalModuleSearch } from "@/components/layout/global-module-search";
import { BackgroundTaskHeaderBar } from "@/components/shared/background-task-header-bar";
import { AccountingHelpTopbarButton } from "@/components/accounting/accounting-help";
import { DistributionHelpTopbarButton } from "@/components/fulfillment/distribution-help";
import { BookOpen } from "lucide-react";
import { openFirstLoginGuide } from "@/components/shared/first-login-guide";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserAccountMenu } from "@/components/layout/user-account-menu";
import { useAuth } from "@/contexts/auth-context";
import { isYearlyLicence, licenseAccessMode, rememberLicenceReturn, usesPackageOne, yearlyRenewalOpen } from "@/lib/organization-license";

function MenuIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function AppTopbar({ onToggleSidebar, sidebarCollapsed = false, mobileSidebarOpen = false }) {
  const { isSuperAdmin, isOrgAdmin, organizationLicense } = useAuth();
  const pathname = usePathname();
  const hideModuleSearch = Boolean(isSuperAdmin?.());
  const canPay = Boolean(isOrgAdmin?.());
  const yearly = isYearlyLicence(organizationLicense);
  const expired = licenseAccessMode(organizationLicense) === "expired";
  const renew = !expired && yearlyRenewalOpen(organizationLicense);
  const onPackageOne = usesPackageOne(organizationLicense);

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

          {!hideModuleSearch ? <GlobalModuleSearch /> : null}
          <BackgroundTaskHeaderBar />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {canPay && renew ? (
            <Link
              href="/subscribe?renew=1&modal=1"
              onClick={() => rememberLicenceReturn(pathname)}
              className="theme-primary-btn inline-flex shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold"
            >
              Renew
            </Link>
          ) : null}
          {canPay && (!yearly || expired) ? (
            <Link
              href="/subscribe?modal=1"
              onClick={() => rememberLicenceReturn(pathname)}
              className={`${onPackageOne ? "theme-primary-btn" : "theme-secondary-btn"} inline-flex shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold`}
            >
              {onPackageOne || expired ? "Choose a plan" : "Change plan"}
            </Link>
          ) : null}
          <AccountingHelpTopbarButton />
          <DistributionHelpTopbarButton />
          <button
            type="button"
            onClick={() => openFirstLoginGuide("demo")}
            className="app-topbar-icon-btn inline-flex items-center gap-2 px-2"
            aria-label="Open help and guides"
            title="Help & guides"
          >
            <BookOpen className="h-5 w-5" aria-hidden />
            <span className="hidden text-sm font-medium sm:inline">Help</span>
          </button>
          <NotificationBell />
          <WorkspaceSwitcher />
          <ThemeToggle compact className="hidden sm:inline-flex" />
          <UserAccountMenu />
        </div>
      </header>
    </>
  );
}
