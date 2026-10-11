"use client";

import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { ksh, todayISO } from "@/lib/spa/format";
import { buildSpaReport, csvCell, daysAgo, monthStart, weekStart } from "@/lib/spa/reports";
import { useSpa } from "@/lib/spa/store";
import { Button, Card, PageHeader, SpaFilters, pillClass, toolbarControlClass } from "@/components/spa/ui";

const REPORTS = [
  ["overview", "Overview"],
  ["sales", "Sales"],
  ["appointments", "Appointments"],
  ["staff", "Staff"],
  ["clients", "Clients"],
  ["services", "Services"],
  ["retail", "Retail"],
  ["expenses", "Expenses"],
];

export function ReportsScreen() {
  const spa = useSpa();
  const [report, setReport] = useState("overview");
  const [from, setFrom] = useState(todayISO(daysAgo(6)));
  const [to, setTo] = useState(todayISO());
  const view = useMemo(() => buildSpaReport(spa, from, to, report), [spa, from, to, report]);

  function exportCsv() {
    const header = view.columns.map(csvCell).join(",");
    const body = view.rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `centrix-spa-${report}-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded.");
  }

  return (
    <div>
      <PageHeader title="Reports" detail={`${spa.branch} · sales, bookings, staff commission, clients, services, retail, and expenses.`}>
        <Button variant="ghost" onClick={exportCsv}>Export CSV</Button>
      </PageHeader>
      <SpaFilters>
        <input className={toolbarControlClass} type="date" aria-label="From" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
        <input className={toolbarControlClass} type="date" aria-label="To" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
        <button type="button" className={pillClass(false)} onClick={() => { const day = todayISO(); setFrom(day); setTo(day); }}>Today</button>
        <button type="button" className={pillClass(false)} onClick={() => { const day = todayISO(); setFrom(weekStart(day)); setTo(day); }}>This week</button>
        <button type="button" className={pillClass(false)} onClick={() => { const day = todayISO(); setFrom(monthStart(day)); setTo(day); }}>This month</button>
      </SpaFilters>
      <div className="mb-4 flex flex-wrap gap-2">
        {REPORTS.map(([id, label]) => (
          <button key={id} type="button" className={pillClass(report === id)} onClick={() => setReport(id)}>{label}</button>
        ))}
      </div>
      {from > to ? <p className="theme-subtext mb-4 text-sm">Choose an end date on or after the start date.</p> : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view.metrics.map((item) => <Metric key={item.label} label={item.label} value={item.value} hint={item.hint} />)}
      </section>
      {view.mix ? (
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-sm font-semibold">{view.mix.title}</h2>
            <MixList rows={view.mix.rows} empty={view.mix.empty} money={view.mix.money !== false} />
          </Card>
          {view.days ? (
            <Card>
              <h2 className="text-sm font-semibold">Sales by day</h2>
              <DayBars days={view.days} />
            </Card>
          ) : null}
        </section>
      ) : null}
      <Card className="mt-4">
        <h2 className="text-sm font-semibold">{view.title}</h2>
        {view.note ? <p className="theme-subtext mt-1 text-sm">{view.note}</p> : null}
        <ReportTable columns={view.columns} rows={view.rows} empty={view.empty} />
      </Card>
    </div>
  );
}

function ReportTable({ columns, rows, empty }) {
  if (rows.length === 0) return <p className="theme-subtext mt-3 text-sm">{empty}</p>;
  return (
    <>
    <div className="mt-3 grid gap-3 md:hidden">
      {rows.map((row, index) => (
        <article key={index} className="rounded-lg border border-[var(--theme-border)] p-3">
          <p className="font-medium">{row[0]}</p>
          <dl className="mt-2 space-y-1">
            {columns.slice(1).map((label, cellIndex) => (
              <div key={label} className="flex items-start justify-between gap-3 text-sm">
                <dt className="theme-subtext">{label}</dt>
                <dd className="text-right">{row[cellIndex + 1]}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
    <div className="mt-3 hidden overflow-x-auto md:block">
      <table className="w-full text-left text-sm">
        <thead className="theme-subtext">
          <tr>{columns.map((label) => <th key={label} className="py-2 pr-3 font-medium">{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-[var(--theme-border)]">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="py-2 pr-3">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function Metric({ label, value, hint }) {
  return (
    <Card>
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold sm:text-2xl">{value}</p>
      {hint ? <p className="theme-subtext mt-1 text-xs">{hint}</p> : null}
    </Card>
  );
}

function MixList({ rows, empty, money = true }) {
  if (!rows.length) return <p className="theme-subtext mt-3 text-sm">{empty}</p>;
  const max = Math.max(...rows.map((row) => row.amount), 1);
  return (
    <ul className="mt-3 space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span>{row.label}</span>
            <span>{money ? ksh(row.amount) : row.amount}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--theme-surface-muted)]">
            <div className="h-full rounded-full bg-[var(--theme-primary)]" style={{ width: `${Math.max(row.amount ? 6 : 0, (row.amount / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DayBars({ days }) {
  const max = Math.max(...days.map((day) => day.revenue), 1);
  if (!days.length) return <p className="theme-subtext mt-3 text-sm">Choose a date range to see daily sales.</p>;
  return (
    <div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label="Sales by day">
      {days.map((day) => (
        <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${day.date}: ${ksh(day.revenue)}`}>
          <div className="w-full rounded-t bg-[var(--theme-primary)]" style={{ height: `${day.revenue ? Math.max(8, (day.revenue / max) * 112) : 0}px` }} />
          <span className="theme-subtext w-full truncate text-center text-[10px]">{day.label}</span>
        </div>
      ))}
    </div>
  );
}
