"use client";

import Link from "next/link";
import { CalendarPlus, Package, ShoppingBag, UserPlus } from "lucide-react";
import { datePart, formatTime, ksh, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Badge, Card } from "@/components/spa/ui";

export function DashboardScreen() {
  const spa = useSpa();
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Good morning, Stephen</h1>
        <p className="text-sm text-slate-500">Here is {spa.branch} for today.</p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Today's sales" value={ksh(salesTotal)} />
        <Kpi label="Appointments" value={appointments.length} />
        <Kpi label="Walk-ins" value={walkIns.length} />
        <Kpi label="Total clients" value={spa.clients.length} />
        <Kpi label="Outstanding" value={ksh(outstanding)} />
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <Card>
          <h2 className="text-sm font-semibold">Sales this week</h2>
          <div className="mt-4 flex h-44 items-end gap-3">
            {trend.map((item) => (
              <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end">
                  <div className="w-full rounded-t-lg bg-[#1677F2]" style={{ height: `${Math.max(8, (item.total / max) * 100)}%` }} title={ksh(item.total)} />
                </div>
                <span className="text-xs text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Quick actions</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Action href="/spa/appointments?new=1" icon={CalendarPlus} label="New appointment" />
            <Action href="/spa/pos" icon={ShoppingBag} label="Quick sale" />
            <Action href="/spa/clients?new=1" icon={UserPlus} label="Add client" />
            <Action href="/spa/inventory" icon={Package} label="Check inventory" />
          </div>
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="text-sm font-semibold">Recent appointments</h2>
          <ul className="mt-3 space-y-3">
            {appointments.slice(0, 5).map((item) => {
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
        <Card>
          <h2 className="text-sm font-semibold">Low stock</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {spa.lowStock().length === 0 ? <li className="text-slate-500">Stock levels look fine.</li> : spa.lowStock().map((item) => (
              <li key={item.id} className="flex justify-between"><span>{item.name}</span><span className="text-amber-700">{item.qty} left</span></li>
            ))}
          </ul>
          <Link href="/spa/inventory" className="mt-3 inline-block text-sm font-medium text-[#1677F2]">View inventory</Link>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Top services</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {top.map(([name, total]) => (
              <li key={name} className="flex justify-between"><span>{name}</span><span>{ksh(total)}</span></li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function Action({ href, icon: Icon, label }) {
  return (
    <Link href={href} className="flex flex-col items-start gap-2 rounded-xl bg-[#F5F7FB] p-3 text-sm font-medium hover:bg-blue-50">
      <Icon size={18} className="text-[#1677F2]" />
      {label}
    </Link>
  );
}
