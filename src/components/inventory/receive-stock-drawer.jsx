"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  FormDrawer,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { formatPackagingLabel } from "@/components/lpo/lpo-product-utils";
import { displayToBaseQty } from "@/lib/stock-uom";
import { formatQty } from "@/components/inventory/inventory-shared";

export function ReceiveStockDrawer({ open, onClose, onSaved }) {
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [mode, setMode] = useState("lpo");
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [lpoOptions, setLpoOptions] = useState([]);
  const [lpoData, setLpoData] = useState(null);
  const [receiveQty, setReceiveQty] = useState({});
  const [form, setForm] = useState({
    supplier_id: "",
    lpo_no: "",
    stock_location: "store",
    invoice_number: "",
    product_code: "",
    cost_price: "",
  });
  const [loadingLpo, setLoadingLpo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);

  const manualProduct = useMemo(() => {
    if (!form.product_code) return null;
    const product = products.find((p) => p.product_code === form.product_code);
    if (!product) return null;
    const uom = uomById.get(product.unit_id);
    return { ...product, uom, factor: Number(uom?.conversion_factor ?? 1) };
  }, [form.product_code, products, uomById]);

  useEffect(() => {
    if (!open || mode !== "lpo" || !form.supplier_id) {
      setLpoOptions([]);
      return;
    }
    apiRequest("/lpo-mst", {
      searchParams: { per_page: 100, supplier_id: form.supplier_id },
    })
      .then((res) => setLpoOptions(res.data ?? []))
      .catch(() => setLpoOptions([]));
  }, [open, mode, form.supplier_id]);

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
      setError(e instanceof Error ? e.message : "Failed to load LPO");
      setLpoData(null);
    } finally {
      setLoadingLpo(false);
    }
  }, []);

  useEffect(() => {
    if (open && mode === "lpo" && form.lpo_no) {
      loadLpo(form.lpo_no);
    }
  }, [open, mode, form.lpo_no, loadLpo]);

  function reset() {
    setMode("lpo");
    setForm({
      supplier_id: "",
      lpo_no: "",
      stock_location: "store",
      invoice_number: "",
      product_code: "",
      cost_price: "",
    });
    setLpoData(null);
    setReceiveQty({});
    setError(null);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  async function submitLpo(e) {
    e.preventDefault();
    const lines = lpoData?.lines ?? [];
    const toPost = lines.filter((line) => Number(receiveQty[line.id] ?? 0) > 0);
    if (toPost.length === 0) {
      setError("Enter quantity to receive for at least one line.");
      return;
    }

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
            invoice_number: form.invoice_number.trim() || null,
            lpo_no: Number(form.lpo_no),
            lpo_txn_id: line.id,
          },
        });
      }
      reset();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message ?? "Receipt failed");
    } finally {
      setSaving(false);
    }
  }

  async function submitManual(e) {
    e.preventDefault();
    if (!form.product_code || !receiveQty.manual) {
      setError("Select a product and enter quantity received.");
      return;
    }
    const packQty = Number(receiveQty.manual);
    if (packQty <= 0) {
      setError("Enter a valid quantity.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const factor = manualProduct?.factor ?? 1;
      await apiRequest("/inventory/receive", {
        method: "POST",
        body: {
          product_code: form.product_code,
          branch_id: branchId,
          units_received: displayToBaseQty(packQty, factor),
          stock_location: form.stock_location,
          cost_price: form.cost_price ? Number(form.cost_price) : manualProduct?.last_cost_price ?? null,
          invoice_number: form.invoice_number.trim() || null,
        },
      });
      reset();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Receipt failed");
    } finally {
      setSaving(false);
    }
  }

  const lines = lpoData?.lines ?? [];

  return (
    <FormDrawer
      title="Receive stock"
      subtitle="Record goods received into shop or warehouse stock"
      open={open}
      onClose={handleClose}
      wide
    >
      <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
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

      {mode === "lpo" ? (
        <form onSubmit={submitLpo} className="space-y-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

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
                  PO #{l.lpo_no}
                </option>
              ))}
            </select>
          </Field>

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
            <Field label="Supplier invoice / GRN ref">
              <input
                className={inputClassName()}
                value={form.invoice_number}
                onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))}
              />
            </Field>
          </div>

          {loadingLpo ? (
            <p className="text-sm text-slate-500">Loading order lines…</p>
          ) : lines.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Items</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {lines.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{line.product_name}</p>
                      <p className="text-xs text-slate-500">
                        Ordered {formatQty(line.ordered_qty)} {line.package_name || line.uom} · Received{" "}
                        {formatQty(line.received_qty ?? 0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{line.package_name || "Qty"}</span>
                      <input
                        type="number"
                        min="0"
                        max={line.remaining_qty}
                        step="any"
                        className={`${inputClassName()} w-24 text-right`}
                        value={receiveQty[line.id] ?? ""}
                        onChange={(e) =>
                          setReceiveQty((p) => ({ ...p, [line.id]: e.target.value }))
                        }
                        disabled={Number(line.remaining_qty) <= 0}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : form.lpo_no ? (
            <p className="text-sm text-slate-500">No open lines on this purchase order.</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving || !form.lpo_no}>
              {saving ? "Saving…" : "Complete receipt"}
            </PrimaryButton>
          </div>
        </form>
      ) : (
        <form onSubmit={submitManual} className="space-y-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <Field label="Product">
            <select
              className={inputClassName()}
              value={form.product_code}
              onChange={(e) => setForm((p) => ({ ...p, product_code: e.target.value }))}
              required
            >
              <option value="">Select product…</option>
              {products.map((p) => {
                const uom = uomById.get(p.unit_id);
                return (
                  <option key={p.product_code} value={p.product_code}>
                    {p.product_name} ({p.product_code})
                  </option>
                );
              })}
            </select>
          </Field>

          {manualProduct?.uom ? (
            <p className="text-xs text-slate-500">
              Unit: {formatPackagingLabel(manualProduct.uom)} — enter quantity in{" "}
              {manualProduct.uom.full_name || manualProduct.uom.uom_type}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Quantity received${manualProduct?.uom ? ` (${manualProduct.uom.full_name || manualProduct.uom.uom_type})` : ""}`}>
              <input
                type="number"
                min="0.001"
                step="any"
                className={inputClassName()}
                value={receiveQty.manual ?? ""}
                onChange={(e) => setReceiveQty((p) => ({ ...p, manual: e.target.value }))}
                required
              />
            </Field>
            <Field label="Cost price (optional)">
              <input
                type="number"
                min="0"
                step="any"
                className={inputClassName()}
                value={form.cost_price}
                onChange={(e) => setForm((p) => ({ ...p, cost_price: e.target.value }))}
                placeholder={manualProduct?.last_cost_price ?? ""}
              />
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
            <Field label="Invoice / GRN ref (optional)">
              <input
                className={inputClassName()}
                value={form.invoice_number}
                onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Complete receipt"}
            </PrimaryButton>
          </div>
        </form>
      )}
    </FormDrawer>
  );
}
