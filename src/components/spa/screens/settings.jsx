"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { businessLabel } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Button, Card, Field, PageHeader, SpaSelect, inputClass, pillClass, textAreaClass } from "@/components/spa/ui";

const TABS = ["Profile", "Branches", "Business type", "Hours", "Receipt", "Tax", "Payments", "Users"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SettingsScreen({ embedded = false }) {
  const spa = useSpa();
  const [tab, setTab] = useState("Profile");
  const [profile, setProfile] = useState(spa.profile);
  const [branchName, setBranchName] = useState("");
  const [hours, setHours] = useState(spa.hours);
  const [user, setUser] = useState({ name: "", email: "", role: "Cashier" });

  useEffect(() => {
    if (!spa.ready) return;
    setProfile(spa.profile);
    setHours(spa.hours);
  }, [spa.ready, spa.profile, spa.hours]);

  return (
    <div>
      {embedded ? null : <PageHeader title="SPA & Kinyozi" detail={`${businessLabel(spa.businessType)} · ${spa.branch}`} />}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button key={item} type="button" className={pillClass(tab === item)} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "Profile" ? (
        <Card className="max-w-xl space-y-3">
          <Field label="Business name"><input className={inputClass} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></Field>
          <Field label="Phone"><input className={inputClass} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></Field>
          <Field label="Email"><input className={inputClass} value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></Field>
          <Field label="Address"><input className={inputClass} value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} /></Field>
          <Field label="KRA PIN"><input className={inputClass} value={profile.pin} onChange={(event) => setProfile({ ...profile, pin: event.target.value })} /></Field>
          <Button onClick={() => { const error = spa.saveProfile(profile); if (error) toast.error(error); else toast.success("Profile saved."); }}>Save profile</Button>
        </Card>
      ) : null}
      {tab === "Branches" ? (
        <Card className="max-w-xl">
          <ul className="space-y-2 text-sm">{spa.branches.map((branch) => <li key={branch} className="flex justify-between"><span>{branch}</span>{branch === spa.branch ? <span className="text-[var(--theme-accent-text)]">Current</span> : <button type="button" className="text-[var(--theme-accent-text)]" onClick={() => spa.setBranch(branch)}>Use</button>}</li>)}</ul>
          <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); const error = spa.addBranch(branchName); if (error) toast.error(error); else { toast.success("Branch added."); setBranchName(""); } }}>
            <input className={inputClass} aria-label="New branch" value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="Branch name" />
            <Button type="submit">Add</Button>
          </form>
        </Card>
      ) : null}
      {tab === "Business type" ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["spa", "Centrix SPA", "Rooms, packages and therapist sessions."],
            ["kinyozi", "Centrix Kinyozi", "Chairs, walk-ins and service combos."],
            ["combined", "SPA & Kinyozi", "Both sets of tools in one shop."],
          ].map(([id, title, detail]) => (
            <Card key={id}>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-slate-500">{detail}</p>
              <Button className="mt-4" variant={spa.businessType === id ? "navy" : "ghost"} onClick={() => { spa.setBusinessType(id); toast.success(`${title} is now the shop type.`); }}>{spa.businessType === id ? "Selected" : "Select"}</Button>
            </Card>
          ))}
        </div>
      ) : null}
      {tab === "Hours" ? (
        <Card className="max-w-xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opens"><input className={inputClass} type="time" value={hours.open} onChange={(event) => setHours({ ...hours, open: event.target.value })} /></Field>
            <Field label="Closes"><input className={inputClass} type="time" value={hours.close} onChange={(event) => setHours({ ...hours, close: event.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={hours.days.includes(day)} onChange={(event) => setHours((current) => ({ ...current, days: event.target.checked ? [...current.days, day] : current.days.filter((item) => item !== day) }))} />{day}</label>
            ))}
          </div>
          <Button onClick={() => { spa.saveHours(hours); toast.success("Working hours saved."); }}>Save hours</Button>
        </Card>
      ) : null}
      {tab === "Receipt" ? (
        <Card className="max-w-xl space-y-3">
          <Field label="Footer"><textarea className={textAreaClass} rows={3} value={spa.receipt.footer} onChange={(event) => spa.saveReceipt({ footer: event.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={spa.receipt.showPin} onChange={(event) => spa.saveReceipt({ showPin: event.target.checked })} /> Show KRA PIN on receipts</label>
        </Card>
      ) : null}
      {tab === "Tax" ? (
        <Card className="max-w-sm space-y-3">
          <Field label="Tax rate %"><input className={inputClass} type="number" min="0" max="100" defaultValue={spa.taxRate} onBlur={(event) => { spa.saveTax(event.target.value); toast.success("Tax rate saved."); }} /></Field>
          <p className="text-xs text-slate-500">Applied on the till after discounts. Leave at 0 when prices already include tax.</p>
        </Card>
      ) : null}
      {tab === "Payments" ? (
        <Card className="max-w-sm space-y-3">
          {["cash", "mpesa", "card"].map((method) => (
            <label key={method} className="flex items-center gap-2 text-sm capitalize">
              <input type="checkbox" checked={spa.payments[method] !== false} onChange={(event) => spa.savePayments({ ...spa.payments, [method]: event.target.checked })} />
              {method === "mpesa" ? "M-Pesa" : method}
            </label>
          ))}
          <p className="text-xs text-slate-500">These choices only change what the till offers. They do not connect a payment gateway.</p>
        </Card>
      ) : null}
      {tab === "Users" ? (
        <Card>
          <ul className="space-y-2 text-sm">{spa.users.map((item) => <li key={item.id} className="flex justify-between"><span>{item.name} · {item.email}</span><span className="text-slate-500">{item.role}</span></li>)}</ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input className={inputClass} placeholder="Name" aria-label="User name" value={user.name} onChange={(event) => setUser({ ...user, name: event.target.value })} />
            <input className={inputClass} placeholder="Email" aria-label="User email" value={user.email} onChange={(event) => setUser({ ...user, email: event.target.value })} />
            <SpaSelect aria-label="Role" value={user.role} onChange={(event) => setUser({ ...user, role: event.target.value })} options={spa.roles.map((role) => ({ value: role.name, label: role.name }))} />
          </div>
          <Button className="mt-3" onClick={() => { const error = spa.saveUser(user); if (error) toast.error(error); else { toast.success("User added."); setUser({ name: "", email: "", role: "Cashier" }); } }}>Add user</Button>
          <div className="mt-4 text-xs text-slate-500">{spa.roles.map((role) => <p key={role.id}>{role.name}: {role.permissions.join(", ")}</p>)}</div>
          <Button className="mt-4" variant="danger" onClick={() => { spa.resetDemo(); toast.success("Sample records restored."); }}>Restore sample data</Button>
        </Card>
      ) : null}
    </div>
  );
}
