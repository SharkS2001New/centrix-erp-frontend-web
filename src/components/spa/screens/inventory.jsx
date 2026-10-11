"use client";

import { useState } from "react";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { RecordFormActions, RecordFormPage, useRecordExit } from "@/components/record-form-page";
import { toast } from "@/lib/toast";
import { formatTime, ksh, stockStatus } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { useAppRouter } from "@/lib/use-app-router";
import { Badge, Empty, Field, PageHeader, SpaFilters, SpaSearch, SpaSelect, Table, inputClass, primaryLinkClass, toOptions } from "@/components/spa/ui";

export function InventoryScreen() {
  const spa = useSpa();
  const router = useAppRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const rows = spa.products.filter((item) => {
    const q = query.trim().toLowerCase();
    const matches = !q || item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
    const status = stockStatus(item);
    return matches && (filter === "All" || status === filter);
  });

  return (
    <div>
      <PageHeader title="Inventory" detail="Retail stock, reorder alerts and movements for this branch.">
        <AppNavLink href="/spa/inventory/new" className={primaryLinkClass}>Add product</AppNavLink>
      </PageHeader>
      <SpaFilters>
        <SpaSearch placeholder="Search SKU or name" value={query} onChange={(event) => setQuery(event.target.value)} />
        <SpaSelect toolbar aria-label="Stock status" value={filter} onChange={(event) => setFilter(event.target.value)} options={toOptions(["All", "In stock", "Low stock", "Out of stock"])} />
      </SpaFilters>
      <Table columns={["SKU", "Product", "Supplier", "Cost", "Price", "Qty", "Reorder", "Status", ""]} rows={rows} onCreate={() => router.push("/spa/inventory/new")} createLabel="Add product" render={(product) => {
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
              <AppNavLink href={`/spa/inventory/${product.id}/edit`} className="mr-3 text-sm text-[var(--theme-accent-text)]">Edit</AppNavLink>
              <AppNavLink href={`/spa/inventory/${product.id}/stock`} className="text-sm text-[var(--theme-accent-text)]">Stock</AppNavLink>
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
    </div>
  );
}

export function ProductFormScreen({ id }) {
  const spa = useSpa();
  const existing = id ? spa.products.find((item) => item.id === id) : null;
  const title = id ? "Edit product" : "Add product";
  const { exitTo } = useRecordExit(title);
  const [form, setForm] = useState(() => existing || { sku: "", name: "", category: "Hair care", supplierId: spa.suppliers[0]?.id || "", cost: 0, price: 0, qty: 0, reorder: 5 });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  if (id && !existing) return <Empty title="Product not found" detail="It may have been removed from this browser's sample data." />;
  function save(event) {
    event.preventDefault();
    const error = spa.saveProduct(form);
    if (error) toast.error(error);
    else {
      toast.success("Product saved.");
      exitTo("/spa/inventory");
    }
  }
  return (
    <RecordFormPage title={title} backHref="/spa/inventory">
      <form onSubmit={save}>
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
      <RecordFormActions backHref="/spa/inventory" />
      </form>
    </RecordFormPage>
  );
}

export function StockMovementScreen({ id }) {
  const spa = useSpa();
  const product = spa.products.find((item) => item.id === id);
  const { exitTo } = useRecordExit("Stock movement");
  const [form, setForm] = useState({ productId: id || "", mode: "in", qty: 1, note: "", supplierId: "" });
  if (!product) return <Empty title="Product not found" detail="It may have been removed from this browser's sample data." />;
  function save(event) {
    event.preventDefault();
    const error = form.mode === "in"
      ? spa.stockIn(form.productId, form.qty, form.supplierId, form.note)
      : spa.adjustStock(form.productId, form.mode === "out" ? -Math.abs(Number(form.qty)) : Number(form.qty), form.note);
    if (error) toast.error(error);
    else {
      toast.success(form.mode === "in" ? "Stock received." : "Stock adjusted.");
      exitTo("/spa/inventory");
    }
  }
  return (
    <RecordFormPage title="Stock movement" backHref="/spa/inventory">
      <form onSubmit={save}>
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
      <RecordFormActions backHref="/spa/inventory" submitLabel="Save movement" />
      </form>
    </RecordFormPage>
  );
}
