"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  FormDrawer,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { formatPackagingLabel, packageNameFromUom } from "@/components/lpo/lpo-product-utils";
import { damageQtyToBase } from "@/lib/stock-uom";

const PACKAGE_OPTIONS = [
  {
    value: "full_package",
    label: "Full pack",
    hint: "Each unit is one full pack (e.g. one carton)",
  },
  {
    value: "partial",
    label: "Partial pack",
    hint: "Quantity in the product's usual pack unit",
  },
  {
    value: "pieces",
    label: "Loose pieces",
    hint: "Individual pieces — not multiplied by pack size",
  },
];

export function RecordDamageDrawer({ open, onClose, onSaved }) {
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [form, setForm] = useState({
    product_code: "",
    quantity: "",
    package_type: "partial",
    stock_location: "shop",
    reason: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      apiRequest("/products", { searchParams: { per_page: 500 } }),
      apiRequest("/uoms", { searchParams: { per_page: 200 } }),
    ])
      .then(([prodRes, uomRes]) => {
        setProducts(prodRes.data ?? []);
        setUoms(uomRes.data ?? []);
      })
      .catch(() => {
        setProducts([]);
        setUoms([]);
      });
  }, [open]);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);

  const selectedProduct = useMemo(() => {
    if (!form.product_code) return null;
    const product = products.find((p) => p.product_code === form.product_code);
    if (!product) return null;
    const uom = uomById.get(product.unit_id);
    return {
      ...product,
      uom,
      factor: Number(uom?.conversion_factor ?? 1),
      packName: packageNameFromUom(uom),
    };
  }, [form.product_code, products, uomById]);

  const packageHint = PACKAGE_OPTIONS.find((o) => o.value === form.package_type)?.hint;

  function reset() {
    setForm({
      product_code: "",
      quantity: "",
      package_type: "partial",
      stock_location: "shop",
      reason: "",
      notes: "",
    });
    setError(null);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  function quantityLabel() {
    if (form.package_type === "pieces") return "Quantity (loose pieces)";
    if (selectedProduct?.packName) return `Quantity (${selectedProduct.packName})`;
    return "Quantity";
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const factor = selectedProduct?.factor ?? 1;
      const packName = selectedProduct?.packName ?? null;
      const baseQty = damageQtyToBase(form.quantity, form.package_type, factor);
      const reason = [form.reason.trim(), form.notes.trim()].filter(Boolean).join(" — ");
      await apiRequest("/damages", {
        method: "POST",
        body: {
          product_code: form.product_code,
          branch_id: branchId,
          quantity: baseQty,
          package_type: form.package_type,
          uom_label: packName,
          stock_location: form.stock_location,
          reason: reason || null,
        },
      });
      reset();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record damage");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDrawer
      title="Record damage"
      subtitle="Write off damaged or expired stock"
      open={open}
      onClose={handleClose}
    >
      <form onSubmit={submit} className="space-y-4">
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
            {products.map((p) => (
              <option key={p.product_code} value={p.product_code}>
                {p.product_name} ({p.product_code})
              </option>
            ))}
          </select>
        </Field>

        {selectedProduct?.uom ? (
          <p className="text-xs text-slate-500">Pack size: {formatPackagingLabel(selectedProduct.uom)}</p>
        ) : null}

        <Field label="How is the quantity measured?">
          <select
            className={inputClassName()}
            value={form.package_type}
            onChange={(e) => setForm((p) => ({ ...p, package_type: e.target.value }))}
          >
            {PACKAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {packageHint ? <p className="mt-1 text-xs text-slate-500">{packageHint}</p> : null}
        </Field>

        <Field label={quantityLabel()}>
          <input
            type="number"
            min="0.001"
            step="any"
            className={inputClassName()}
            value={form.quantity}
            onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
            required
          />
        </Field>

        <Field label="Location">
          <select
            className={inputClassName()}
            value={form.stock_location}
            onChange={(e) => setForm((p) => ({ ...p, stock_location: e.target.value }))}
          >
            <option value="shop">Shop</option>
            <option value="store">Store / warehouse</option>
          </select>
        </Field>

        <Field label="Reason">
          <input
            className={inputClassName()}
            value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            placeholder="e.g. Expired stock"
          />
        </Field>

        <Field label="Notes">
          <textarea
            className={inputClassName()}
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </FormDrawer>
  );
}
