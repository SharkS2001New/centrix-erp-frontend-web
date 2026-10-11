"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Package,
  Receipt,
  Scissors,
  ShoppingBag,
  Truck,
  Users,
  UserRound,
} from "lucide-react";
import { CentrixLogoMark } from "@/components/branding/centrix-logo-mark";
import { GlobalModuleSearch } from "@/components/layout/global-module-search";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserAccountMenu } from "@/components/layout/user-account-menu";
import { LicenseExpiryBanner } from "@/components/shared/license-expiry-banner";
import { NetworkStatusBanner } from "@/components/shared/network-status-banner";
import { formatLong, todayISO } from "@/lib/spa/format";
import { Button } from "@/components/spa/ui";

const NAV = [
  { href: "/spa", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/spa/appointments", label: "Appointments", icon: Calendar },
  { href: "/spa/pos", label: "POS / Sales", icon: ShoppingBag },
  { href: "/spa/clients", label: "Clients", icon: Users },
  { href: "/spa/services", label: "Services", icon: Scissors },
  { href: "/spa/inventory", label: "Inventory", icon: Package },
  { href: "/spa/staff", label: "Staff", icon: UserRound },
  { href: "/spa/expenses", label: "Expenses", icon: Receipt },
  { href: "/spa/suppliers", label: "Suppliers", icon: Truck },
  { href: "/spa/reports", label: "Reports", icon: BarChart3 },
];

export function SpaFrame({ children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const phoneNav = [
    { href: "/spa", label: "Home", icon: LayoutDashboard, exact: true },
    { href: "/spa/appointments", label: "Book", icon: Calendar },
    { href: "/spa/pos", label: "Till", icon: ShoppingBag },
    { href: "/spa/clients", label: "Clients", icon: Users },
  ];

  return (
    <div className="flex h-dvh overflow-hidden bg-[#F3F6FB] text-[#0F172A]">
      {open ? (
        <button type="button" className="fixed inset-0 z-[35] bg-black/40 md:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />
      ) : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-[#0E2340] text-white transition-transform md:static md:w-16 md:translate-x-0 lg:w-64 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-5 py-5 md:justify-center md:px-2 lg:justify-start lg:px-5">
          <CentrixLogoMark size={36} />
          <div className="md:hidden lg:block">
            <p className="text-lg font-semibold leading-none">Centrix</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Spa & Kinyozi</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4 md:px-2 lg:px-3" aria-label="SPA and Kinyozi">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm md:justify-center md:px-2 lg:justify-start lg:px-3 ${active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10"}`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="md:hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:h-16 sm:gap-3 sm:px-4">
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <GlobalModuleSearch />
          </div>
          <p className="hidden text-sm text-slate-500 lg:block">{formatLong(todayISO())}</p>
          <ThemeToggle compact />
          <UserAccountMenu />
        </header>
        <NetworkStatusBanner />
        <LicenseExpiryBanner />
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 md:p-6">{children}</div>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Spa and Kinyozi">
          {phoneNav.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${active ? "text-[#1677F2]" : "text-slate-500"}`}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <button type="button" className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${open ? "text-[#1677F2]" : "text-slate-500"}`} onClick={() => setOpen(true)}>
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
        <p className="theme-subtext mx-auto mt-2 max-w-xl text-center text-sm">This choice turns on the tools that match the shop. You can change it later in Administration → SPA & Kinyozi.</p>
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
