"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { useSpa } from "@/lib/spa/store";
import { Button, Field, Modal, PageHeader, Table, inputClass } from "@/components/spa/ui";

export function SuppliersScreen() {
  const spa = useSpa();
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(spa.suppliers[0]?.id || "");
  const supplier = spa.suppliers.find((item) => item.id === openId);
  const purchases = spa.movements.filter((item) => item.type === "in" && item.supplierId === openId);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <PageHeader title="Suppliers" detail="Who you buy from, and the stock they have delivered.">
          <Button onClick={() => setEditing({ name: "", phone: "", email: "", category: "" })}>Add supplier</Button>
        </PageHeader>
        <Table columns={["Supplier", "Phone", "Category", ""]} rows={spa.suppliers} render={(item) => (
          <tr key={item.id} className="border-b border-slate-50">
            <td className="px-4 py-3 font-medium">{item.name}</td>
            <td className="px-4 py-3">{item.phone}</td>
            <td className="px-4 py-3">{item.category}</td>
            <td className="px-4 py-3 text-right">
              <button type="button" className="mr-3 text-sm text-[#1677F2]" onClick={() => setOpenId(item.id)}>Purchases</button>
              <button type="button" className="text-sm text-[#1677F2]" onClick={() => setEditing(item)}>Edit</button>
            </td>
          </tr>
        )} />
      </div>
      <aside className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">{supplier?.name || "Purchases"}</h2>
        <p className="mt-1 text-xs text-slate-500">{supplier?.email}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {purchases.length === 0 ? <li className="text-slate-500">No stock-in recorded for this supplier yet. Receive stock from Inventory.</li> : purchases.map((item) => {
            const product = spa.products.find((row) => row.id === item.productId);
            return <li key={item.id}>{product?.name} · +{item.qty}</li>;
          })}
        </ul>
      </aside>
      {editing ? <SupplierForm supplier={editing} onClose={() => setEditing(null)} onSave={(supplierRow) => {
        const error = spa.saveSupplier(supplierRow);
        if (error) toast.error(error);
        else { toast.success("Supplier saved."); setEditing(null); }
      }} /> : null}
    </div>
  );
}

function SupplierForm({ supplier, onClose, onSave }) {
  const [form, setForm] = useState(supplier);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <Modal title={supplier.id ? "Edit supplier" : "Add supplier"} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Name"><input className={inputClass} value={form.name} onChange={set("name")} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone || ""} onChange={set("phone")} /></Field>
        <Field label="Email"><input className={inputClass} value={form.email || ""} onChange={set("email")} /></Field>
        <Field label="Category"><input className={inputClass} value={form.category || ""} onChange={set("category")} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={() => onSave(form)}>Save</Button></div>
    </Modal>
  );
}
