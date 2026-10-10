"use client";

import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { ksh } from "@/lib/spa/format";
import { serviceImageSrc } from "@/lib/spa/image";
import { useSpa } from "@/lib/spa/store";
import { Button, Field, SpaSearch, SpaSelect, inputClass } from "@/components/spa/ui";

export function PosScreen() {
  const spa = useSpa();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [lines, setLines] = useState([]);
  const [clientId, setClientId] = useState("");
  const [staffId, setStaffId] = useState(spa.staff[0]?.id || "");
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [parts, setParts] = useState({ cash: 0, mpesa: 0, card: 0 });
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [paper, setPaper] = useState("80mm");

  const categories = ["All", ...new Set(spa.services.map((item) => item.category))];
  const catalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    const services = spa.services.filter((item) => item.active && (category === "All" || item.category === category) && (!q || item.name.toLowerCase().includes(q)));
    const products = spa.products.filter((item) => item.price > 0 && (category === "All" || category === "Products") && (!q || item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)));
    return { services: category === "Products" ? [] : services, products: category !== "All" && category !== "Products" ? [] : products };
  }, [category, query, spa.products, spa.services]);

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const taxable = Math.max(0, subtotal - discountAmount);
  const tax = Math.round(taxable * (Number(spa.taxRate) || 0) / 100);
  const total = taxable + tax;

  function addLine(item, kind) {
    setLines((current) => {
      const existing = current.find((line) => line.refId === item.id && line.kind === kind);
      if (existing) return current.map((line) => line === existing ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { name: item.name, qty: 1, price: item.price, cost: item.cost || 0, kind, refId: item.id, staffId }];
    });
  }

  function paymentParts() {
    if (method === "split") {
      return ["cash", "mpesa", "card"].filter((key) => Number(parts[key]) > 0).map((key) => ({ method: key, amount: Number(parts[key]) || 0 }));
    }
    return [{ method, amount: total }];
  }

  function buildSale(status) {
    return {
      clientId,
      staffId,
      lines,
      discount: discountAmount,
      taxRate: spa.taxRate,
      tax,
      total,
      payment: { method, parts: paymentParts(), reference },
      status,
    };
  }

  function complete() {
    const result = spa.completeSale(buildSale("completed"));
    if (typeof result === "string") {
      toast.error(result);
      return;
    }
    toast.success(`Sale ${result.number} recorded. No payment was sent to M-Pesa or a card machine.`);
    setReceipt(result);
    setLines([]);
    setDiscount(0);
    setReference("");
  }

  function hold() {
    if (lines.length === 0) {
      toast.error("Add a service or product first.");
      return;
    }
    spa.holdSale(buildSale("held"));
    toast.success("Sale held on this till.");
    setLines([]);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SpaSearch placeholder="Search services or products" value={query} onChange={(event) => setQuery(event.target.value)} />
          {["All", ...categories.filter((item) => item !== "All"), "Products"].filter((item, index, list) => list.indexOf(item) === index).map((item) => (
            <button key={item} type="button" className={`rounded-full px-3 py-1.5 text-sm ${category === item ? "bg-[var(--theme-primary)] text-white" : "theme-secondary-btn"}`} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.services.filter((item) => !item.combo || spa.features.combos).map((item) => (
            <button key={item.id} type="button" className="theme-panel overflow-hidden rounded-xl border p-0 text-left shadow-sm hover:border-[var(--theme-primary)]" onClick={() => addLine(item, "service")}>
              {serviceImageSrc(item) ? <img src={serviceImageSrc(item)} alt="" className="h-28 w-full object-cover" /> : null}
              <span className="block p-4">
                <span className="block text-xs text-slate-400">{item.category}</span>
                <span className="mt-1 block font-semibold">{item.name}</span>
                <span className="mt-2 block text-sm text-[var(--theme-accent-text)]">{ksh(item.price)} · {item.duration} min</span>
              </span>
            </button>
          ))}
          {catalog.products.map((item) => (
            <button key={item.id} type="button" className="theme-panel rounded-xl border p-4 text-left shadow-sm hover:border-[var(--theme-primary)]" onClick={() => addLine(item, "product")}>
              <p className="text-xs text-slate-400">{item.sku}</p>
              <p className="mt-1 font-semibold">{item.name}</p>
              <p className="mt-2 text-sm text-[var(--theme-accent-text)]">{ksh(item.price)} · {item.qty} in stock</p>
            </button>
          ))}
        </div>
        {spa.holds.length > 0 ? (
          <div className="theme-panel mt-4 rounded-xl border p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Held sales</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {spa.holds.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between">
                  <span>{sale.lines.map((line) => line.name).join(", ")} · {ksh(sale.total)}</span>
                  <Button variant="ghost" onClick={() => { setLines(sale.lines); setClientId(sale.clientId || ""); setStaffId(sale.staffId || staffId); spa.removeHold(sale.id); }}>Resume</Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <aside className="theme-panel rounded-xl border p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Cart</h2>
        {lines.length === 0 ? <p className="mt-4 text-sm text-slate-500">Tap a service or product to start.</p> : (
          <ul className="mt-3 space-y-3">
            {lines.map((line) => (
              <li key={`${line.kind}-${line.refId}`} className="flex items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium">{line.name}</p>
                  <p className="text-xs text-slate-500">{ksh(line.price)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="h-7 w-7 rounded-md border" aria-label={`Decrease ${line.name}`} onClick={() => setLines((current) => current.flatMap((item) => item === line ? item.qty > 1 ? [{ ...item, qty: item.qty - 1 }] : [] : [item]))}>−</button>
                  <span className="w-6 text-center">{line.qty}</span>
                  <button type="button" className="h-7 w-7 rounded-md border" aria-label={`Increase ${line.name}`} onClick={() => setLines((current) => current.map((item) => item === line ? { ...item, qty: item.qty + 1 } : item))}>+</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3">
          <Field label="Client">
            <SpaSelect value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Walk-in, no client" options={[{ value: "", label: "Walk-in, no client" }, ...spa.clients.map((item) => ({ value: item.id, label: item.name }))]} />
          </Field>
          <Field label="Staff">
            <SpaSelect value={staffId} onChange={(event) => setStaffId(event.target.value)} options={spa.staff.map((item) => ({ value: item.id, label: item.name }))} />
          </Field>
          <Field label="Discount (KSh)">
            <input className={inputClass} type="number" min="0" value={discount} onChange={(event) => setDiscount(event.target.value)} />
          </Field>
        </div>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{ksh(subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Discount</dt><dd>{ksh(discountAmount)}</dd></div>
          <div className="flex justify-between"><dt>Tax</dt><dd>{ksh(tax)}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{ksh(total)}</dd></div>
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {["cash", "mpesa", "card", "split"].map((item) => (
            <button key={item} type="button" disabled={item !== "split" && spa.payments[item] === false} className={`rounded-lg border px-2 py-2 text-sm capitalize ${method === item ? "border-[#1677F2] bg-blue-50" : "border-slate-200"}`} onClick={() => setMethod(item)}>{item === "mpesa" ? "M-Pesa" : item}</button>
          ))}
        </div>
        {method === "split" ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["cash", "mpesa", "card"].map((item) => (
              <Field key={item} label={item === "mpesa" ? "M-Pesa" : item.charAt(0).toUpperCase() + item.slice(1)}>
                <input className={inputClass} type="number" min="0" aria-label={`${item} amount`} value={parts[item]} onChange={(event) => setParts((current) => ({ ...current, [item]: event.target.value }))} />
              </Field>
            ))}
          </div>
        ) : (
          <Field label="Reference">
            <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional receipt or code" />
          </Field>
        )}
        <p className="mt-3 text-xs text-slate-500">Completing a sale saves it on this till. It does not send an M-Pesa prompt or charge a card.</p>
        <div className="mt-3 grid gap-2">
          <Button variant="teal" disabled={lines.length === 0} onClick={complete}>Complete sale</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={hold}>Hold sale</Button>
            <Button variant="danger" onClick={() => { setLines([]); setDiscount(0); toast.success("Cart cleared."); }}>Cancel sale</Button>
          </div>
        </div>
      </aside>
      {receipt ? <Receipt sale={receipt} spa={spa} paper={paper} setPaper={setPaper} onClose={() => setReceipt(null)} /> : null}
    </div>
  );
}

function Receipt({ sale, spa, paper, setPaper, onClose }) {
  const client = spa.clients.find((item) => item.id === sale.clientId);
  const width = paper === "80mm" ? "80mm" : "210mm";
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-xl" role="dialog" aria-label="Receipt preview">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Receipt {sale.number}</h2>
          <div className="flex gap-2">
            <Button variant={paper === "80mm" ? "navy" : "ghost"} onClick={() => setPaper("80mm")}>80mm</Button>
            <Button variant={paper === "a4" ? "navy" : "ghost"} onClick={() => setPaper("a4")}>A4</Button>
            <Button variant="ghost" onClick={() => window.print()}>Print</Button>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>
        <article id="spa-receipt" className="mx-auto border border-slate-200 bg-white p-6 text-sm text-black" style={{ width }}>
          <h3 className="text-center text-base font-semibold">{spa.profile.name}</h3>
          <p className="text-center text-xs">{spa.branch} · {spa.profile.address}</p>
          <p className="text-center text-xs">{spa.profile.phone}{spa.receipt.showPin ? ` · PIN ${spa.profile.pin}` : ""}</p>
          <p className="mt-3 text-xs">{sale.number} · {client?.name || "Walk-in"}</p>
          <table className="mt-3 w-full text-xs">
            <tbody>
              {sale.lines.map((line) => (
                <tr key={`${line.kind}-${line.refId}`}>
                  <td className="py-1">{line.qty} × {line.name}</td>
                  <td className="py-1 text-right">{ksh(line.price * line.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-right text-sm font-semibold">Total {ksh(sale.total)}</p>
          <p className="mt-1 text-right text-xs capitalize">{sale.payment.method}</p>
          <p className="mt-4 text-center text-xs">{spa.receipt.footer}</p>
        </article>
      </div>
    </div>
  );
}
