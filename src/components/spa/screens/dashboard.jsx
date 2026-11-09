"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  ShoppingBag,
  UserPlus,
  Wallet,
  Users,
  Footprints,
  CalendarCheck,
  Play,
  Armchair,
} from "lucide-react";
import { datePart, formatLong, formatTime, ksh, todayISO } from "@/lib/spa/format";
import { useAuth } from "@/contexts/auth-context";
import { isSpaFeatureEnabled } from "@/lib/org-settings-tabs";
import { useSpa } from "@/lib/spa/store";
import { toast } from "@/lib/toast";
import { Badge, Button, Card, Field, SpaSelect } from "@/components/spa/ui";

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardScreen() {
  const spa = useSpa();
  const { user, capabilities } = useAuth();
  const firstName = String(user?.full_name || user?.username || "there").split(" ")[0];
  const today = todayISO();
  const hour = new Date().getHours();

  const daySales = useMemo(() => spa.salesOn(today), [spa, today]);
  const salesTotal = useMemo(
    () => daySales.reduce((sum, sale) => sum + sale.total, 0),
    [daySales],
  );
  const appointments = useMemo(
    () => spa.appointments.filter((item) => datePart(item.start) === today && item.status !== "cancelled"),
    [spa.appointments, today],
  );
  const walkIns = useMemo(
    () => spa.walkIns.filter((item) => datePart(item.at) === today && item.status === "waiting"),
    [spa.walkIns, today],
  );
  const inProgress = useMemo(
    () => appointments.filter((item) => item.status === "in_progress"),
    [appointments],
  );
  const upcoming = useMemo(
    () =>
      appointments
        .filter((item) => item.status === "booked")
        .sort((a, b) => String(a.start).localeCompare(String(b.start))),
    [appointments],
  );
  const outstanding = useMemo(
    () => spa.expenses.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.amount, 0),
    [spa.expenses],
  );

  const trend = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const iso = todayISO(date);
      const total = spa.sales
        .filter((sale) => sale.status === "completed" && datePart(sale.at) === iso)
        .reduce((sum, sale) => sum + sale.total, 0);
      return { label: date.toLocaleDateString("en-KE", { weekday: "short" }), total };
    });
  }, [spa.sales]);

  const max = Math.max(...trend.map((item) => item.total), 1);
  const top = useMemo(() => {
    const serviceTotals = {};
    for (const sale of spa.sales) {
      if (sale.status !== "completed") continue;
      for (const line of sale.lines) {
        if (line.kind !== "service") continue;
        serviceTotals[line.name] = (serviceTotals[line.name] || 0) + line.price * line.qty;
      }
    }
    return Object.entries(serviceTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [spa.sales]);

  const points = trend
    .map((item, index) => {
      const x = trend.length === 1 ? 0 : (index / (trend.length - 1)) * 100;
      const y = 100 - (item.total / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  const lowStock = useMemo(() => spa.lowStock(), [spa]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0E2340] sm:text-2xl">
            {greetingForHour(hour)}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Floor board for {spa.profile?.name || "your shop"} · {spa.branch}
          </p>
        </div>
        <p className="text-sm text-slate-500">{formatLong(today)}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Today's sales"
          value={ksh(salesTotal)}
          hint={`${daySales.length} ticket${daySales.length === 1 ? "" : "s"}`}
          icon={Wallet}
          tint="bg-emerald-50 text-emerald-600"
        />
        <Kpi
          label="On the floor"
          value={inProgress.length}
          hint={`${upcoming.length} still booked`}
          icon={CalendarCheck}
          tint="bg-blue-50 text-blue-600"
        />
        <Kpi
          label="Walk-in queue"
          value={walkIns.length}
          hint={walkIns.length ? "Seat guests below" : "Queue clear"}
          icon={Footprints}
          tint="bg-violet-50 text-violet-600"
        />
        <Kpi
          label="Clients"
          value={spa.clients.length}
          hint={outstanding > 0 ? `Pending bills ${ksh(outstanding)}` : "Active book"}
          icon={Users}
          tint="bg-amber-50 text-amber-600"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#0E2340]">Today on the floor</h2>
            {isSpaFeatureEnabled(capabilities, "appointments") ? (
              <Link href="/spa/appointments" className="text-xs font-medium text-[var(--theme-accent-text)]">
                Open calendar
              </Link>
            ) : null}
          </div>
          {inProgress.length === 0 && upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">No appointments in progress or booked for today.</p>
          ) : (
            <ul className="space-y-2">
              {[...inProgress, ...upcoming.slice(0, 6)].map((item) => {
                const client = spa.clients.find((row) => row.id === item.clientId);
                const service = spa.services.find((row) => row.id === item.serviceId);
                const staff = spa.staff.find((row) => row.id === item.staffId);
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0E2340]">
                        {client?.name || "Client"} · {formatTime(item.start)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {service?.name || "Service"}
                        {staff ? ` · ${staff.name}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          item.status === "in_progress"
                            ? "blue"
                            : item.status === "completed"
                              ? "green"
                              : "amber"
                        }
                      >
                        {item.status.replace("_", " ")}
                      </Badge>
                      {item.status === "booked" ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                          onClick={() => {
                            spa.setAppointmentStatus(item.id, "in_progress");
                            toast.success("Service started.");
                          }}
                        >
                          <Play size={12} /> Start
                        </button>
                      ) : null}
                      {item.status === "in_progress" || item.status === "booked" ? (
                        <Link
                          href={`/spa/pos?appointment=${encodeURIComponent(item.id)}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <ShoppingBag size={12} /> Checkout
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {isSpaFeatureEnabled(capabilities, "appointments") ? (
              <Action href="/spa/appointments/new" icon={CalendarPlus} label="New appointment" tint="bg-blue-50 text-blue-600" />
            ) : null}
            {isSpaFeatureEnabled(capabilities, "pos") ? (
              <Action href="/spa/pos" icon={ShoppingBag} label="Quick sale" tint="bg-emerald-50 text-emerald-600" />
            ) : null}
            {isSpaFeatureEnabled(capabilities, "clients") ? (
              <Action href="/spa/clients/new" icon={UserPlus} label="Add client" tint="bg-violet-50 text-violet-600" />
            ) : null}
            {isSpaFeatureEnabled(capabilities, "appointments") ? (
              <Action href="/spa/appointments/walk-in" icon={Footprints} label="Add walk-in" tint="bg-amber-50 text-amber-600" />
            ) : null}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#0E2340]">Walk-in queue</h2>
            {isSpaFeatureEnabled(capabilities, "appointments") ? (
              <Link href="/spa/appointments/walk-in" className="text-xs font-medium text-[var(--theme-accent-text)]">
                Add guest
              </Link>
            ) : null}
          </div>
          {walkIns.length === 0 ? (
            <p className="text-sm text-slate-500">No one waiting. Walk-ins appear here until they are seated.</p>
          ) : (
            <ul className="space-y-3">
              {walkIns.map((guest) => (
                <WalkInSeatRow key={guest.id} guest={guest} spa={spa} />
              ))}
            </ul>
          )}
        </Card>
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
            {trend.map((item) => (
              <span key={item.label}>{item.label}</span>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-[#0E2340]">Recent appointments</h2>
          <ul className="mt-3 space-y-3">
            {appointments.length === 0 ? (
              <li className="text-sm text-slate-500">No appointments today.</li>
            ) : (
              appointments.slice(0, 6).map((item) => {
                const client = spa.clients.find((row) => row.id === item.clientId);
                const service = spa.services.find((row) => row.id === item.serviceId);
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{client?.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {service?.name} · {formatTime(item.start)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        item.status === "completed" ? "green" : item.status === "in_progress" ? "blue" : "amber"
                      }
                    >
                      {item.status.replace("_", " ")}
                    </Badge>
                  </li>
                );
              })
            )}
          </ul>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-[#0E2340]">Low stock</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {lowStock.length === 0 ? (
              <li className="text-slate-500">Stock levels look fine.</li>
            ) : (
              lowStock.map((item) => (
                <li key={item.id} className="flex justify-between">
                  <span>{item.name}</span>
                  <span className="text-amber-700">{item.qty} left</span>
                </li>
              ))
            )}
          </ul>
          {isSpaFeatureEnabled(capabilities, "inventory") ? (
            <Link href="/spa/inventory" className="mt-3 inline-block text-sm font-medium text-[var(--theme-accent-text)]">
              View inventory
            </Link>
          ) : null}
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-[#0E2340]">Top services</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {top.length === 0 ? (
              <li className="text-slate-500">No completed services yet.</li>
            ) : (
              top.map(([name, total]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span>{ksh(total)}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function WalkInSeatRow({ guest, spa }) {
  const [staffId, setStaffId] = useState(spa.staff[0]?.id || "");
  const [chairId, setChairId] = useState(spa.features.chairs ? spa.chairs?.[0]?.id || "" : "");
  const service = spa.services.find((item) => item.id === guest.serviceId);

  return (
    <li className="rounded-xl border border-slate-100 bg-white px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#0E2340]">{guest.name}</p>
          <p className="truncate text-xs text-slate-500">
            {guest.phone || "No phone"} · {service?.name || "Any service"} · {formatTime(guest.at)}
          </p>
        </div>
        <Badge tone="amber">waiting</Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Staff">
          <SpaSelect
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
            options={spa.staff.filter((s) => s.active !== false).map((item) => ({ value: item.id, label: item.name }))}
          />
        </Field>
        {spa.features.chairs ? (
          <Field label="Chair">
            <SpaSelect
              value={chairId}
              onChange={(event) => setChairId(event.target.value)}
              options={[
                { value: "", label: "Any chair" },
                ...(spa.chairs || []).map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </Field>
        ) : (
          <div />
        )}
        <div className="flex items-end">
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              const err = spa.seatWalkIn(guest.id, staffId, chairId);
              if (typeof err === "string") {
                toast.error(err);
                return;
              }
              toast.success(`${guest.name} is seated.`);
            }}
          >
            <Armchair size={14} /> Seat
          </Button>
        </div>
      </div>
    </li>
  );
}

function Kpi({ label, value, hint, icon: Icon, tint }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tint}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-3 break-words text-xl font-semibold text-[#0E2340] sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

function Action({ href, icon: Icon, label, tint }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm font-medium text-[#0E2340]"
    >
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${tint}`}>
        <Icon size={16} />
      </span>
      {label}
    </Link>
  );
}
