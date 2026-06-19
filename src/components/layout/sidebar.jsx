"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { isNavItemActive, isNavSectionActive, isNavItemVisible } from "@/lib/nav-config";
import { defaultWorkspaceId } from "@/lib/workspaces";
import { buildWorkspaceNavSections } from "@/lib/workspace-nav";
import { isPosTillFloatRequired } from "@/lib/sales-settings";
import { CentrixLogo } from "@/components/branding/centrix-logo";
import { PRODUCT_NAME } from "@/lib/branding";
import { NavSectionIcon } from "@/lib/nav-icons";
import { apiRequest } from "@/lib/api";
import { P } from "@/lib/permission-codes";
import {
  buildCustomReportNavItems,
  customReportBelongsToWorkspace,
  injectCustomReportsIntoNavSections,
} from "@/lib/reports/custom-reports";

const STORAGE_KEY = "sidebar-expanded-sections-v2";

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 shrink-0 text-[#abb9e8] transition-transform duration-200 ${
        open ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
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

function NavGroupLabel({ label, inFlyout = false }) {
  return (
    <p
      className={`app-sidebar-group-label pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] first:pt-1 ${
        inFlyout ? "px-4" : "px-[22px]"
      }`}
    >
      {label}
    </p>
  );
}

function SectionNavItems({ items, pathname, onNavigate, inFlyout = false }) {
  let lastGroup = null;

  return items.map((item) => {
    const active = isNavItemActive(item, pathname);
    const showGroup = item.group && item.group !== lastGroup;
    if (showGroup) {
      lastGroup = item.group;
    }

    return (
      <Fragment key={item.href}>
        {showGroup ? <NavGroupLabel label={item.group} inFlyout={inFlyout} /> : null}
        <Link
          href={item.href}
          onClick={onNavigate}
          className={`app-sidebar-link block py-2 text-[13.5px] transition ${
            inFlyout ? "px-4" : "pl-[52px] pr-[18px]"
          } ${active ? "app-sidebar-link-active" : ""}`}
        >
          {item.label}
        </Link>
      </Fragment>
    );
  });
}

function CollapsedSectionIcon({
  section,
  pathname,
  isOpen,
  onToggle,
}) {
  const active = isNavSectionActive(section, pathname);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`app-sidebar-icon-btn flex w-full items-center justify-center py-3 transition ${
        active || isOpen ? "app-sidebar-icon-btn-active" : ""
      }`}
      title={section.label}
      aria-label={section.label}
      aria-expanded={isOpen}
    >
      <NavSectionIcon sectionId={section.id} className="h-[18px] w-[18px] shrink-0" />
    </button>
  );
}

function CollapsibleNavSection({
  section,
  pathname,
  expanded,
  onToggle,
  iconOnly,
  isFlyoutOpen,
  onIconClick,
  onNavigate,
}) {
  if (iconOnly) {
    return (
      <CollapsedSectionIcon
        section={section}
        pathname={pathname}
        isOpen={isFlyoutOpen}
        onToggle={() => onIconClick(section.id)}
      />
    );
  }

  const active = isNavSectionActive(section, pathname);
  const children = (
    <SectionNavItems
      items={section.items}
      pathname={pathname}
      onNavigate={onNavigate}
      inFlyout={false}
    />
  );

  if (!section.collapsible || !section.label) {
    return <div className="space-y-0.5">{children}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(section.id)}
        className={`app-sidebar-section-toggle flex w-full items-center gap-3 px-[18px] py-2.5 text-left text-[14px] font-normal transition ${
          active ? "app-sidebar-section-active" : ""
        }`}
        aria-expanded={expanded}
      >
        <NavSectionIcon sectionId={section.id} className="shrink-0 opacity-90" />
        <span className="min-w-0 flex-1 truncate">{section.label}</span>
        <ChevronIcon open={expanded} />
      </button>
      {expanded ? (
        <div className="app-sidebar-submenu space-y-0.5 pb-1">{children}</div>
      ) : null}
    </div>
  );
}

