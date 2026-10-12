"use client";

import { useState } from "react";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { RecordFormActions, RecordFormDialog, useRecordExit } from "@/components/record-form-page";
import { toast } from "@/lib/toast";
import { ksh, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { useAppRouter } from "@/lib/use-app-router";
import { Badge, Empty, Field, MobileFields, PageHeader, SpaContextMenu, SpaSelect, Table, inputClass, primaryLinkClass } from "@/components/spa/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function StaffScreen() {
  const spa = useSpa();
  const router = useAppRouter();
  const [menu, setMenu] = useState(null);
  const today = todayISO();

  const rows = spa.staff.map((person) => {
    const revenue = spa.sales.filter((sale) => sale.status === "completed").reduce((sum, sale) => {
      return sum + sale.lines.filter((line) => line.staffId === person.id && line.kind === "service").reduce((lineSum, line) => lineSum + line.price * line.qty, 0);
    }, 0);
    const earned = Math.round(revenue * (Number(person.commission) || 0) / 100);
    return { person, revenue, earned, paid: earned > 0 && person.active };
  });

  return (
    <div>
      <PageHeader title="Staff & commissions" detail="Add a person and set their commission on the same form. Earnings below use that rate.">
        <AppNavLink href="/spa/staff/new" className={primaryLinkClass}>Add staff</AppNavLink>
      </PageHeader>
      <div
          className="grid gap-3 md:grid-cols-2"
          onDoubleClick={(event) => {
            if (event.target.closest("article, button, select, input")) return;
            router.push("/spa/staff/new");
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
                <AppNavLink href={`/spa/staff/${person.id}/edit`} className="mt-3 inline-block text-sm font-medium text-[var(--theme-accent-text)]">Edit</AppNavLink>
              </article>
            );
          })}
        </div>
      <h2 className="theme-heading mb-3 mt-6 text-sm font-semibold">Commission earnings</h2>
      <Table columns={["Staff", "Service revenue", "Commission", "Earned", "Payout"]} rows={rows} rowKey={(row) => row.person.id} onCreate={() => router.push("/spa/staff/new")} createLabel="Add staff" card={({ person, revenue, earned, paid }) => (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{person.name}</p>
            <Badge tone={paid ? "green" : "amber"}>{paid ? "Ready" : "Nothing due"}</Badge>
          </div>
          <MobileFields rows={[{ label: "Service revenue", value: ksh(revenue) }, { label: "Commission", value: `${person.commission}%` }, { label: "Earned", value: ksh(earned) }]} />
        </>
      )} render={({ person, revenue, earned, paid }) => (
        <tr key={person.id} className="border-b border-slate-50">
          <td className="px-4 py-3 font-medium">{person.name}</td>
          <td className="px-4 py-3">{ksh(revenue)}</td>
          <td className="px-4 py-3">{person.commission}%</td>
          <td className="px-4 py-3">{ksh(earned)}</td>
          <td className="px-4 py-3"><Badge tone={paid ? "green" : "amber"}>{paid ? "Ready" : "Nothing due"}</Badge></td>
        </tr>
      )} />
      <SpaContextMenu menu={menu} onClose={() => setMenu(null)} items={[{ label: "Add staff", onSelect: () => router.push("/spa/staff/new") }]} />
    </div>
  );
}

export function StaffFormScreen({ id }) {
  const spa = useSpa();
  const existing = id ? spa.staff.find((item) => item.id === id) : null;
  const title = id ? "Edit staff" : "Add staff";
  const { exitTo } = useRecordExit(title);
  const [form, setForm] = useState(() => existing || { name: "", role: "Stylist", phone: "", commission: 10, active: true, days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] });
  if (id && !existing) return <Empty title="Staff member not found" detail="They may have been removed from this browser's sample data." />;
  function save(event) {
    event.preventDefault();
    const error = spa.saveStaff(form);
    if (error) toast.error(error);
    else {
      toast.success("Staff saved.");
      exitTo("/spa/staff");
    }
  }
  return (
    <>
    <StaffScreen />
    <RecordFormDialog title={title} backHref="/spa/staff">
      <form onSubmit={save}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={inputClass} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Role"><input className={inputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label="Commission %">
          <input className={inputClass} type="number" min="0" max="100" required value={form.commission} onChange={(event) => setForm({ ...form, commission: event.target.value })} />
        </Field>
      </div>
      <p className="theme-subtext mt-2 text-sm">Commission is part of this staff record. Service sales use this rate.</p>
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
      <RecordFormActions backHref="/spa/staff" />
      </form>
    </RecordFormDialog>
    </>
  );
}
