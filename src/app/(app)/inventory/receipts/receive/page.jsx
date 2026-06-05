"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { lineFromEnrichedProduct } from "@/components/lpo/lpo-product-utils";
import { formatPoNumber } from "@/components/lpo/lpo-shared";
import {
  InventoryProductLines,
  useInventoryCatalogMaps,
} from "@/components/inventory/inventory-product-lines";
import { formatQty, InventoryPageShell } from "@/components/inventory/inventory-shared";
import { displayToBaseQty } from "@/lib/stock-uom";

function manualLineFromProduct(product) {
  const base = lineFromEnrichedProduct(product);
  return { ...base, qty: "1" };
}

function makeReceiptRef(userRef) {
  const trimmed = userRef?.trim();
  if (trimmed) return trimmed;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SR-${stamp}-${suffix}`;
}

export default function ReceiveStockPage() {
  const router = useRouter();
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [mode, setMode] = useState("lpo");
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [lpoOptions, setLpoOptions] = useState([]);
  const [lpoData, setLpoData] = useState(null);
  const [receiveQty, setReceiveQty] = useState({});
  const [manualLines, setManualLines] = useState([]);
  const [form, setForm] = useState({
    supplier_id: "",
    lpo_no: "",
    stock_location: "store",
    invoice_number: "",
  });
  const [loadingLpo, setLoadingLpo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
      apiRequest("/products", { searchParams: { per_page: 500 } }),
      apiRequest("/uoms", { searchParams: { per_page: 200 } }),
    ])
      .then(([supRes, prodRes, uomRes]) => {
        setSuppliers(supRes.data ?? []);
        setProducts(prodRes.data ?? []);
        setUoms(uomRes.data ?? []);
      })
      .catch(() => {
        setSuppliers([]);
        setProducts([]);
        setUoms([]);
      });
  }, []);

  const { uomById } = useInventoryCatalogMaps(uoms);
  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );

  function fillAllRemaining() {
    const next = { ...receiveQty };
    for (const line of lpoData?.lines ?? []) {
      if (Number(line.remaining_qty) > 0) {
        next[line.id] = String(line.remaining_qty);
      }
    }
    setReceiveQty(next);
  }

  function addManualProduct(product) {
    if (manualLines.some((l) => l.product_code === product.product_code)) return;
    setManualLines((prev) => [...prev, manualLineFromProduct(product)]);
  }

  useEffect(() => {
    if (mode !== "lpo" || !form.supplier_id) {
      setLpoOptions([]);
      return;
    }
    apiRequest("/lpo-mst", {
      searchParams: { per_page: 100, supplier_id: form.supplier_id },
    })
      .then((res) => setLpoOptions(res.data ?? []))
      .catch(() => setLpoOptions([]));
  }, [mode, form.supplier_id]);

  const loadLpo = useCallback(async (lpoNo) => {
    if (!lpoNo) {
      setLpoData(null);
      setReceiveQty({});
      return;
    }
    setLoadingLpo(true);
    setError(null);
    try {
      const res = await apiRequest(`/lpo-mst/${lpoNo}/summary`);
      setLpoData(res);
      const initial = {};
      for (const line of res.lines ?? []) {
        initial[line.id] = String(line.remaining_qty ?? 0);
      }
      setReceiveQty(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchase order");
      setLpoData(null);
    } finally {
      setLoadingLpo(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "lpo" && form.lpo_no) loadLpo(form.lpo_no);
  }, [mode, form.lpo_no, loadLpo]);

  function updateManualLine(index, patch) {
    setManualLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submitLpo(e) {
    e.preventDefault();
    const lines = lpoData?.lines ?? [];
    const toPost = lines.filter((line) => Number(receiveQty[line.id] ?? 0) > 0);
    if (toPost.length === 0) {
      setError("Enter quantity to receive for at least one line.");
      return;
    }

    const receiptRef = makeReceiptRef(form.invoice_number);
    setSaving(true);
    setError(null);
    try {
      for (const line of toPost) {
        const packQty = Number(receiveQty[line.id]);
        const factor = Number(line.conversion_factor ?? 1);
        if (packQty > Number(line.remaining_qty ?? 0) + 0.0001) {
          throw new Error(`Receiving qty exceeds remaining for ${line.product_name}`);
        }
        await apiRequest("/inventory/receive", {
          method: "POST",
          body: {
            product_code: line.product_code,
            branch_id: branchId,
            units_received: displayToBaseQty(packQty, factor),
            pack_qty: packQty,
            stock_location: form.stock_location,
            cost_price: line.cost_price,
            invoice_number: receiptRef,
            lpo_no: Number(form.lpo_no),
            lpo_txn_id: line.id,
          },
        });
      }
      router.push(`/inventory/receipts/${encodeURIComponent(receiptRef)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message ?? "Receipt failed");
    } finally {
      setSaving(false);
    }
  }

  async function submitManual(e) {
    e.preventDefault();
    const toPost = manualLines.filter(
      (line) => line.product_code && Number(line.qty) > 0,
    );
    if (toPost.length === 0) {
      setError("Add at least one product with a quantity.");
      return;
    }

    const receiptRef = makeReceiptRef(form.invoice_number);
    setSaving(true);
    setError(null);
    try {
      for (const line of toPost) {
        const product = productByCode.get(line.product_code);
        const uom = product ? uomById.get(product.unit_id) : null;
        const factor = Number(uom?.conversion_factor ?? 1);
        const packQty = Number(line.qty);
        await apiRequest("/inventory/receive", {
          method: "POST",
          body: {
            product_code: line.product_code,
            branch_id: branchId,
            units_received: displayToBaseQty(packQty, factor),
            stock_location: form.stock_location,
            cost_price: line.cost_price
              ? Number(line.cost_price)
              : product?.last_cost_price ?? null,
            invoice_number: receiptRef,
          },
        });
      }
      router.push(`/inventory/receipts/${encodeURIComponent(receiptRef)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Receipt failed");
    } finally {
      setSaving(false);
    }
  }

  const lpoLines = lpoData?.lines ?? [];

  return (
    <InventoryPageShell
      title="Receive stock"
      subtitle="Record goods received against a purchase order or as a manual delivery"
    >
      <div className="mb-4">
        <Link href="/inventory/receipts" className="text-sm text-[#185FA5] hover:underline">
          ← Back to stock receipts
        </Link>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 max-w-md">
        <button
          type="button"
          onClick={() => setMode("lpo")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            mode === "lpo" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          From purchase order
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            mode === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          Manual receipt
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {mode === "lpo" ? (
          <form onSubmit={submitLpo} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supplier">
                <select
                  className={inputClassName()}
                  value={form.supplier_id}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, supplier_id: e.target.value, lpo_no: "" }))
                  }
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.supplier_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Purchase order">
                <select
                  className={inputClassName()}
                  value={form.lpo_no}
                  onChange={(e) => setForm((p) => ({ ...p, lpo_no: e.target.value }))}
                  disabled={!form.supplier_id}
                >
                  <option value="">Select purchase order…</option>
                  {lpoOptions.map((l) => (
                    <option key={l.lpo_no} value={l.lpo_no}>
                      {formatPoNumber(l.lpo_no)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stock location">
                <select
                  className={inputClassName()}
                  value={form.stock_location}
                  onChange={(e) => setForm((p) => ({ ...p, stock_location: e.target.value }))}
                >
                  <option value="store">Store / warehouse</option>
                  <option value="shop">Shop</option>
                </select>
              </Field>
              <Field label="Receipt reference (optional)">
                <input
                  className={inputClassName()}
                  value={form.invoice_number}
                  onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))}
                  placeholder="Supplier invoice or GRN number"
                />
              </Field>
            </div>

            {loadingLpo ? (
              <p className="text-sm text-slate-500">Loading order lines…</p>
            ) : lpoLines.length > 0 ? (
              <div>
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={fillAllRemaining}
                    className="text-sm font-medium text-[#185FA5] hover:underline"
                  >
                    Fill all remaining
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium text-right">Ordered</th>
                        <th className="px-3 py-2 font-medium text-right">Received</th>
                        <th className="px-3 py-2 font-medium text-right">Remaining</th>
                        <th className="px-3 py-2 font-medium text-right">Receiving now</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lpoLines.map((line) => {
                        const remaining = Number(line.remaining_qty ?? 0);
                        const status = line.receive_status ?? (remaining <= 0 ? "complete" : "open");
                        return (
                          <tr key={line.id} className="border-b border-slate-100">
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-slate-900">{line.product_name}</p>
                              <p className="text-xs text-slate-500">{line.packaging_label || line.package_name}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatQty(line.ordered_qty)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                              {formatQty(line.received_qty ?? 0)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                              {formatQty(remaining)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max={remaining}
                                  step="any"
                                  className={`${inputClassName()} w-24 text-right`}
                                  value={receiveQty[line.id] ?? ""}
                                  onChange={(e) =>
                                    setReceiveQty((p) => ({ ...p, [line.id]: e.target.value }))
                                  }
                                  disabled={remaining <= 0}
                                />
                                {remaining > 0 ? (
                                  <button
                                    type="button"
                                    className="text-[10px] text-[#185FA5] hover:underline"
                                    onClick={() =>
                                      setReceiveQty((p) => ({
                                        ...p,
                                        [line.id]: String(remaining),
                                      }))
                                    }
                                  >
                                    Max
                                  </button>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                                  status === "complete"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : status === "partial"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : form.lpo_no ? (
              <p className="text-sm text-slate-500">No open lines on this purchase order.</p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Link
                href="/inventory/receipts"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <PrimaryButton type="submit" showIcon={false} disabled={saving || !form.lpo_no}>
                {saving ? "Saving…" : "Complete receipt"}
              </PrimaryButton>
            </div>
          </form>
        ) : (
          <form onSubmit={submitManual} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stock location">
                <select
                  className={inputClassName()}
                  value={form.stock_location}
                  onChange={(e) => setForm((p) => ({ ...p, stock_location: e.target.value }))}
                >
                  <option value="store">Store / warehouse</option>
                  <option value="shop">Shop</option>
                </select>
              </Field>
              <Field label="Receipt reference (optional)">
                <input
                  className={inputClassName()}
                  value={form.invoice_number}
                  onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))}
                  placeholder="Supplier invoice or GRN number"
                />
              </Field>
            </div>

            <InventoryProductLines
              lines={manualLines}
              onChange={setManualLines}
              uomById={uomById}
              onAddProduct={addManualProduct}
              tableHeaders={[
                { key: "product", label: "Product" },
                { key: "pack", label: "Packaging" },
                { key: "qty", label: "Qty received", align: "right" },
                { key: "cost", label: "Cost", align: "right" },
              ]}
              emptyMessage="Search and add products received."
              renderCells={(line, index) => (
                <>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {line.packaging_label || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      className={`${inputClassName()} w-24 text-right`}
                      value={line.qty}
                      onChange={(e) => updateManualLine(index, { qty: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={`${inputClassName()} w-24 text-right`}
                      value={line.cost_price}
                      onChange={(e) => updateManualLine(index, { cost_price: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                </>
              )}
            />

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Link
                href="/inventory/receipts"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <PrimaryButton type="submit" showIcon={false} disabled={saving}>
                {saving ? "Saving…" : "Complete receipt"}
              </PrimaryButton>
            </div>
          </form>
        )}
      </div>
    </InventoryPageShell>
  );
}