export function Sidebar({ collapsed = false, mobileOpen = false, onMobileClose }) {
  const pathname = usePathname();
  const { user, organization, capabilities, isModuleEnabled, hasPermission, isSuperAdmin } = useAuth();
  const [activeFlyoutId, setActiveFlyoutId] = useState(null);
  const [customReportTemplates, setCustomReportTemplates] = useState([]);

  const navContext = useMemo(
    () => ({
      isModuleEnabled,
      hasPermission,
      isSuperAdmin,
      requireTillFloat: isPosTillFloatRequired(capabilities?.module_settings),
      user,
      organization,
      capabilities,
    }),
    [capabilities, hasPermission, isModuleEnabled, isSuperAdmin, organization, user],
  );

  const workspaceId =
    getStoredWorkspace() ?? defaultWorkspaceId(capabilities, navContext);

  useEffect(() => {
    if (!hasPermission(P.reports.builder.view)) {
      setCustomReportTemplates([]);
      return;
    }

    apiRequest("/reports/builder/templates", { searchParams: { workspace_id: workspaceId } })
      .then((res) => setCustomReportTemplates(res.data ?? []))
      .catch(() => setCustomReportTemplates([]));
  }, [hasPermission, workspaceId]);

  const customReportNavItems = useMemo(
    () =>
      buildCustomReportNavItems(
        customReportTemplates.filter((template) => customReportBelongsToWorkspace(template, workspaceId)),
      ).filter((item) => isNavItemVisible(item, navContext)),
    [customReportTemplates, navContext, workspaceId],
  );

  const visibleSections = useMemo(
    () =>
      injectCustomReportsIntoNavSections(
        buildWorkspaceNavSections({
          capabilities,
          navContext,
          workspaceId,
          isSuperAdmin,
        }),
        customReportNavItems,
      ),
    [capabilities, customReportNavItems, isSuperAdmin, navContext, workspaceId],
  );

  const [expandedSections, setExpandedSections] = useState(() => {
    const stored = readStoredSections();
    const validIds = new Set(visibleSections.map((s) => s.id));
    if (stored) {
      return new Set(stored.filter((id) => validIds.has(id)));
    }
    return new Set(
      visibleSections
        .filter((s) => s.id === "dashboard" || isNavSectionActive(s, pathname))
        .map((s) => s.id),
    );
  });

  const iconOnly = collapsed && !mobileOpen;
  const activeFlyoutSection = visibleSections.find((s) => s.id === activeFlyoutId) ?? null;
  const showSubnav = iconOnly && activeFlyoutSection != null;

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

  useEffect(() => {
    if (!iconOnly) {
      setActiveFlyoutId(null);
    }
  }, [iconOnly]);

  useEffect(() => {
    setActiveFlyoutId((prev) => {
      if (!prev) return prev;
      return visibleSections.some((s) => s.id === prev) ? prev : null;
    });
  }, [visibleSections]);

  useEffect(() => {
    if (!showSubnav) return undefined;

    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-sidebar-subnav-root]")) return;
      setActiveFlyoutId(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showSubnav]);

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

  const toggleFlyout = useCallback((sectionId) => {
    setActiveFlyoutId((prev) => (prev === sectionId ? null : sectionId));
  }, []);

  const closeOnMobile = useCallback(() => {
    setActiveFlyoutId(null);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      onMobileClose?.();
    }
  }, [onMobileClose]);

  const handleNavigate = useCallback(() => {
    setActiveFlyoutId(null);
    closeOnMobile();
  }, [closeOnMobile]);

  const railWidthClass = iconOnly ? "w-[70px]" : "w-[250px]";
  const visibilityClass = mobileOpen
    ? "translate-x-0"
    : "-translate-x-full lg:translate-x-0";

  return (
    <div
      data-sidebar-subnav-root
      className={`fixed inset-y-0 left-0 z-40 flex shrink-0 transition-transform duration-200 lg:static ${visibilityClass}`}
    >
      <aside
        className={`app-sidebar velzon-sidebar flex h-full min-h-0 shrink-0 flex-col transition-[width] duration-200 ${railWidthClass} ${
          iconOnly ? "velzon-sidebar-collapsed" : ""
        }`}
      >
        <div
          className={`app-sidebar-brand flex h-[70px] shrink-0 items-center ${
            iconOnly ? "justify-center px-0" : "px-[22px]"
          }`}
        >
          <Link href="/dashboard" className="flex items-center" title={PRODUCT_NAME}>
            <CentrixLogo collapsed={iconOnly} />
          </Link>
        </div>

        <OrganizationSwitcher collapsed={iconOnly} />

        {!iconOnly ? (
          <div className="px-[22px] pb-2">
            <p className="app-sidebar-menu-label text-[11px] font-semibold uppercase tracking-[0.12em]">
              Menu
            </p>
          </div>
        ) : null}

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-4">
          {visibleSections.map((section) => (
            <CollapsibleNavSection
              key={section.id}
              section={section}
              pathname={pathname}
              expanded={expandedSections.has(section.id)}
              onToggle={toggleSection}
              iconOnly={iconOnly}
              isFlyoutOpen={activeFlyoutId === section.id}
              onIconClick={toggleFlyout}
              onNavigate={handleNavigate}
            />
          ))}
        </nav>
      </aside>

      {showSubnav ? (
        <aside className="velzon-sidebar-subnav flex h-full w-[220px] shrink-0 flex-col border-l border-white/10 shadow-xl">
          <div className="app-sidebar-subnav-brand flex h-[70px] shrink-0 items-center border-b border-white/10 px-4">
            <p className="truncate text-[14px] font-semibold text-white">
              {activeFlyoutSection.label ?? activeFlyoutSection.id}
            </p>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
            <SectionNavItems
              items={activeFlyoutSection.items}
              pathname={pathname}
              onNavigate={handleNavigate}
              inFlyout
            />
          </nav>
        </aside>
      ) : null}
    </div>
  );
}
