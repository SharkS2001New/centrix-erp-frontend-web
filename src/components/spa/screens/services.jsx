"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { ksh } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Badge, Button, Field, Modal, PageHeader, Table, inputClass } from "@/components/spa/ui";

const CATEGORIES = ["Haircut", "Beard Trim", "Hair Coloring", "Facial Treatment", "Massage", "Manicure", "Pedicure"];

export function ServicesScreen() {
  const spa = useSpa();
  const [editing, setEditing] = useState(null);
  const [category, setCategory] = useState("All");
  const rows = spa.services.filter((item) => category === "All" || item.category === category);

  return (
    <div>
      <PageHeader title="Services" detail="Prices, duration, who can perform them, and commission.">
        <select className={inputClass} aria-label="Service category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option>All</option>
          {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <Button onClick={() => setEditing({ name: "", category: "Haircut", price: 500, duration: 30, staffIds: [], commission: 10, active: true, combo: false })}>Add service</Button>
      </PageHeader>
      <Table columns={["Service", "Category", "Price", "Duration", "Commission", "Status", ""]} rows={rows} render={(service) => (
        <tr key={service.id} className="border-b border-slate-50">
          <td className="px-4 py-3 font-medium">{service.name}{service.combo ? " · combo" : ""}</td>
          <td className="px-4 py-3">{service.category}</td>
          <td className="px-4 py-3">{ksh(service.price)}</td>
          <td className="px-4 py-3">{service.duration} min</td>
          <td className="px-4 py-3">{service.commission}%</td>
          <td className="px-4 py-3"><Badge tone={service.active ? "green" : "slate"}>{service.active ? "Active" : "Inactive"}</Badge></td>
          <td className="px-4 py-3 text-right"><button type="button" className="text-sm font-medium text-[#1677F2]" onClick={() => setEditing(service)}>Edit</button></td>
        </tr>
      )} />
      {editing ? <ServiceForm spa={spa} service={editing} onClose={() => setEditing(null)} onSave={(service) => {
        const error = spa.saveService(service);
        if (error) toast.error(error);
        else { toast.success("Service saved."); setEditing(null); }
      }} /> : null}
    </div>
  );
}

function ServiceForm({ spa, service, onClose, onSave }) {
  const [form, setForm] = useState(service);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  return (
    <Modal title={service.id ? "Edit service" : "Add service"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={inputClass} value={form.name} onChange={set("name")} /></Field>
        <Field label="Category"><select className={inputClass} value={form.category} onChange={set("category")}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Price (KSh)"><input className={inputClass} type="number" min="0" value={form.price} onChange={set("price")} /></Field>
        <Field label="Duration (minutes)"><input className={inputClass} type="number" min="5" value={form.duration} onChange={set("duration")} /></Field>
        <Field label="Commission %"><input className={inputClass} type="number" min="0" max="100" value={form.commission} onChange={set("commission")} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active !== false} onChange={set("active")} /> Active</label>
        {spa.features.combos ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.combo)} onChange={set("combo")} /> Service combo</label> : null}
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-500">Assigned staff</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {spa.staff.map((person) => (
            <label key={person.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={(form.staffIds || []).includes(person.id)} onChange={(event) => setForm((current) => ({
                ...current,
                staffIds: event.target.checked ? [...(current.staffIds || []), person.id] : (current.staffIds || []).filter((id) => id !== person.id),
              }))} />
              {person.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button onClick={() => onSave(form)}>Save</Button>
      </div>
    </Modal>
  );
}
