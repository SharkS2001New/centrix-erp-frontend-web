"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar,
  LayoutDashboard,
  Package,
  Receipt,
  Scissors,
  Settings,
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
import { useAuth } from "@/contexts/auth-context";
import { businessLabel, formatLong, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
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
  { href: "/spa/settings", label: "Settings", icon: Settings },
];

export function SpaFrame({ children }) {
  const pathname = usePathname();
  const spa = useSpa();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const name = user?.full_name || user?.username || "there";
  const shop = businessLabel(spa.businessType);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F6FB] text-[#0F172A]">
      {open ? (
        <button type="button" className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />
      ) : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-[#0E2340] text-white transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-5 py-5">
          <CentrixLogoMark size={36} />
          <div>
            <p className="text-lg font-semibold leading-none">Centrix</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Spa & Kinyozi</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="SPA and Kinyozi">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10"}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-white/55">{spa.branch || shop}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">Menu</button>
          <div className="min-w-0 flex-1">
            <GlobalModuleSearch />
          </div>
          <p className="hidden text-sm text-slate-500 md:block">{formatLong(todayISO())}</p>
          <ThemeToggle compact />
          <UserAccountMenu />
        </header>
        <NetworkStatusBanner />
        <LicenseExpiryBanner />
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
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
