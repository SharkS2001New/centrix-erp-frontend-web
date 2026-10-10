"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { ksh, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Badge, Button, Field, Modal, PageHeader, SpaContextMenu, SpaSelect, Table, inputClass } from "@/components/spa/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function StaffScreen() {
  const spa = useSpa();
  const [tab, setTab] = useState("directory");
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const today = todayISO();
  const blankStaff = { name: "", role: "Stylist", phone: "", commission: 10, active: true, days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };

  const rows = spa.staff.map((person) => {
    const revenue = spa.sales.filter((sale) => sale.status === "completed").reduce((sum, sale) => {
      return sum + sale.lines.filter((line) => line.staffId === person.id && line.kind === "service").reduce((lineSum, line) => lineSum + line.price * line.qty, 0);
    }, 0);
    const earned = Math.round(revenue * (Number(person.commission) || 0) / 100);
    return { person, revenue, earned, paid: earned > 0 && person.active };
  });

  return (
    <div>
      <PageHeader title="Staff & commissions" detail="Who is in today, what they earn, and whether it is ready to pay.">
        <Button onClick={() => setEditing(blankStaff)}>Add staff</Button>
      </PageHeader>
      <div className="mb-4 flex gap-2">
        {["directory", "commissions"].map((item) => (
          <button key={item} type="button" className={`${tab === item ? "bg-[var(--theme-primary)] text-white" : "theme-secondary-btn"} rounded-full px-3 py-1.5 text-sm capitalize`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "directory" ? (
        <div
          className="grid gap-3 md:grid-cols-2"
          onDoubleClick={(event) => {
            if (event.target.closest("article, button, select, input")) return;
            setEditing(blankStaff);
          }}
          onContextMenu={(event) => {
            if (event.target.closest("button, select, input")) return;
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          {spa.staff.map((person) => {
            const attendance = spa.attendance.find((row) => row.staffId === person.id && row.date === today);
            return (
              <article key={person.id} className="theme-panel rounded-xl border p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{person.name}</h2>
                    <p className="text-sm text-slate-500">{person.role} · {person.phone}</p>
                  </div>
                  <Badge tone={person.active ? "green" : "slate"}>{person.active ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="mt-3 text-xs text-slate-500">Works {person.days.join(", ") || "No days set"} · {person.commission}% commission</p>
                <div className="mt-3">
                  <Field label="Today">
                    <SpaSelect aria-label={`Attendance for ${person.name}`} value={attendance?.status || "present"} onChange={(event) => spa.setAttendance(person.id, event.target.value)} options={[{ value: "present", label: "Present" }, { value: "late", label: "Late" }, { value: "off", label: "Off" }]} />
                  </Field>
                </div>
                <button type="button" className="mt-3 text-sm font-medium text-[var(--theme-accent-text)]" onClick={() => setEditing(person)}>Edit profile</button>
              </article>
            );
          })}
        </div>
      ) : (
        <Table columns={["Staff", "Service revenue", "Commission", "Earned", "Payout"]} rows={rows} onCreate={() => setEditing(blankStaff)} createLabel="Add staff" render={({ person, revenue, earned, paid }) => (
          <tr key={person.id} className="border-b border-slate-50">
            <td className="px-4 py-3 font-medium">{person.name}</td>
            <td className="px-4 py-3">{ksh(revenue)}</td>
            <td className="px-4 py-3">{person.commission}%</td>
            <td className="px-4 py-3">{ksh(earned)}</td>
            <td className="px-4 py-3"><Badge tone={paid ? "green" : "amber"}>{paid ? "Ready" : "Nothing due"}</Badge></td>
          </tr>
        )} />
      )}
      <SpaContextMenu menu={menu} onClose={() => setMenu(null)} items={[{ label: "Add staff", onSelect: () => setEditing(blankStaff) }]} />
      {editing ? <StaffForm person={editing} onClose={() => setEditing(null)} onSave={(person) => {
        const error = spa.saveStaff(person);
        if (error) toast.error(error);
        else { toast.success("Staff saved."); setEditing(null); }
      }} /> : null}
    </div>
  );
}

function StaffForm({ person, onClose, onSave }) {
  const [form, setForm] = useState(person);
  return (
    <Modal title={person.id ? "Edit staff" : "Add staff"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Role"><input className={inputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label="Commission %"><input className={inputClass} type="number" min="0" value={form.commission} onChange={(event) => setForm({ ...form, commission: event.target.value })} /></Field>
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-500">Availability</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <label key={day} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={(form.days || []).includes(day)} onChange={(event) => setForm((current) => ({
                ...current,
                days: event.target.checked ? [...(current.days || []), day] : current.days.filter((item) => item !== day),
              }))} />
              {day}
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
