"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgePercent,
  BarChart3,
  Bell,
  Calendar,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Scissors,
  Search,
  Settings,
  ShoppingBag,
  Truck,
  Users,
} from "lucide-react";
import { businessLabel, formatLong, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Button } from "@/components/spa/ui";

const NAV = [
  { href: "/spa", label: "Dashboard", icon: LayoutDashboard },
  { href: "/spa/appointments", label: "Appointments", icon: Calendar },
  { href: "/spa/pos", label: "POS / Sales", icon: ShoppingBag },
  { href: "/spa/clients", label: "Clients", icon: Users },
  { href: "/spa/services", label: "Services", icon: Scissors },
  { href: "/spa/staff", label: "Staff & Commissions", icon: BadgePercent },
  { href: "/spa/inventory", label: "Inventory", icon: Package },
  { href: "/spa/expenses", label: "Expenses", icon: Receipt },
  { href: "/spa/suppliers", label: "Suppliers", icon: Truck },
  { href: "/spa/reports", label: "Reports", icon: BarChart3 },
  { href: "/spa/settings", label: "Settings", icon: Settings },
];

export function SpaShell({ children }) {
  const spa = useSpa();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const clients = spa.clients.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 4).map((item) => ({ href: `/spa/clients/${item.id}`, label: item.name, hint: "Client" }));
    const services = spa.services.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 3).map((item) => ({ href: "/spa/services", label: item.name, hint: "Service" }));
    const products = spa.products.filter((item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)).slice(0, 3).map((item) => ({ href: "/spa/inventory", label: item.name, hint: item.sku }));
    return [...clients, ...services, ...products];
  }, [query, spa.clients, spa.products, spa.services]);

  const alerts = spa.lowStock().map((item) => `${item.name} is low (${item.qty} left)`);

  if (!spa.ready) {
    return <div className="grid h-full place-items-center text-sm text-slate-500">Loading Centrix SPA & Kinyozi…</div>;
  }

  if (!spa.businessType) {
    return <BusinessChooser onChoose={spa.setBusinessType} />;
  }

  return (
    <div className="flex h-full bg-[#F5F7FB] text-[#14263D]">
      {open ? <button type="button" className="fixed inset-0 z-30 bg-[#14263D]/40 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#14263D] text-white transition lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1677F2] text-sm font-bold">C</span>
          <div>
            <p className="text-sm font-semibold leading-tight">Centrix</p>
            <p className="text-[11px] uppercase tracking-wide text-white/60">{businessLabel(spa.businessType).replace("Centrix ", "")}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Salon">
          {NAV.map((item) => {
            const active = item.href === "/spa" ? pathname === "/spa" : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs text-white/60">
          <p className="font-medium text-white">Stephen Otieno</p>
          <p>Owner · {spa.branch}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
          <button type="button" className="rounded-lg p-2 text-[#14263D] hover:bg-slate-100 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={18} />
          </button>
          <div className="relative min-w-0 flex-1 max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients, services or products"
              aria-label="Search"
              className="w-full rounded-xl border border-slate-200 bg-[#F5F7FB] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#1677F2]"
            />
            {results.length > 0 ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                {results.map((item) => (
                  <button
                    key={`${item.hint}-${item.label}`}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => {
                      setQuery("");
                      router.push(item.href);
                    }}
                  >
                    <span>{item.label}</span>
                    <span className="text-xs text-slate-400">{item.hint}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button type="button" className="relative rounded-lg p-2 hover:bg-slate-100" aria-label="Notifications" onClick={() => setNotesOpen((value) => !value)}>
              <Bell size={18} />
              {alerts.length > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#1677F2]" /> : null}
            </button>
            {notesOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
                {alerts.length === 0 ? <p className="text-slate-500">No alerts right now.</p> : alerts.map((alert) => <p key={alert} className="py-1">{alert}</p>)}
              </div>
            ) : null}
          </div>
          <label className="hidden items-center gap-2 text-sm sm:flex">
            <span className="sr-only">Branch</span>
            <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5" value={spa.branch} onChange={(event) => spa.setBranch(event.target.value)}>
              {spa.branches.map((branch) => <option key={branch}>{branch}</option>)}
            </select>
          </label>
          <p className="hidden text-sm text-slate-500 xl:block">{formatLong(todayISO())}</p>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1677F2] text-xs font-semibold text-white">SO</span>
            <span className="text-sm font-medium">Stephen</span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function BusinessChooser({ onChoose }) {
  const options = [
    { id: "spa", title: "Centrix SPA", detail: "Therapist scheduling, treatment rooms, packages and session tracking." },
    { id: "kinyozi", title: "Centrix Kinyozi", detail: "Walk-in checkout, barber assignment, chairs and service combos." },
    { id: "combined", title: "SPA & Kinyozi", detail: "One shop with both treatment rooms and barber chairs." },
  ];
  return (
    <div className="grid min-h-full place-items-center bg-[#F5F7FB] p-6">
      <div className="w-full max-w-4xl">
        <p className="text-center text-sm font-medium text-[#1677F2]">Business type</p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-[#14263D]">How does this branch work?</h1>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-500">This choice turns on the tools that match the shop. You can change it later in Settings.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {options.map((option) => (
            <article key={option.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">{option.title}</h2>
              <p className="mt-2 flex-1 text-sm text-slate-500">{option.detail}</p>
              <Button className="mt-5" onClick={() => onChoose(option.id)}>Select</Button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
