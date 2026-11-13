"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Armchair,
  BarChart3,
  Bot,
  Calendar,
  CreditCard,
  Gift,
  LayoutDashboard,
  Megaphone,
  MoreHorizontal,
  Package,
  Receipt,
  Scissors,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  UserRound,
} from "lucide-react";
import { CentrixLogo } from "@/components/branding/centrix-logo";
import { AppTopbar } from "@/components/layout/app-topbar";
import { useAuth } from "@/contexts/auth-context";
import { isSpaFeatureEnabled } from "@/lib/org-settings-tabs";
import { LicenseExpiryBanner } from "@/components/shared/license-expiry-banner";
import { NetworkStatusBanner } from "@/components/shared/network-status-banner";
import { useSpa } from "@/lib/spa/store";
import { Button } from "@/components/spa/ui";

const SIDEBAR_COLLAPSED_KEY = "velzon-sidebar-collapsed";

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

const NAV = [
  { href: "/spa", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/spa/appointments", label: "Appointments & Calendar", icon: Calendar, feature: "appointments" },
  { href: "/spa/pos", label: "POS & Billing", icon: ShoppingBag, feature: "pos" },
  { href: "/spa/services", label: "Services & Treatments", icon: Scissors, feature: "services" },
  { href: "/spa/clients", label: "Customers / CRM", icon: Users, feature: "clients" },
  { href: "/spa/staff", label: "Staff & Commissions", icon: UserRound, feature: "staff" },
  { href: "/spa/rooms", label: "Rooms & Resources", icon: Armchair, feature: "rooms" },
  { href: "/spa/inventory", label: "Products & Inventory", icon: Package, feature: "inventory" },
  { href: "/spa/memberships", label: "Memberships & Packages", icon: Gift, feature: "packages" },
  { href: "/spa/expenses", label: "Expenses & Payments", icon: Receipt, feature: "expenses" },
  { href: "/spa/suppliers", label: "Suppliers", icon: Truck, feature: "suppliers" },
  { href: "/spa/reports", label: "Reports & Analytics", icon: BarChart3, feature: "reports" },
  { href: "/spa/booking", label: "Online Booking", icon: CreditCard, feature: "appointments" },
  { href: "/spa/marketing", label: "Marketing", icon: Megaphone, feature: "clients" },
  { href: "/spa/assistant", label: "AI Assistant", icon: Bot },
  { href: "/spa/settings", label: "Settings & Permissions", icon: Settings },
];

export function SpaFrame({ children }) {
  const pathname = usePathname();
  const { organization, capabilities } = useAuth();
  const spa = useSpa();
  const nav = NAV.filter((item) => {
    if (item.feature === "rooms") {
      return spa.features?.rooms || spa.features?.chairs || isSpaFeatureEnabled(capabilities, "appointments");
    }
    if (item.feature === "packages") {
      return spa.features?.packages || isSpaFeatureEnabled(capabilities, "services");
    }
    return !item.feature || isSpaFeatureEnabled(capabilities, item.feature);
  });
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const iconOnly = collapsed && !open;

  const branches = useMemo(() => {
    const list = Array.isArray(spa.branches) ? spa.branches.filter(Boolean) : [];
    if (spa.branch && !list.includes(spa.branch)) list.unshift(spa.branch);
    return list.length ? list : ["Main"];
  }, [spa.branches, spa.branch]);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setOpen((current) => !current);
      return;
    }
    setCollapsed((current) => !current);
  }

  const phoneNav = [
    { href: "/spa", label: "Home", icon: LayoutDashboard, exact: true },
    { href: "/spa/appointments", label: "Book", icon: Calendar, feature: "appointments" },
    { href: "/spa/pos", label: "Till", icon: ShoppingBag, feature: "pos" },
    { href: "/spa/clients", label: "Clients", icon: Users, feature: "clients" },
  ].filter((item) => !item.feature || isSpaFeatureEnabled(capabilities, item.feature));

  return (
    <div className="app-shell-bg flex h-dvh overflow-hidden">
      {open ? (
        <button type="button" className="fixed inset-0 z-[35] bg-black/40 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />
      ) : null}
      <div className={`fixed inset-y-0 left-0 z-40 flex shrink-0 transition-transform duration-200 lg:static ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <aside className={`app-sidebar velzon-sidebar flex h-full min-h-0 shrink-0 flex-col transition-[width] duration-200 ${iconOnly ? "w-[70px] velzon-sidebar-collapsed" : "w-[264px]"}`}>
          <div className={`app-sidebar-brand flex h-[70px] shrink-0 items-center ${iconOnly ? "justify-center px-0" : "px-[22px]"}`}>
            <Link href="/spa" className="flex items-center" title={organization?.org_name || "Centrix ERP"}>
              <CentrixLogo collapsed={iconOnly} orgSubtitle={organization?.org_name} />
            </Link>
          </div>
          {!iconOnly ? (
            <div className="border-b border-white/10 px-3 pb-3">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-white/60">
                Branch
              </label>
              <select
                className="w-full rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 text-sm text-white outline-none"
                value={spa.branch || branches[0]}
                onChange={(e) => spa.setBranch?.(e.target.value)}
                aria-label="Branch"
              >
                {branches.map((branch) => (
                  <option key={branch} value={branch} className="text-slate-900">
                    {branch}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-4 pt-1" aria-label="SPA and Kinyozi">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => setOpen(false)}
                  className={`app-sidebar-link flex items-center transition ${iconOnly ? "app-sidebar-icon-btn justify-center py-3" : "gap-3 px-[18px] py-2.5 text-[14px] leading-snug"} ${active ? (iconOnly ? "app-sidebar-icon-btn-active" : "app-sidebar-link-active") : ""}`}
                >
                  <Icon size={18} className="shrink-0" />
                  {iconOnly ? <span className="sr-only">{item.label}</span> : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>
      </div>
      <div className="app-content-column flex min-h-0 min-w-0 flex-1 flex-col">
        <AppTopbar onToggleSidebar={toggleSidebar} sidebarCollapsed={collapsed} mobileSidebarOpen={open} />
        <NetworkStatusBanner />
        <LicenseExpiryBanner />
        <div className="app-main-bg flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 md:p-6 lg:pb-6">{children}</div>
        <nav className="app-topbar fixed inset-x-0 bottom-0 z-30 grid border-t pb-[env(safe-area-inset-bottom)] md:hidden" style={{ gridTemplateColumns: `repeat(${phoneNav.length + 1}, minmax(0, 1fr))` }} aria-label="Spa and Kinyozi">
          {phoneNav.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${active ? "text-[var(--theme-primary)]" : ""}`}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <button type="button" className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${open ? "text-[var(--theme-primary)]" : ""}`} onClick={() => setOpen(true)}>
            <MoreHorizontal size={18} />
            More
          </button>
        </nav>
      </div>
    </div>
  );
}

export function BusinessChooser({ onChoose }) {
  const options = [
    { id: "spa", title: "Centrix SPA", detail: "Therapist scheduling, treatment rooms, packages and session tracking." },
    { id: "kinyozi", title: "Centrix Kinyozi", detail: "Walk-in checkout, barber assignment, chairs and service combos." },
    { id: "combined", title: "SPA & Kinyozi", detail: "One shop with both treatment rooms and barber chairs." },
  ];
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="w-full max-w-4xl">
        <p className="text-center text-sm font-medium text-[var(--theme-accent-text)]">Business type</p>
        <h1 className="theme-heading mt-2 text-center text-2xl font-medium">How does this branch work?</h1>
        <p className="theme-subtext mx-auto mt-2 max-w-xl text-center text-sm">This choice turns on the tools that match the shop. You can change it later in Settings & Permissions.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {options.map((option) => (
            <article key={option.id} className="theme-panel flex flex-col rounded-xl border p-5 shadow-sm">
              <h2 className="theme-heading text-lg font-semibold">{option.title}</h2>
              <p className="theme-subtext mt-2 flex-1 text-sm">{option.detail}</p>
              <Button className="mt-5" onClick={() => onChoose(option.id)}>Select</Button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
