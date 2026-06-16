"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getSalesOrderQueueWorkflow, salesOrderQueueNavItems } from "@/lib/order-workflow";
import { isMobileOrdersEnabled, isPosTillFloatRequired } from "@/lib/sales-settings";
import { isNavItemActive, isNavSectionActive, isNavItemVisible, navSections } from "@/lib/nav-config";

const STORAGE_KEY = "sidebar-expanded-sections-v2";

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function readStoredSections() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function NavGroupLabel({ label }) {
  return (
    <p className="app-sidebar-group-label px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 first:pt-0">
      {label}
    </p>
  );
}

function CollapsibleNavSection({ section, pathname, expanded, onToggle, children }) {
  const active = isNavSectionActive(section, pathname);

  if (!section.collapsible || !section.label) {
    return <div className="space-y-0.5">{children}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(section.id)}
        className={`app-sidebar-section-label app-sidebar-section-toggle flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider transition ${
          active ? "text-[var(--sidebar-accent,#185FA5)]" : ""
        }`}
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {section.icon ? <span className="text-sm leading-none">{section.icon}</span> : null}
          <span className="truncate">{section.label}</span>
        </span>
        <ChevronIcon open={expanded} />
      </button>
      {expanded ? <div className="mt-0.5 space-y-0.5">{children}</div> : null}
    </div>
  );
}

function SectionNavItems({ items, pathname }) {
  let lastGroup = null;

  return items.map((item) => {
    const active = isNavItemActive(item, pathname);
    const showGroup = item.group && item.group !== lastGroup;
    if (showGroup) {
      lastGroup = item.group;
    }

    return (
      <Fragment key={item.href}>
        {showGroup ? <NavGroupLabel label={item.group} /> : null}
        <Link
          href={item.href}
          className={`app-sidebar-link block rounded-lg px-3 py-2 text-sm font-medium transition ${
            active ? "app-sidebar-link-active" : ""
          }`}
        >
          {item.label}
        </Link>
      </Fragment>
    );
  });
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, organization, capabilities, logout, isModuleEnabled, hasPermission, isSuperAdmin } = useAuth();

  const requireTillFloat = isPosTillFloatRequired(capabilities?.module_settings);

  const salesOrderNavItems = useMemo(() => {
    const workflow = getSalesOrderQueueWorkflow(capabilities, "backend");
    const includeMobile = isMobileOrdersEnabled(capabilities?.module_settings);
    return salesOrderQueueNavItems(workflow, { includeMobile }).map((item) => ({
      href: item.href,
      label: item.label,
      module: "sales.backend",
      permission: "sales.orders.view",
      exact: item.slug === "all",
      group: "Sales orders",
    }));
  }, [capabilities]);

  const navContext = useMemo(
    () => ({
      isModuleEnabled,
      hasPermission,
      isSuperAdmin,
      requireTillFloat,
      user,
      organization,
      capabilities,
    }),
    [capabilities, hasPermission, isModuleEnabled, isSuperAdmin, organization, requireTillFloat, user],
  );

  const visibleSections = useMemo(
    () =>
      navSections
        .filter((section) => !section.superAdminOnly || isSuperAdmin())
        .map((section) => ({
          ...section,
          items: section.items.flatMap((item) => {
            if (item.ordersNav) {
              return salesOrderNavItems.filter((navItem) => isNavItemVisible(navItem, navContext));
            }
            return isNavItemVisible(item, navContext) ? [item] : [];
          }),
        }))
        .filter((section) => section.items.length > 0),
    [isSuperAdmin, navContext, salesOrderNavItems],
  );

  const [expandedSections, setExpandedSections] = useState(() => {
    const stored = readStoredSections();
    const validIds = new Set(navSections.map((s) => s.id));
    if (stored) {
      return new Set(stored.filter((id) => validIds.has(id)));
    }
    return new Set(
      visibleSections
        .filter((s) => s.id === "dashboard" || isNavSectionActive(s, pathname))
        .map((s) => s.id),
    );
  });

  useEffect(() => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      for (const section of visibleSections) {
        if (isNavSectionActive(section, pathname)) {
          next.add(section.id);
        }
      }
      return next;
    });
  }, [pathname, visibleSections]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...expandedSections]));
  }, [expandedSections]);

  const toggleSection = useCallback((sectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  return (
    <aside className="app-sidebar flex h-full min-h-0 w-56 shrink-0 flex-col border-r">
      <OrganizationSwitcher />
      <div className="app-sidebar-divider border-b px-4 py-3">
        <p className="app-sidebar-title text-sm font-semibold">POS / ERP</p>
        <p className="app-sidebar-muted mt-1 truncate text-xs">
          {capabilities?.profile_label ?? capabilities?.deployment_profile}
        </p>
      </div>
      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
        {visibleSections.map((section) => (
          <CollapsibleNavSection
            key={section.id}
            section={section}
            pathname={pathname}
            expanded={expandedSections.has(section.id)}
            onToggle={toggleSection}
          >
            <SectionNavItems items={section.items} pathname={pathname} />
          </CollapsibleNavSection>
        ))}
      </nav>
      <div className="app-sidebar-divider border-t p-4">
        <p className="app-sidebar-muted truncate text-xs">{user?.full_name ?? user?.username}</p>
        <div className="mt-2 flex gap-2">
          <Link
            href="/profile"
            className="app-sidebar-btn flex-1 rounded-lg border px-3 py-1.5 text-center text-xs transition"
          >
            Profile
          </Link>
          <ThemeToggle className="shrink-0" />
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="app-sidebar-btn mt-2 w-full rounded-lg border px-3 py-1.5 text-xs transition"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
