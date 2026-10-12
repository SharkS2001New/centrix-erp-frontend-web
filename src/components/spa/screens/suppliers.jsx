"use client";

import { useState } from "react";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { RecordFormActions, RecordFormDialog, useRecordExit } from "@/components/record-form-page";
import { toast } from "@/lib/toast";
import { useSpa } from "@/lib/spa/store";
import { useAppRouter } from "@/lib/use-app-router";
import { Empty, Field, MobileFields, PageHeader, Table, inputClass, primaryLinkClass } from "@/components/spa/ui";

export function SuppliersScreen() {
  const spa = useSpa();
  const router = useAppRouter();
  const [openId, setOpenId] = useState(spa.suppliers[0]?.id || "");
  const supplier = spa.suppliers.find((item) => item.id === openId);
  const purchases = spa.movements.filter((item) => item.type === "in" && item.supplierId === openId);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <PageHeader title="Suppliers" detail="Who you buy from, and the stock they have delivered.">
          <AppNavLink href="/spa/suppliers/new" className={primaryLinkClass}>Add supplier</AppNavLink>
        </PageHeader>
        <Table columns={["Supplier", "Phone", "Category", ""]} rows={spa.suppliers} rowKey={(item) => item.id} onCreate={() => router.push("/spa/suppliers/new")} createLabel="Add supplier" card={(item) => (
          <>
            <p className="font-semibold">{item.name}</p>
            <MobileFields rows={[{ label: "Phone", value: item.phone }, { label: "Category", value: item.category }]} />
            <div className="mt-3 flex gap-3">
              <button type="button" className="text-sm text-[var(--theme-accent-text)]" onClick={() => setOpenId(item.id)}>Purchases</button>
              <AppNavLink href={`/spa/suppliers/${item.id}/edit`} className="text-sm text-[var(--theme-accent-text)]">Edit</AppNavLink>
            </div>
          </>
        )} render={(item) => (
          <tr key={item.id} className="border-b border-slate-50">
            <td className="px-4 py-3 font-medium">{item.name}</td>
            <td className="px-4 py-3">{item.phone}</td>
            <td className="px-4 py-3">{item.category}</td>
            <td className="px-4 py-3 text-right">
              <button type="button" className="mr-3 text-sm text-[var(--theme-accent-text)]" onClick={() => setOpenId(item.id)}>Purchases</button>
              <AppNavLink href={`/spa/suppliers/${item.id}/edit`} className="text-sm text-[var(--theme-accent-text)]">Edit</AppNavLink>
            </td>
          </tr>
        )} />
      </div>
      <aside className="theme-panel rounded-xl border p-4 shadow-sm">
        <h2 className="text-sm font-semibold">{supplier?.name || "Purchases"}</h2>
        <p className="mt-1 text-xs text-slate-500">{supplier?.email}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {purchases.length === 0 ? <li className="text-slate-500">No stock-in recorded for this supplier yet. Receive stock from Inventory.</li> : purchases.map((item) => {
            const product = spa.products.find((row) => row.id === item.productId);
            return <li key={item.id}>{product?.name} · +{item.qty}</li>;
          })}
        </ul>
      </aside>
    </div>
  );
}

export function SupplierFormScreen({ id }) {
  const spa = useSpa();
  const existing = id ? spa.suppliers.find((item) => item.id === id) : null;
  const title = id ? "Edit supplier" : "Add supplier";
  const { exitTo } = useRecordExit(title);
  const [form, setForm] = useState(() => existing || { name: "", phone: "", email: "", category: "" });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  if (id && !existing) return <Empty title="Supplier not found" detail="They may have been removed from this browser's sample data." />;
  function save(event) {
    event.preventDefault();
    const error = spa.saveSupplier(form);
    if (error) toast.error(error);
    else {
      toast.success("Supplier saved.");
      exitTo("/spa/suppliers");
    }
  }
  return (
    <>
    <SuppliersScreen />
    <RecordFormDialog title={title} backHref="/spa/suppliers">
      <form onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><input className={inputClass} value={form.name} onChange={set("name")} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone || ""} onChange={set("phone")} /></Field>
        <Field label="Email"><input className={inputClass} value={form.email || ""} onChange={set("email")} /></Field>
        <Field label="Category"><input className={inputClass} value={form.category || ""} onChange={set("category")} /></Field>
      </div>
      <RecordFormActions backHref="/spa/suppliers" />
      </form>
    </RecordFormDialog>
    </>
  );
}
