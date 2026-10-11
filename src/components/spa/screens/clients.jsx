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
import { Badge, Button, Empty, Field, MobileFields, Modal, PageHeader, SpaFilters, SpaSearch, SpaSelect, Table, inputClass, primaryLinkClass, toOptions } from "@/components/spa/ui";

export function ClientsScreen() {
  const spa = useSpa();
  const router = useAppRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [openId, setOpenId] = useState(null);
  const rows = spa.clients.filter((client) => {
    const q = query.trim().toLowerCase();
    const matches = !q || client.name.toLowerCase().includes(q) || client.phone.includes(q);
    return matches && (status === "All" || client.status === status);
  });
  const spent = spa.clients.reduce((sum, client) => sum + (Number(client.spent) || 0), 0);
  const visits = spa.clients.reduce((sum, client) => sum + (Number(client.visits) || 0), 0);

  return (
    <div>
      <PageHeader title="Clients" detail="Directory, spending and loyalty for this branch.">
        <AppNavLink href="/spa/clients/new" className={primaryLinkClass}>Add client</AppNavLink>
      </PageHeader>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Clients" value={String(spa.clients.length)} hint={`${rows.length} showing`} />
        <Stat label="Visits" value={String(visits)} hint="Recorded on these clients" />
        <Stat label="Spent" value={ksh(spent)} hint="Across this directory" />
      </div>
      <SpaFilters>
        <SpaSearch placeholder="Search name or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
        <SpaSelect toolbar aria-label="Client status" value={status} onChange={(event) => setStatus(event.target.value)} options={toOptions(["All", "VIP", "Active", "New"])} />
      </SpaFilters>
      {rows.length === 0 ? <Empty title="No clients match" detail="Try another name, or add a client." /> : (
        <Table columns={["Client", "Phone", "Visits", "Spent", "Loyalty", "Status", ""]} rows={rows} rowKey={(client) => client.id} onCreate={() => router.push("/spa/clients/new")} createLabel="Add client" card={(client) => (
          <button type="button" className="w-full text-left" onClick={() => setOpenId(client.id)}>
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-3">
                <Avatar name={client.name} />
                <span>
                  <span className="block font-semibold">{client.name}</span>
                  <span className="theme-subtext text-xs">{client.phone}</span>
                </span>
              </span>
              <Badge tone={statusTone(client.status)}>{client.status}</Badge>
            </div>
            <MobileFields rows={[{ label: "Visits", value: client.visits }, { label: "Spent", value: ksh(client.spent) }, { label: "Loyalty", value: client.loyalty }]} />
          </button>
        )} render={(client) => (
          <tr key={client.id} className="cursor-pointer border-b border-[var(--theme-border)]/60 hover:bg-[var(--theme-surface-muted)]" onClick={() => setOpenId(client.id)}>
            <td className="px-4 py-3">
              <span className="flex items-center gap-3">
                <Avatar name={client.name} />
                <span>
                  <span className="theme-heading block font-medium">{client.name}</span>
                  {client.email ? <span className="theme-subtext block text-xs">{client.email}</span> : null}
                </span>
              </span>
            </td>
            <td className="px-4 py-3 tabular-nums">{client.phone}</td>
            <td className="px-4 py-3 tabular-nums">{client.visits}</td>
            <td className="px-4 py-3 tabular-nums">{ksh(client.spent)}</td>
            <td className="px-4 py-3 tabular-nums">{client.loyalty}</td>
            <td className="px-4 py-3"><Badge tone={statusTone(client.status)}>{client.status}</Badge></td>
            <td className="px-4 py-3 text-right">
              <button type="button" className="text-sm font-medium text-[var(--theme-accent-text)]" onClick={() => setOpenId(client.id)}>Open</button>
            </td>
          </tr>
        )} />
      )}
      {openId ? <ClientDialog id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function ClientDialog({ id, onClose }) {
  const spa = useSpa();
  const client = spa.clients.find((item) => item.id === id);
  if (!client) return null;
  return (
    <Modal title={client.name} onClose={onClose} wide>
      <ClientRecord id={id} />
    </Modal>
  );
}

export function ClientDetailScreen({ id }) {
  const spa = useSpa();
  const client = spa.clients.find((item) => item.id === id);
  if (!client) return <Empty title="Client not found" detail="They may have been removed from this browser's sample data." />;
  return (
    <div>
      <PageHeader title={client.name} detail={`${client.phone}${client.email ? ` · ${client.email}` : ""}`}>
        <Badge tone={statusTone(client.status)}>{client.status}</Badge>
      </PageHeader>
      <ClientRecord id={id} />
    </div>
  );
}

function ClientRecord({ id }) {
  const spa = useSpa();
  const { organization } = useAuth();
  const client = spa.clients.find((item) => item.id === id);
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [paper, setPaper] = useState("a4");
  if (!client) return null;
  const appointments = spa.appointments.filter((item) => item.clientId === id);
  const purchases = spa.sales.filter((item) => item.clientId === id && item.status === "completed");
  const notes = spa.clientNotes.filter((item) => item.clientId === id);
  const memberships = spa.memberships.filter((item) => item.clientId === id);
  const packages = spa.packages.filter((item) => item.clientId === id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="theme-subtext text-sm">{client.phone}{client.email ? ` · ${client.email}` : ""}</p>
        <AppNavLink href={`/spa/clients/${client.id}/edit`} className="theme-secondary-btn inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium">Edit</AppNavLink>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Visits" value={String(client.visits)} />
        <Stat label="Spent" value={ksh(client.spent)} />
        <Stat label="Loyalty" value={String(client.loyalty)} hint="Points" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RecordBlock title="Appointments" empty={appointments.length === 0} emptyText="No appointments yet.">
          {appointments.map((item) => {
            const service = spa.services.find((row) => row.id === item.serviceId);
            return (
              <p key={item.id} className="flex items-start justify-between gap-3 border-b border-[var(--theme-border)]/60 py-2 last:border-0">
                <span>
                  <span className="theme-heading block font-medium">{service?.name || "Service"}</span>
                  <span className="theme-subtext text-xs">{formatTime(item.start)} · {datePart(item.start)}</span>
                </span>
                <span className="theme-subtext text-xs capitalize">{item.status.replaceAll("_", " ")}</span>
              </p>
            );
          })}
        </RecordBlock>
        <RecordBlock title="Purchases" empty={purchases.length === 0} emptyText="No purchases yet.">
          {purchases.map((item) => (
            <p key={item.id} className="flex items-center justify-between gap-3 border-b border-[var(--theme-border)]/60 py-2 last:border-0">
              <span>
                <span className="theme-heading block font-medium">{item.number}</span>
                <span className="theme-subtext text-xs capitalize">{item.payment?.method || "Paid"} · {ksh(item.total)}</span>
              </span>
              <button type="button" className="text-sm font-medium text-[var(--theme-accent-text)]" onClick={() => setReceipt(item)}>Receipt</button>
            </p>
          ))}
        </RecordBlock>
        <RecordBlock title="Notes">
          <form className="mb-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => {
            event.preventDefault();
            const error = spa.addClientNote(id, note);
            if (error) toast.error(error);
            else { setNote(""); toast.success("Note saved."); }
          }}>
            <input className={inputClass} value={note} aria-label="Client note" onChange={(event) => setNote(event.target.value)} placeholder="Add a note" />
            <Button type="submit">Save</Button>
          </form>
          {notes.length === 0 ? <p className="theme-subtext text-sm">No notes yet.</p> : notes.map((item) => <p key={item.id} className="border-b border-[var(--theme-border)]/60 py-2 text-sm last:border-0">{item.text}</p>)}
        </RecordBlock>
        <div className="space-y-4">
          <RecordBlock title="Memberships" empty={memberships.length === 0} emptyText="No membership on this client.">
            {memberships.map((item) => <p key={item.id} className="py-2 text-sm"><span className="theme-heading font-medium">{item.name}</span> <span className="theme-subtext">· until {item.expires}</span></p>)}
          </RecordBlock>
          {spa.features.packages ? (
            <RecordBlock title="Packages" empty={packages.length === 0} emptyText="No prepaid package.">
              {packages.map((item) => <p key={item.id} className="py-2 text-sm"><span className="theme-heading font-medium">{item.name}</span> <span className="theme-subtext">· {item.remaining} of {item.total} left</span></p>)}
            </RecordBlock>
          ) : null}
        </div>
      </div>
      {receipt ? (
        <ServiceReceiptDialog
          receipt={buildSpaSaleReceipt(receipt, spa, organization)}
          paper={paper}
          onPaper={setPaper}
          onClose={() => setReceipt(null)}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
      <p className="theme-subtext text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <p className="theme-heading mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="theme-subtext mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}

function Avatar({ name }) {
  const parts = String(name || "").trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--theme-primary)_14%,white)] text-xs font-semibold text-[var(--theme-accent-text)]">{letters}</span>;
}

function statusTone(status) {
  if (status === "VIP") return "blue";
  if (status === "New") return "amber";
  return "green";
}

function RecordBlock({ title, empty = false, emptyText, children }) {
  return (
    <section className="theme-panel rounded-xl border p-4 shadow-sm">
      <h3 className="theme-heading text-sm font-semibold">{title}</h3>
      <div className="mt-2">{empty ? <p className="theme-subtext text-sm">{emptyText}</p> : children}</div>
    </section>
  );
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
