"use client";

import Link from "next/link";
import { CalendarPlus, Package, ShoppingBag, UserPlus, Wallet, Users, Footprints, CalendarCheck } from "lucide-react";
import { datePart, formatLong, formatTime, ksh, todayISO } from "@/lib/spa/format";
import { useAuth } from "@/contexts/auth-context";
import { useSpa } from "@/lib/spa/store";
import { Badge, Card } from "@/components/spa/ui";

export function DashboardScreen() {
  const spa = useSpa();
  const { user } = useAuth();
  const firstName = String(user?.full_name || user?.username || "there").split(" ")[0];
  const today = todayISO();
  const daySales = spa.salesOn(today);
  const salesTotal = daySales.reduce((sum, sale) => sum + sale.total, 0);
  const appointments = spa.appointments.filter((item) => datePart(item.start) === today && item.status !== "cancelled");
  const walkIns = spa.walkIns.filter((item) => datePart(item.at) === today && item.status === "waiting");
  const outstanding = spa.expenses.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.amount, 0);
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const iso = todayISO(date);
    const total = spa.sales.filter((sale) => sale.status === "completed" && datePart(sale.at) === iso).reduce((sum, sale) => sum + sale.total, 0);
    return { label: date.toLocaleDateString("en-KE", { weekday: "short" }), total };
  });
  const max = Math.max(...trend.map((item) => item.total), 1);
  const serviceTotals = {};
  for (const sale of spa.sales) {
    if (sale.status !== "completed") continue;
    for (const line of sale.lines) {
      if (line.kind !== "service") continue;
      serviceTotals[line.name] = (serviceTotals[line.name] || 0) + line.price * line.qty;
    }
  }
  const top = Object.entries(serviceTotals).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const points = trend.map((item, index) => {
    const x = trend.length === 1 ? 0 : (index / (trend.length - 1)) * 100;
    const y = 100 - (item.total / max) * 100;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0E2340]">Good morning, {firstName}</h1>
          <p className="mt-1 text-sm text-slate-500">Here is what is happening at your spa and kinyozi today.</p>
        </div>
        <p className="text-sm text-slate-500">{formatLong(today)} · {spa.branch}</p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Today's sales" value={ksh(salesTotal)} icon={Wallet} tint="bg-emerald-50 text-emerald-600" />
        <Kpi label="Appointments" value={appointments.length} icon={CalendarCheck} tint="bg-blue-50 text-blue-600" />
        <Kpi label="Walk-ins" value={walkIns.length} icon={Footprints} tint="bg-violet-50 text-violet-600" />
        <Kpi label="Total clients" value={spa.clients.length} icon={Users} tint="bg-amber-50 text-amber-600" />
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0E2340]">Sales overview</h2>
            <span className="text-xs text-slate-400">This week</span>
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-4 h-40 w-full" role="img" aria-label="Sales this week">
            <polyline fill="none" stroke="#2563EB" strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            {trend.map((item) => <span key={item.label}>{item.label}</span>)}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Action href="/spa/appointments/new" icon={CalendarPlus} label="New appointment" tint="bg-blue-50 text-blue-600" />
            <Action href="/spa/pos" icon={ShoppingBag} label="Quick sale" tint="bg-emerald-50 text-emerald-600" />
            <Action href="/spa/clients/new" icon={UserPlus} label="Add client" tint="bg-violet-50 text-violet-600" />
            <Action href="/spa/inventory" icon={Package} label="Check inventory" tint="bg-amber-50 text-amber-600" />
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-[#0E2340]">Recent appointments</h2>
          <ul className="mt-3 space-y-3">
            {appointments.length === 0 ? <li className="text-sm text-slate-500">No appointments today.</li> : appointments.slice(0, 6).map((item) => {
              const client = spa.clients.find((row) => row.id === item.clientId);
              const service = spa.services.find((row) => row.id === item.serviceId);
              return (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium">{client?.name}</p>
                    <p className="text-xs text-slate-500">{service?.name} · {formatTime(item.start)}</p>
                  </div>
                  <Badge tone={item.status === "completed" ? "green" : item.status === "in_progress" ? "blue" : "amber"}>{item.status.replace("_", " ")}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-[#0E2340]">Low stock</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {spa.lowStock().length === 0 ? <li className="text-slate-500">Stock levels look fine.</li> : spa.lowStock().map((item) => (
              <li key={item.id} className="flex justify-between"><span>{item.name}</span><span className="text-amber-700">{item.qty} left</span></li>
            ))}
          </ul>
          <Link href="/spa/inventory" className="mt-3 inline-block text-sm font-medium text-[var(--theme-accent-text)]">View inventory</Link>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-[#0E2340]">Top services</h2>
          {outstanding > 0 ? <p className="mt-1 text-xs text-slate-500">Pending expenses {ksh(outstanding)}</p> : null}
          <ul className="mt-3 space-y-2 text-sm">
            {top.length === 0 ? <li className="text-slate-500">No completed services yet.</li> : top.map(([name, total]) => (
              <li key={name} className="flex justify-between"><span>{name}</span><span>{ksh(total)}</span></li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tint }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tint}`}><Icon size={16} /></span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-[#0E2340]">{value}</p>
    </Card>
  );
}

function Action({ href, icon: Icon, label, tint }) {
  return (
    <Link href={href} className="flex flex-col items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm font-medium text-[#0E2340]">
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${tint}`}><Icon size={16} /></span>
      {label}
    </Link>
  );
}
