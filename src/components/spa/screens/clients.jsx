"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { RecordFormActions, RecordFormPage, useRecordExit } from "@/components/record-form-page";
import { ServiceReceiptDialog } from "@/components/service-receipt-dialog";
import { buildSpaSaleReceipt } from "@/lib/service-receipt";
import { toast } from "@/lib/toast";
import { datePart, formatTime, ksh } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { useAppRouter } from "@/lib/use-app-router";
import { Badge, Button, Empty, Field, PageHeader, SpaFilters, SpaSearch, SpaSelect, Table, accentLinkClass, inputClass, pillClass, primaryLinkClass, toOptions } from "@/components/spa/ui";

export function ClientsScreen() {
  const spa = useSpa();
  const router = useAppRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const rows = spa.clients.filter((client) => {
    const q = query.trim().toLowerCase();
    const matches = !q || client.name.toLowerCase().includes(q) || client.phone.includes(q);
    return matches && (status === "All" || client.status === status);
  });

  return (
    <div>
      <PageHeader title="Clients" detail="Directory, spending and loyalty for this branch.">
        <AppNavLink href="/spa/clients/new" className={primaryLinkClass}>Add client</AppNavLink>
      </PageHeader>
      <SpaFilters>
        <SpaSearch placeholder="Search name or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
        <SpaSelect toolbar aria-label="Client status" value={status} onChange={(event) => setStatus(event.target.value)} options={toOptions(["All", "VIP", "Active", "New"])} />
      </SpaFilters>
      {rows.length === 0 ? <Empty title="No clients match" detail="Try another name, or add a client." /> : (
        <Table columns={["Client", "Phone", "Visits", "Spent", "Loyalty", "Status", ""]} rows={rows} onCreate={() => router.push("/spa/clients/new")} createLabel="Add client" render={(client) => (
          <tr key={client.id} className="border-b border-slate-50">
            <td className="px-4 py-3 font-medium">{client.name}</td>
            <td className="px-4 py-3">{client.phone}</td>
            <td className="px-4 py-3">{client.visits}</td>
            <td className="px-4 py-3">{ksh(client.spent)}</td>
            <td className="px-4 py-3">{client.loyalty}</td>
            <td className="px-4 py-3"><Badge tone={client.status === "VIP" ? "blue" : "green"}>{client.status}</Badge></td>
            <td className="px-4 py-3 text-right"><AppNavLink className={accentLinkClass} href={`/spa/clients/${client.id}`}>Open</AppNavLink></td>
          </tr>
        )} />
      )}
    </div>
  );
}

