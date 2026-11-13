"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { datePart, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Badge, Button, Card, Field, PageHeader, SpaSelect, inputClass } from "@/components/spa/ui";

export function MembershipsScreen() {
  const spa = useSpa();
  const [membership, setMembership] = useState({ clientId: "", name: "", expires: "" });
  const [packageForm, setPackageForm] = useState({ clientId: "", name: "", total: 4 });
  const clientOptions = spa.clients.map((client) => ({ value: client.id, label: client.name }));

  function addMembership(event) {
    event.preventDefault();
    const error = spa.saveMembership(membership);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Membership assigned.");
    setMembership({ clientId: "", name: "", expires: "" });
  }

  function addPackage(event) {
    event.preventDefault();
    const error = spa.savePackage(packageForm);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Session package issued.");
    setPackageForm({ clientId: "", name: "", total: 4 });
  }

  return (
    <div>
      <PageHeader title="Memberships & packages" detail="Assign memberships and prepaid service sessions to clients." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="theme-heading font-semibold">Assign membership</h2>
          <form className="mt-3 space-y-3" onSubmit={addMembership}>
            <Field label="Client">
              <SpaSelect value={membership.clientId} onChange={(event) => setMembership({ ...membership, clientId: event.target.value })} placeholder="Choose client" options={clientOptions} />
            </Field>
            <Field label="Membership">
              <input className={inputClass} required value={membership.name} onChange={(event) => setMembership({ ...membership, name: event.target.value })} placeholder="Monthly spa membership" />
            </Field>
            <Field label="Valid until">
              <input className={inputClass} type="date" min={todayISO()} required value={membership.expires} onChange={(event) => setMembership({ ...membership, expires: event.target.value })} />
            </Field>
            <Button type="submit" disabled={clientOptions.length === 0}>Assign membership</Button>
          </form>
        </Card>
        {spa.features.packages ? (
          <Card>
            <h2 className="theme-heading font-semibold">Issue session package</h2>
            <form className="mt-3 space-y-3" onSubmit={addPackage}>
              <Field label="Client">
                <SpaSelect value={packageForm.clientId} onChange={(event) => setPackageForm({ ...packageForm, clientId: event.target.value })} placeholder="Choose client" options={clientOptions} />
              </Field>
              <Field label="Package">
                <input className={inputClass} required value={packageForm.name} onChange={(event) => setPackageForm({ ...packageForm, name: event.target.value })} placeholder="Facial treatment x4" />
              </Field>
              <Field label="Sessions">
                <input className={inputClass} type="number" min="1" step="1" required value={packageForm.total} onChange={(event) => setPackageForm({ ...packageForm, total: event.target.value })} />
              </Field>
              <Button type="submit" disabled={clientOptions.length === 0}>Issue package</Button>
            </form>
          </Card>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="theme-heading mb-2 font-semibold">Active memberships</h2>
          <ul className="divide-y">
            {spa.memberships.map((item) => {
              const client = spa.clients.find((row) => row.id === item.clientId);
              const expired = datePart(item.expires) < todayISO();
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="theme-heading text-sm font-medium">{item.name}</p>
                    <p className="theme-subtext text-xs">{client?.name || "Client removed"} · until {item.expires}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={expired ? "slate" : "green"}>{expired ? "Expired" : "Active"}</Badge>
                    <Button type="button" variant="danger" onClick={() => { spa.removeMembership(item.id); toast.success("Membership removed."); }}>Remove</Button>
                  </div>
                </li>
              );
            })}
            {spa.memberships.length === 0 ? <li className="theme-subtext py-3 text-sm">No memberships assigned yet.</li> : null}
          </ul>
        </Card>
        {spa.features.packages ? (
          <Card>
            <h2 className="theme-heading mb-2 font-semibold">Prepaid packages</h2>
            <ul className="divide-y">
              {spa.packages.map((item) => {
                const client = spa.clients.find((row) => row.id === item.clientId);
                const remaining = Number(item.remaining) || 0;
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="theme-heading text-sm font-medium">{item.name}</p>
                      <p className="theme-subtext text-xs">{client?.name || "Client removed"} · {remaining} of {item.total} sessions left</p>
                    </div>
                    <Button type="button" variant="ghost" disabled={remaining === 0} onClick={() => { const error = spa.usePackage(item.id); if (error) toast.error(error); else toast.success("One session redeemed."); }}>Use session</Button>
                  </li>
                );
              })}
              {spa.packages.length === 0 ? <li className="theme-subtext py-3 text-sm">No prepaid packages issued yet.</li> : null}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
