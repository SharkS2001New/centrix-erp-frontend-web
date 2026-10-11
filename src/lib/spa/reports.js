import { datePart, ksh, stockStatus, todayISO } from "@/lib/spa/format";

export function buildSpaReport(spa, from, to, report) {
  const inRange = (value) => {
    const day = datePart(value);
    return day >= from && day <= to;
  };
  const sales = spa.sales.filter((sale) => sale.status === "completed" && inRange(sale.at));
  const appointments = spa.appointments.filter((item) => inRange(item.start));
  const expenses = spa.expenses.filter((item) => inRange(item.date));
  const approvedExpenses = expenses.filter((item) => item.status === "approved");
  const walkIns = (spa.walkIns || []).filter((item) => inRange(item.at));
  const revenue = sum(sales, (sale) => sale.total);
  const serviceRevenue = sum(sales, (sale) => lineTotal(sale, "service"));
  const retailRevenue = sum(sales, (sale) => lineTotal(sale, "product"));
  const cogs = sum(sales, (sale) => sale.lines.reduce((lineSum, line) => lineSum + (Number(line.cost) || 0) * (Number(line.qty) || 0), 0));
  const expenseTotal = sum(approvedExpenses, (item) => item.amount);
  const profit = revenue - expenseTotal - cogs;
  const days = eachDay(from, to).map((date) => ({
    date,
    label: axisLabel(date, from, to),
    revenue: sum(sales.filter((sale) => datePart(sale.at) === date), (sale) => sale.total),
    tickets: sales.filter((sale) => datePart(sale.at) === date).length,
    appointments: appointments.filter((item) => datePart(item.start) === date && item.status !== "cancelled").length,
  }));
  const clientName = (id) => spa.clients.find((item) => item.id === id)?.name || "Walk-in";
  const staffName = (id) => spa.staff.find((item) => item.id === id)?.name || "—";
  const serviceName = (id) => spa.services.find((item) => item.id === id)?.name || "—";

  if (report === "sales") {
    return {
      title: "Sales tickets",
      empty: "No completed sales in this range.",
      metrics: [
        { label: "Tickets", value: sales.length },
        { label: "Average ticket", value: ksh(sales.length ? revenue / sales.length : 0) },
        { label: "Discounts", value: ksh(sum(sales, (sale) => sale.discount)) },
        { label: "Tax", value: ksh(sum(sales, (sale) => sale.tax)) },
      ],
      columns: ["Receipt", "When", "Client", "Staff", "Services", "Retail", "Total", "Method"],
      rows: sales.map((sale) => [
        sale.number,
        `${datePart(sale.at)} ${String(sale.at || "").slice(11, 16)}`,
        clientName(sale.clientId),
        staffName(sale.staffId),
        ksh(lineTotal(sale, "service")),
        ksh(lineTotal(sale, "product")),
        ksh(sale.total),
        methodLabel(sale.payment?.method),
      ]),
    };
  }

  if (report === "appointments") {
    const count = (status) => appointments.filter((item) => item.status === status).length;
    const completed = count("completed");
    const noShow = count("no_show");
    const cancelled = count("cancelled");
    const open = appointments.length - completed - noShow - cancelled;
    const decided = completed + noShow;
    return {
      title: "Appointment book",
      note: walkIns.length ? `${walkIns.length} walk-in${walkIns.length === 1 ? "" : "s"} recorded in this range.` : "Walk-ins recorded in this range appear in the till queue until they are seated.",
      empty: "No appointments in this range.",
      metrics: [
        { label: "On the book", value: appointments.length - cancelled, hint: `${cancelled} cancelled` },
        { label: "Completed", value: completed },
        { label: "No-shows", value: noShow },
        { label: "Show rate", value: decided ? `${Math.round((completed / decided) * 100)}%` : "—", hint: `${open} still open` },
      ],
      mix: {
        title: "By status",
        money: false,
        empty: "No appointments in this range.",
        rows: [
          ["Completed", completed],
          ["In progress", count("in_progress")],
          ["Booked", count("booked")],
          ["No-show", noShow],
          ["Cancelled", cancelled],
        ].filter(([, amount]) => amount > 0).map(([label, amount]) => ({ label, amount })),
      },
      columns: ["When", "Client", "Service", "Staff", "Status"],
      rows: [...appointments].sort((a, b) => String(a.start).localeCompare(String(b.start))).map((item) => [
        `${datePart(item.start)} ${String(item.start || "").slice(11, 16)}`,
        clientName(item.clientId),
        serviceName(item.serviceId),
        staffName(item.staffId),
        statusLabel(item.status),
      ]),
    };
  }

  if (report === "staff") {
    const rows = spa.staff.map((person) => {
      const serviceSales = sum(sales, (sale) => sale.lines.filter((line) => line.staffId === person.id && line.kind === "service").reduce((lineSum, line) => lineSum + line.price * line.qty, 0));
      const earned = Math.round(serviceSales * (Number(person.commission) || 0) / 100);
      const booked = appointments.filter((item) => item.staffId === person.id && item.status !== "cancelled").length;
      const missed = appointments.filter((item) => item.staffId === person.id && item.status === "no_show").length;
      return { person, serviceSales, earned, booked, missed };
    }).sort((a, b) => b.serviceSales - a.serviceSales);
    return {
      title: "Staff and commission",
      note: "Commission is the rate saved on the staff record, applied to the service sales they performed.",
      empty: "No staff on this branch.",
      metrics: [
        { label: "Service sales", value: ksh(serviceRevenue) },
        { label: "Commission", value: ksh(sum(rows, (row) => row.earned)) },
        { label: "Appointments kept", value: appointments.filter((item) => item.status === "completed").length },
        { label: "No-shows", value: appointments.filter((item) => item.status === "no_show").length },
      ],
      columns: ["Staff", "Role", "Appointments", "No-shows", "Service sales", "Commission", "Earned"],
      rows: rows.map((row) => [
        row.person.name,
        row.person.role,
        String(row.booked),
        String(row.missed),
        ksh(row.serviceSales),
        `${row.person.commission}%`,
        ksh(row.earned),
      ]),
    };
  }

  if (report === "clients") {
    const activity = new Map();
    for (const sale of spa.sales) {
      if (sale.status !== "completed" || !sale.clientId) continue;
      const current = activity.get(sale.clientId) || { first: datePart(sale.at), spent: 0, visits: 0, last: "" };
      const day = datePart(sale.at);
      current.first = day < current.first ? day : current.first;
      if (inRange(sale.at)) {
        current.spent += Number(sale.total) || 0;
        current.visits += 1;
        current.last = day > current.last ? day : current.last;
      }
      activity.set(sale.clientId, current);
    }
    const served = [...activity.entries()].filter(([, row]) => row.visits > 0);
    const newcomers = served.filter(([, row]) => row.first >= from && row.first <= to);
    const ranked = served.sort((a, b) => b[1].spent - a[1].spent);
    return {
      title: "Clients",
      note: "Spend and visits count completed sales in this range. A client is new when their first sale falls in the range.",
      empty: "No client sales in this range.",
      metrics: [
        { label: "Clients served", value: served.length },
        { label: "Client spend", value: ksh(sum(served, ([, row]) => row.spent)) },
        { label: "Average spend", value: ksh(served.length ? sum(served, ([, row]) => row.spent) / served.length : 0) },
        { label: "New clients", value: newcomers.length },
      ],
      columns: ["Client", "Status", "Visits", "Spent", "Last sale"],
      rows: ranked.map(([id, row]) => {
        const client = spa.clients.find((item) => item.id === id);
        return [client?.name || "Client", client?.status || "—", String(row.visits), ksh(row.spent), row.last || "—"];
      }),
    };
  }

  if (report === "services") {
    const map = new Map();
    for (const sale of sales) {
      for (const line of sale.lines) {
        if (line.kind !== "service") continue;
        const current = map.get(line.name) || { qty: 0, revenue: 0, category: spa.services.find((item) => item.id === line.refId)?.category || "—" };
        current.qty += Number(line.qty) || 0;
        current.revenue += (Number(line.price) || 0) * (Number(line.qty) || 0);
        map.set(line.name, current);
      }
    }
    const ranked = [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
    return {
      title: "Services sold",
      empty: "No services sold in this range.",
      metrics: [
        { label: "Services sold", value: sum(ranked, ([, row]) => row.qty) },
        { label: "Service revenue", value: ksh(serviceRevenue) },
        { label: "Share of sales", value: revenue ? `${Math.round((serviceRevenue / revenue) * 100)}%` : "—" },
        { label: "Top service", value: ranked[0]?.[0] || "—" },
      ],
      mix: {
        title: "Revenue by service",
        empty: "No services sold in this range.",
        rows: ranked.slice(0, 6).map(([label, row]) => ({ label, amount: row.revenue })),
      },
      columns: ["Service", "Category", "Qty", "Revenue", "Share"],
      rows: ranked.map(([name, row]) => [
        name,
        row.category,
        String(row.qty),
        ksh(row.revenue),
        serviceRevenue ? `${Math.round((row.revenue / serviceRevenue) * 100)}%` : "—",
      ]),
    };
  }

  if (report === "retail") {
    const sold = new Map();
    for (const sale of sales) {
      for (const line of sale.lines) {
        if (line.kind !== "product") continue;
        const current = sold.get(line.refId || line.name) || { name: line.name, qty: 0, revenue: 0, cost: 0 };
        current.qty += Number(line.qty) || 0;
        current.revenue += (Number(line.price) || 0) * (Number(line.qty) || 0);
        current.cost += (Number(line.cost) || 0) * (Number(line.qty) || 0);
        sold.set(line.refId || line.name, current);
      }
    }
    const low = spa.products.filter((item) => stockStatus(item) !== "In stock").length;
    return {
      title: "Retail and stock",
      note: "Sold columns use this date range. Quantity on hand and stock status are the current shelf, not a historical count.",
      empty: "No retail products on this branch.",
      metrics: [
        { label: "Retail revenue", value: ksh(retailRevenue) },
        { label: "Cost of goods", value: ksh(cogs) },
        { label: "Retail margin", value: ksh(retailRevenue - cogs) },
        { label: "Low or out", value: low, hint: `${ksh(sum(spa.products, (item) => item.cost * item.qty))} on hand` },
      ],
      columns: ["Product", "Sold", "Revenue", "Cost", "On hand", "Status"],
      rows: spa.products.map((item) => {
        const row = sold.get(item.id) || { qty: 0, revenue: 0, cost: 0 };
        return [item.name, String(row.qty), ksh(row.revenue), ksh(row.cost), String(item.qty), stockStatus(item)];
      }),
    };
  }

  if (report === "expenses") {
    const pending = expenses.filter((item) => item.status === "pending");
    const byCategory = new Map();
    for (const item of approvedExpenses) {
      byCategory.set(item.category, (byCategory.get(item.category) || 0) + (Number(item.amount) || 0));
    }
    const mix = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([label, amount]) => ({ label, amount }));
    return {
      title: "Expenses",
      note: "Estimated profit uses approved expenses only. Pending amounts stay out until they are approved.",
      empty: "No expenses in this range.",
      metrics: [
        { label: "Approved", value: ksh(expenseTotal) },
        { label: "Pending", value: ksh(sum(pending, (item) => item.amount)) },
        { label: "Revenue", value: ksh(revenue) },
        { label: "Estimated profit", value: ksh(profit) },
      ],
      mix: { title: "Approved by category", empty: "No approved expenses in this range.", rows: mix },
      columns: ["Date", "Category", "Amount", "Method", "Status"],
      rows: [...expenses].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((item) => [
        item.date,
        item.category,
        ksh(item.amount),
        item.method || "—",
        statusLabel(item.status),
      ]),
    };
  }

  const methods = ["cash", "mpesa", "card", "split"].map((method) => ({
    label: methodLabel(method),
    amount: sum(sales, (sale) => (sale.payment?.parts || []).filter((part) => part.method === method).reduce((partSum, part) => partSum + (Number(part.amount) || 0), 0)),
  })).filter((item) => item.amount > 0);

  return {
    title: "Daily summary",
    note: "Estimated profit is completed sales, minus the cost recorded on retail lines, minus approved expenses.",
    empty: "No sales or appointments in this range.",
    metrics: [
      { label: "Revenue", value: ksh(revenue), hint: `${sales.length} tickets` },
      { label: "Services", value: ksh(serviceRevenue) },
      { label: "Retail", value: ksh(retailRevenue) },
      { label: "Estimated profit", value: ksh(profit) },
    ],
    days,
    mix: { title: "Payments", empty: "No payments in this range.", rows: methods },
    columns: ["Date", "Tickets", "Revenue", "Appointments"],
    rows: days.filter((day) => day.tickets || day.appointments || day.revenue).map((day) => [
      day.date,
      String(day.tickets),
      ksh(day.revenue),
      String(day.appointments),
    ]),
  };
}

function lineTotal(sale, kind) {
  return (sale.lines || []).filter((line) => line.kind === kind).reduce((sum, line) => sum + (Number(line.price) || 0) * (Number(line.qty) || 0), 0);
}

function sum(rows, read) {
  return rows.reduce((total, row) => total + (Number(read(row)) || 0), 0);
}

function methodLabel(value) {
  if (value === "mpesa") return "M-Pesa";
  if (value === "split") return "Split";
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}

function statusLabel(value) {
  return String(value || "—").replaceAll("_", " ");
}

function eachDay(from, to) {
  if (!from || !to || from > to) return [];
  const days = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end && days.length < 62) {
    days.push(todayISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function axisLabel(iso, from, to) {
  const date = new Date(`${iso}T12:00:00`);
  const span = eachDay(from, to).length;
  if (span <= 7) return date.toLocaleDateString("en-KE", { weekday: "short" });
  return String(date.getDate());
}

export function weekStart(iso) {
  const date = new Date(`${iso}T12:00:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return todayISO(date);
}

export function monthStart(iso) {
  return `${iso.slice(0, 7)}-01`;
}

export function daysAgo(count) {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return date;
}

export function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