export function ClientDetailScreen({ id }) {
  const spa = useSpa();
  const { organization } = useAuth();
  const client = spa.clients.find((item) => item.id === id);
  const [tab, setTab] = useState("appointments");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [paper, setPaper] = useState("a4");
  if (!client) return <Empty title="Client not found" detail="They may have been removed from this browser's sample data." />;
  const appointments = spa.appointments.filter((item) => item.clientId === id);
  const purchases = spa.sales.filter((item) => item.clientId === id && item.status === "completed");
  const notes = spa.clientNotes.filter((item) => item.clientId === id);
  const memberships = spa.memberships.filter((item) => item.clientId === id);
  const packages = spa.packages.filter((item) => item.clientId === id);

  return (
    <div>
      <PageHeader title={client.name} detail={`${client.phone} · ${client.email || "No email"} · ${ksh(client.spent)} spent · ${client.loyalty} points`}>
        <Badge tone="blue">{client.status}</Badge>
        <AppNavLink href={`/spa/clients/${client.id}/edit`} className="theme-secondary-btn inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium">Edit</AppNavLink>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {["appointments", "purchases", "notes", "memberships", "packages"].map((item) => (
          <button key={item} type="button" className={`${pillClass(tab === item)} capitalize`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "appointments" ? <SimpleList rows={appointments} empty="No appointments yet." render={(item) => {
        const service = spa.services.find((row) => row.id === item.serviceId);
        return <p key={item.id}>{formatTime(item.start)} · {datePart(item.start)} · {service?.name} · {item.status.replace("_", " ")}</p>;
      }} /> : null}
      {tab === "purchases" ? <SimpleList rows={purchases} empty="No purchases yet." render={(item) => (
        <p key={item.id} className="flex items-center justify-between gap-3">
          <span>{item.number} · {ksh(item.total)} · {item.payment.method}</span>
          <button type="button" className="theme-link text-sm font-medium" onClick={() => setReceipt(item)}>Receipt</button>
        </p>
      )} /> : null}
      {receipt ? (
        <ServiceReceiptDialog
          receipt={buildSpaSaleReceipt(receipt, spa, organization)}
          paper={paper}
          onPaper={setPaper}
          onClose={() => setReceipt(null)}
        />
      ) : null}
      {tab === "notes" ? (
        <div className="theme-panel rounded-xl border p-4 shadow-sm">
          <form className="flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            const error = spa.addClientNote(id, note);
            if (error) toast.error(error);
            else { setNote(""); toast.success("Note saved."); }
          }}>
            <input className={inputClass} value={note} aria-label="Client note" onChange={(event) => setNote(event.target.value)} placeholder="Add a note" />
            <Button type="submit">Save</Button>
          </form>
          <div className="mt-4 space-y-2 text-sm">{notes.map((item) => <p key={item.id}>{item.text}</p>)}{notes.length === 0 ? <p className="text-slate-500">No notes yet.</p> : null}</div>
        </div>
      ) : null}
      {tab === "memberships" ? <SimpleList rows={memberships} empty="No membership on this client." render={(item) => <p key={item.id}>{item.name} · until {item.expires}</p>} /> : null}
      {tab === "packages" ? spa.features.packages ? <SimpleList rows={packages} empty="No prepaid package." render={(item) => <p key={item.id}>{item.name} · {item.remaining} of {item.total} left</p>} /> : <Empty title="Packages are for spa bookings" detail="Turn on Centrix SPA or the combined setup to track treatment packages." /> : null}
    </div>
  );
}

function SimpleList({ rows, empty, render }) {
  if (rows.length === 0) return <Empty title={empty} />;
  return <div className="theme-panel space-y-2 rounded-xl border p-4 text-sm shadow-sm">{rows.map(render)}</div>;
}

function blank() {
  return { name: "", phone: "", email: "", status: "New", notes: "" };
}

export function ClientFormScreen({ id }) {
  const spa = useSpa();
  const existing = id ? spa.clients.find((item) => item.id === id) : null;
  const title = id ? "Edit client" : "Add client";
  const { exitTo } = useRecordExit(title);
  const [form, setForm] = useState(() => existing || blank());
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  if (id && !existing) return <Empty title="Client not found" detail="They may have been removed from this browser's sample data." />;
  function save(event) {
    event.preventDefault();
    const error = spa.saveClient(form);
    if (error) toast.error(error);
    else {
      toast.success(id ? "Client updated." : "Client saved.");
      exitTo(id ? `/spa/clients/${id}` : "/spa/clients");
    }
  }
  return (
    <RecordFormPage title={title} backHref={id ? `/spa/clients/${id}` : "/spa/clients"}>
      <form onSubmit={save}>
        <div className="grid gap-3">
          <Field label="Name"><input className={inputClass} value={form.name} onChange={set("name")} /></Field>
          <Field label="Phone"><input className={inputClass} value={form.phone} onChange={set("phone")} /></Field>
          <Field label="Email"><input className={inputClass} value={form.email || ""} onChange={set("email")} /></Field>
          <Field label="Status"><SpaSelect value={form.status} onChange={set("status")} options={toOptions(["New", "Active", "VIP"])} /></Field>
        </div>
        <RecordFormActions backHref={id ? `/spa/clients/${id}` : "/spa/clients"} />
      </form>
    </RecordFormPage>
  );
}
