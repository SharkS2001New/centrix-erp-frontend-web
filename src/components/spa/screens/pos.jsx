"use client";

import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { ksh } from "@/lib/spa/format";
import { serviceImageSrc } from "@/lib/spa/image";
import { useSpa } from "@/lib/spa/store";
import { ServiceReceiptDialog } from "@/components/service-receipt-dialog";
import { buildSpaSaleReceipt } from "@/lib/service-receipt";
import { useAuth } from "@/contexts/auth-context";
import { Field, SpaSearch, SpaSelect, inputClass } from "@/components/spa/ui";

export function PosScreen() {
  const spa = useSpa();
  const { organization } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [lines, setLines] = useState([]);
  const [clientId, setClientId] = useState("");
  const [staffId, setStaffId] = useState(spa.staff[0]?.id || "");
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [parts, setParts] = useState({ cash: 0, mpesa: 0, card: 0 });
  const [receipt, setReceipt] = useState(null);
  const [paper, setPaper] = useState("a4");
  const [cartOpen, setCartOpen] = useState(false);

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

  function paymentParts(nextMethod) {
    if (nextMethod === "split") {
      return ["cash", "mpesa", "card"].filter((key) => Number(parts[key]) > 0).map((key) => ({ method: key, amount: Number(parts[key]) || 0 }));
    }
    return [{ method: nextMethod, amount: total }];
  }

  function complete(nextMethod) {
    if (lines.length === 0) {
      toast.error("Add a service first.");
      return false;
    }
    if (nextMethod === "split" && method !== "split") {
      setMethod("split");
      return false;
    }
    const result = spa.completeSale({
      clientId,
      staffId,
      lines,
      discount: discountAmount,
      taxRate: spa.taxRate,
      tax,
      total,
      payment: { method: nextMethod, parts: paymentParts(nextMethod), reference: "" },
      status: "completed",
    });
    if (typeof result === "string") {
      toast.error(result);
      return false;
    }
    toast.success(`Sale ${result.number} recorded. No payment was sent to M-Pesa or a card machine.`);
    setReceipt(result);
    setLines([]);
    setDiscount(0);
    setMethod("cash");
    setParts({ cash: 0, mpesa: 0, card: 0 });
    return true;
  }

  const chips = ["All", ...categories.filter((item) => item !== "All"), "Products"].filter((item, index, list) => list.indexOf(item) === index);
  const serviceCards = catalog.services.filter((item) => !item.combo || spa.features.combos);
  const emptyCatalog = serviceCards.length === 0 && catalog.products.length === 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] lg:h-[calc(100dvh-8rem)] lg:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 space-y-3 border-b border-[var(--theme-border)]/80 px-3 py-3 sm:px-4">
          <div className="hotel-pos-chip-scroll flex items-center gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Service categories">
            {chips.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={category === item}
                className={`hotel-pos-chip shrink-0${category === item ? " hotel-pos-chip-active" : ""}`}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <SpaSearch className="w-full min-w-0" placeholder="Search services or products" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-4 sm:pb-24 lg:pb-4">
          {emptyCatalog ? (
            <p className="hotel-pos-empty-ticket theme-subtext rounded-2xl px-4 py-10 text-center text-sm">Nothing matches this search.</p>
          ) : (
            <div className="hotel-pos-catalog-grid grid gap-2.5 sm:gap-3" style={{ "--hotel-pos-cols": 3 }}>
              {serviceCards.map((item) => (
                <CatalogTile
                  key={item.id}
                  name={item.name}
                  meta={item.category}
                  price={ksh(item.price)}
                  detail={`${item.duration} min`}
                  photo={serviceImageSrc(item)}
                  onAdd={() => addLine(item, "service")}
                />
              ))}
              {catalog.products.map((item) => (
                <CatalogTile
                  key={item.id}
                  name={item.name}
                  meta={item.sku}
                  price={ksh(item.price)}
                  detail={`${item.qty} in stock`}
                  onAdd={() => addLine(item, "product")}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {cartOpen ? <button type="button" className="fixed inset-0 z-40 bg-black/40 lg:hidden" aria-label="Close ticket" onClick={() => setCartOpen(false)} /> : null}
      <button type="button" className="hotel-pos-primary-cta fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold md:bottom-4 lg:hidden" onClick={() => setCartOpen(true)}>
        <span>Ticket · {lines.length}</span>
        <span className="tabular-nums">{ksh(total)}</span>
      </button>

      <aside className={`hotel-pos-check-pane flex w-full flex-col lg:w-[24rem] lg:shrink-0 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[min(88dvh,42rem)] max-lg:rounded-t-2xl max-lg:pb-[calc(1rem+env(safe-area-inset-bottom))] ${cartOpen ? "" : "max-lg:hidden"}`}>
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3">
          <div>
            <h2 className="theme-heading text-sm font-semibold">Ticket</h2>
            <p className="theme-subtext text-xs">{lines.length === 0 ? "Tap a service to start" : `${lines.length} item${lines.length === 1 ? "" : "s"}`}</p>
          </div>
          <button type="button" className="text-sm font-medium text-[var(--theme-accent-text)] lg:hidden" onClick={() => setCartOpen(false)}>Close</button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-4">
          {lines.length === 0 ? (
            <p className="hotel-pos-empty-ticket theme-subtext flex flex-1 items-center justify-center rounded-2xl px-4 py-16 text-center text-sm">The ticket is empty.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((line) => (
                <li key={`${line.kind}-${line.refId}`} className="hotel-pos-line flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="theme-heading truncate text-sm font-semibold">{line.name}</p>
                    <p className="theme-subtext text-xs tabular-nums">{ksh(line.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" className="theme-secondary-btn flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold" aria-label={`Decrease ${line.name}`} onClick={() => setLines((current) => current.flatMap((item) => item === line ? item.qty > 1 ? [{ ...item, qty: item.qty - 1 }] : [] : [item]))}>−</button>
                    <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">{line.qty}</span>
                    <button type="button" className="theme-secondary-btn flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold" aria-label={`Increase ${line.name}`} onClick={() => setLines((current) => current.map((item) => item === line ? { ...item, qty: item.qty + 1 } : item))}>+</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="hotel-pos-totals shrink-0 space-y-3 border-t border-[var(--theme-border)] px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Client">
              <SpaSelect value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="No client" options={[{ value: "", label: "No client" }, ...spa.clients.map((item) => ({ value: item.id, label: item.name }))]} />
            </Field>
            <Field label="Staff">
              <SpaSelect value={staffId} onChange={(event) => setStaffId(event.target.value)} options={spa.staff.map((item) => ({ value: item.id, label: item.name }))} />
            </Field>
            <div className="col-span-2">
              <Field label="Discount (KSh)">
                <input className={inputClass} type="number" min="0" value={discount} onChange={(event) => setDiscount(event.target.value)} />
              </Field>
            </div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="theme-subtext text-[10px] font-semibold uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold tabular-nums leading-tight text-[var(--theme-accent-text)]">{ksh(total)}</p>
            </div>
            <div className="text-right text-xs">
              <p className="theme-subtext">Subtotal {ksh(subtotal)}</p>
              <p className="theme-subtext">Discount {ksh(discountAmount)}</p>
              <p className="theme-subtext">Tax {ksh(tax)}</p>
            </div>
          </div>
          {method === "split" ? (
            <div className="grid grid-cols-3 gap-2">
              {["cash", "mpesa", "card"].map((item) => (
                <Field key={item} label={item === "mpesa" ? "M-Pesa" : item.charAt(0).toUpperCase() + item.slice(1)}>
                  <input className={inputClass} type="number" min="0" aria-label={`${item} amount`} value={parts[item]} onChange={(event) => setParts((current) => ({ ...current, [item]: event.target.value }))} />
                </Field>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {["cash", "mpesa", "card", "split"].map((item) => (
              <button
                key={item}
                type="button"
                disabled={lines.length === 0 || (item !== "split" && spa.payments[item] === false)}
                className={`rounded-xl py-3 text-sm font-bold uppercase tracking-wide disabled:opacity-40 ${item === "split" && method !== "split" ? "hotel-pos-secondary-cta" : "hotel-pos-primary-cta"}`}
                onClick={() => { if (complete(item)) setCartOpen(false); }}
              >
                {item === "mpesa" ? "M-Pesa" : item === "split" && method === "split" ? "Take split" : item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </aside>
      {receipt ? (
        <ServiceReceiptDialog
          receipt={buildSpaSaleReceipt(receipt, spa, organization)}
          paper={paper}
          onPaper={setPaper}
          onClose={() => setReceipt(null)}
        />
      ) : null}
    </div>
  );
}

function CatalogTile({ name, meta, price, detail, photo, onAdd }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="hotel-pos-tile group relative flex min-h-[7.5rem] flex-col overflow-hidden text-left transition duration-150 hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <span className="hotel-pos-tile-shine pointer-events-none absolute inset-x-0 top-0 h-1 opacity-0 transition group-hover:opacity-100" />
      {photo ? (
        <span className="hotel-pos-tile-media relative block aspect-square w-full overflow-hidden bg-[var(--theme-surface-muted)]">
          <img src={photo} alt="" className="h-full w-full object-cover object-center" />
        </span>
      ) : null}
      <span className="flex min-h-0 flex-1 flex-col justify-between gap-2 p-3.5">
        <span>
          {meta ? <span className="theme-subtext block text-[11px] font-semibold uppercase tracking-wide">{meta}</span> : null}
          <span className="theme-heading mt-0.5 line-clamp-2 block text-[15px] font-semibold leading-snug">{name}</span>
        </span>
        <span className="flex items-end justify-between gap-2">
          <span>
            <span className="block text-base font-bold tabular-nums text-[var(--theme-accent-text)]">{price}</span>
            <span className="theme-subtext block text-[11px]">{detail}</span>
          </span>
          <span className="hotel-pos-add-chip rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide opacity-80 group-hover:opacity-100">Add</span>
        </span>
      </span>
    </button>
  );
}

