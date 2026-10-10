"use client";

import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { datePart, ksh, stockStatus, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Button, Card, Field, PageHeader, toolbarControlClass } from "@/components/spa/ui";

export function ReportsScreen() {
  const spa = useSpa();
  const [from, setFrom] = useState(todayISO(daysAgo(6)));
  const [to, setTo] = useState(todayISO());
  const inRange = (value) => {
    const day = datePart(value);
    return day >= from && day <= to;
  };
  const sales = spa.sales.filter((sale) => sale.status === "completed" && inRange(sale.at));
  const expenses = spa.expenses.filter((item) => item.status === "approved" && inRange(item.date));
  const appointments = spa.appointments.filter((item) => item.status !== "cancelled" && inRange(item.start));
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const cogs = sales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + (line.cost || 0) * line.qty, 0), 0);
  const methods = ["cash", "mpesa", "card"].map((method) => ({
    method,
    total: sales.reduce((sum, sale) => sum + (sale.payment.parts || []).filter((part) => part.method === method).reduce((partSum, part) => partSum + part.amount, 0), 0),
  }));
  const stockValue = spa.products.reduce((sum, item) => sum + item.cost * item.qty, 0);
  const serviceRows = useMemo(() => {
    const map = {};
    for (const sale of sales) {
      for (const line of sale.lines) {
        if (line.kind !== "service") continue;
        map[line.name] = (map[line.name] || 0) + line.price * line.qty;
      }
    }
    return Object.entries(map);
  }, [sales]);

  function exportCsv() {
    const lines = [
      ["Metric", "Amount"],
      ["Revenue", revenue],
      ["Expenses", expenseTotal],
      ["Estimated profit", revenue - expenseTotal - cogs],
      ["Appointments", appointments.length],
      ["Stock valuation", stockValue],
      ...methods.map((item) => [item.method, item.total]),
    ];
    const csv = lines.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `centrix-spa-report-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded.");
  }

  return (
    <div>
      <PageHeader title="Reports" detail="Sales, costs and the till for the dates you choose.">
        <Field label="From"><input className={toolbarControlClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To"><input className={toolbarControlClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        <Button variant="ghost" onClick={exportCsv}>Export CSV</Button>
      </PageHeader>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Revenue" value={ksh(revenue)} />
        <Metric label="Expenses" value={ksh(expenseTotal)} />
        <Metric label="Estimated profit" value={ksh(revenue - expenseTotal - cogs)} />
        <Metric label="Appointments" value={appointments.length} />
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold">Payment methods</h2>
          <ul className="mt-3 space-y-2 text-sm">{methods.map((item) => <li key={item.method} className="flex justify-between capitalize"><span>{item.method === "mpesa" ? "M-Pesa" : item.method}</span><span>{ksh(item.total)}</span></li>)}</ul>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Services</h2>
          <ul className="mt-3 space-y-2 text-sm">{serviceRows.length === 0 ? <li className="text-slate-500">No service sales in this range.</li> : serviceRows.map(([name, total]) => <li key={name} className="flex justify-between"><span>{name}</span><span>{ksh(total)}</span></li>)}</ul>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Staff performance</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {spa.staff.map((person) => {
              const total = sales.reduce((sum, sale) => sum + sale.lines.filter((line) => line.staffId === person.id).reduce((lineSum, line) => lineSum + line.price * line.qty, 0), 0);
              return <li key={person.id} className="flex justify-between"><span>{person.name}</span><span>{ksh(total)}</span></li>;
            })}
          </ul>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">End of day</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between"><span>Sales recorded</span><span>{sales.length}</span></li>
            <li className="flex justify-between"><span>Cash in sales</span><span>{ksh(methods.find((item) => item.method === "cash")?.total || 0)}</span></li>
            <li className="flex justify-between"><span>Approved expenses</span><span>{ksh(expenseTotal)}</span></li>
            <li className="flex justify-between"><span>Stock at cost</span><span>{ksh(stockValue)}</span></li>
            <li className="flex justify-between"><span>Low stock lines</span><span>{spa.products.filter((item) => stockStatus(item) !== "In stock").length}</span></li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

function daysAgo(count) {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return date;
}

function Metric({ label, value }) {
  return <Card><p className="text-xs uppercase text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></Card>;
}
