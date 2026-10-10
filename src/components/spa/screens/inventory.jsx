"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { formatTime, ksh, stockStatus } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Badge, Button, Field, Modal, PageHeader, SpaSearch, SpaSelect, Table, inputClass, toOptions } from "@/components/spa/ui";

export function InventoryScreen() {
  const spa = useSpa();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const [movement, setMovement] = useState(null);
  const rows = spa.products.filter((item) => {
    const q = query.trim().toLowerCase();
    const matches = !q || item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
    const status = stockStatus(item);
    return matches && (filter === "All" || status === filter);
  });

  return (
    <div>
      <PageHeader title="Inventory" detail="Retail stock, reorder alerts and movements for this branch.">
        <SpaSearch placeholder="Search SKU or name" value={query} onChange={(event) => setQuery(event.target.value)} />
        <SpaSelect toolbar aria-label="Stock status" value={filter} onChange={(event) => setFilter(event.target.value)} options={toOptions(["All", "In stock", "Low stock", "Out of stock"])} />
        <Button onClick={() => setEditing({ sku: "", name: "", category: "Hair care", supplierId: spa.suppliers[0]?.id || "", cost: 0, price: 0, qty: 0, reorder: 5 })}>Add product</Button>
      </PageHeader>
      <Table columns={["SKU", "Product", "Supplier", "Cost", "Price", "Qty", "Reorder", "Status", ""]} rows={rows} onCreate={() => setEditing({ sku: "", name: "", category: "Hair care", supplierId: spa.suppliers[0]?.id || "", cost: 0, price: 0, qty: 0, reorder: 5 })} createLabel="Add product" render={(product) => {
        const status = stockStatus(product);
        return (
          <tr key={product.id} className="border-b border-slate-50">
            <td className="px-4 py-3">{product.sku}</td>
            <td className="px-4 py-3 font-medium">{product.name}</td>
            <td className="px-4 py-3">{spa.suppliers.find((item) => item.id === product.supplierId)?.name || "—"}</td>
            <td className="px-4 py-3">{ksh(product.cost)}</td>
            <td className="px-4 py-3">{ksh(product.price)}</td>
            <td className="px-4 py-3">{product.qty}</td>
            <td className="px-4 py-3">{product.reorder}</td>
            <td className="px-4 py-3"><Badge tone={status === "In stock" ? "green" : status === "Low stock" ? "amber" : "red"}>{status}</Badge></td>
            <td className="px-4 py-3 text-right">
              <button type="button" className="mr-3 text-sm text-[var(--theme-accent-text)]" onClick={() => setEditing(product)}>Edit</button>
              <button type="button" className="text-sm text-[var(--theme-accent-text)]" onClick={() => setMovement({ productId: product.id, mode: "in", qty: 1, note: "" })}>Stock</button>
            </td>
          </tr>
        );
      }} />
      <section className="theme-panel mt-5 rounded-xl border p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Recent movements</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {spa.movements.slice(0, 8).map((item) => {
            const product = spa.products.find((row) => row.id === item.productId);
            return <li key={item.id} className="flex justify-between gap-3"><span>{product?.name} · {item.type} {item.qty > 0 ? `+${item.qty}` : item.qty} · {item.note}</span><span className="text-slate-400">{formatTime(item.at)}</span></li>;
          })}
        </ul>
      </section>
      {editing ? <ProductForm spa={spa} product={editing} onClose={() => setEditing(null)} onSave={(product) => {
        const error = spa.saveProduct(product);
        if (error) toast.error(error);
        else { toast.success("Product saved."); setEditing(null); }
      }} /> : null}
      {movement ? <MovementForm spa={spa} draft={movement} onClose={() => setMovement(null)} /> : null}
    </div>
  );
}

function ProductForm({ spa, product, onClose, onSave }) {
  const [form, setForm] = useState(product);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <Modal title={product.id ? "Edit product" : "Add product"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SKU"><input className={inputClass} value={form.sku} onChange={set("sku")} /></Field>
        <Field label="Name"><input className={inputClass} value={form.name} onChange={set("name")} /></Field>
        <Field label="Category"><input className={inputClass} value={form.category} onChange={set("category")} /></Field>
        <Field label="Supplier"><SpaSelect value={form.supplierId} onChange={set("supplierId")} options={spa.suppliers.map((item) => ({ value: item.id, label: item.name }))} /></Field>
        <Field label="Cost (KSh)"><input className={inputClass} type="number" min="0" value={form.cost} onChange={set("cost")} /></Field>
        <Field label="Selling price (KSh)"><input className={inputClass} type="number" min="0" value={form.price} onChange={set("price")} /></Field>
        <Field label="Quantity"><input className={inputClass} type="number" min="0" value={form.qty} onChange={set("qty")} /></Field>
        <Field label="Reorder level"><input className={inputClass} type="number" min="0" value={form.reorder} onChange={set("reorder")} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={() => onSave(form)}>Save</Button></div>
    </Modal>
  );
}

function MovementForm({ spa, draft, onClose }) {
  const [form, setForm] = useState(draft);
  function save() {
    const error = form.mode === "in"
      ? spa.stockIn(form.productId, form.qty, form.supplierId, form.note)
      : spa.adjustStock(form.productId, form.mode === "out" ? -Math.abs(Number(form.qty)) : Number(form.qty), form.note);
    if (error) toast.error(error);
    else { toast.success(form.mode === "in" ? "Stock received." : "Stock adjusted."); onClose(); }
  }
  return (
    <Modal title="Stock movement" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Type">
          <SpaSelect value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })} options={toOptions([
            { value: "in", label: "Stock in / supplier purchase" },
            { value: "adjust", label: "Adjustment (+ or −)" },
            { value: "out", label: "Remove stock" },
          ])} />
        </Field>
        <Field label="Product">
          <SpaSelect value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} options={spa.products.map((item) => ({ value: item.id, label: item.name }))} />
        </Field>
        {form.mode === "in" ? (
          <Field label="Supplier">
            <SpaSelect value={form.supplierId || ""} onChange={(event) => setForm({ ...form, supplierId: event.target.value })} options={[{ value: "", label: "None" }, ...spa.suppliers.map((item) => ({ value: item.id, label: item.name }))]} />
          </Field>
        ) : null}
        <Field label="Quantity"><input className={inputClass} type="number" value={form.qty} onChange={(event) => setForm({ ...form, qty: event.target.value })} /></Field>
        <Field label="Note"><input className={inputClass} value={form.note || ""} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={save}>Save movement</Button></div>
    </Modal>
  );
}
