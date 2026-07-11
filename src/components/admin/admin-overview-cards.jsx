"use client";

import { AppNavLink } from "@/components/layout/app-nav-link";
import { useAuth } from "@/contexts/auth-context";
import { workspaceCardClassName } from "@/components/catalog/catalog-shared";
import { canAccessOrgAdminSettings } from "@/lib/admin-scope";
import { resolveTillFloatNavFlag } from "@/lib/access-control";
import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { P } from "@/lib/permission-codes";

const CARDS = [
  {
    href: "/admin/settings",
    title: "Organization settings",
    description: "Sales, inventory, finance, HR, notifications, security, and AI preferences.",
    icon: "⚙️",
    permission: "admin.manage",
  },
  {
    href: "/admin/company",
    title: "Company profile",
    description: "Manage organization info, registration details, and logo.",
    icon: "🏢",
    permission: P.admin.company.view,
  },
  {
    href: "/admin/license",
    title: "License Information",
    description: "View your Centrix plan, attached invoice, and contracts.",
    icon: "📜",
    permission: P.admin.company.view,
  },
  {
    href: "/admin/branches",
    title: "Branches",
    description: "Manage branch locations, contacts, and status.",
    icon: "🏬",
    permission: P.admin.branches.view,
  },
  {
    href: "/admin/users",
    title: "Users",
    description: "Create users, assign branches and roles.",
    icon: "👤",
    permission: P.admin.users.view,
  },
  {
    href: "/admin/roles",
    title: "Roles & permissions",
    description: "Define roles and control module access levels.",
    icon: "🔐",
    permission: P.admin.roles.view,
  },
  {
    href: "/admin/audit",
    title: "Audit trail",
    description: "View system activity and change history.",
    icon: "📜",
    permission: P.admin.audit.view,
  },
];

let adminNavByHrefCache = null;

function getAdminNavByHref() {
  if (!adminNavByHrefCache) {
    adminNavByHrefCache = new Map(
      navSections
        .filter((section) => String(section.id ?? "").startsWith("admin"))
        .flatMap((section) => section.items ?? [])
        .map((item) => [item.href, item]),
    );
  }
  return adminNavByHrefCache;
}

export function AdminOverviewCards() {
  const { hasPermission, isModuleEnabled, isSuperAdmin, organization, user, capabilities } = useAuth();
  const orgAdminOk = canAccessOrgAdminSettings({
    organization,
    isSuperAdmin,
    hasPermission,
    user,
    capabilities,
  });
  const navContext = {
    hasPermission,
    isModuleEnabled,
    isSuperAdmin,
    organization,
    user,
    capabilities,
    requireTillFloat: resolveTillFloatNavFlag(capabilities),
  };
  const visible = CARDS.filter((card) => {
    if (!orgAdminOk) return false;
    const navItem = getAdminNavByHref().get(card.href);
    if (navItem) {
      return isNavItemVisible(navItem, navContext);
    }
    return hasPermission(card.permission);
  });

  if (visible.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-6 text-sm theme-subtext">
        You do not have access to any administration modules.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((card) => (
        <AppNavLink
          key={card.href}
          href={card.href}
          className={`group ${workspaceCardClassName} p-5 transition hover:border-[color-mix(in_srgb,var(--theme-primary)_30%,var(--theme-border))] hover:shadow-md`}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>
              {card.icon}
            </span>
            <div>
              <h2 className="theme-heading text-[15px] font-medium group-hover:text-[var(--theme-accent-text)]">
                {card.title}
              </h2>
              <p className="theme-subtext mt-1 text-sm">{card.description}</p>
            </div>
          </div>
        </AppNavLink>
      ))}
    </div>
  );
}
