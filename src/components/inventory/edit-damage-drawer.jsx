"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  Field,
  FormDrawer,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { formatPackagingLabel } from "@/components/lpo/lpo-product-utils";
import {
  DamageMeasureSelect,
  defaultDamagePackageType,
} from "@/components/inventory/damage-measure-select";
import {
  damageBaseToDisplay,
  damageMeasureLabel,
  damageQtyToBase,
  normalizeDamageLevel,
} from "@/lib/stock-uom";

export function EditDamageDrawer({ open, damage, products = [], uoms = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    quantity: "",
    package_type: "full",
    stock_location: "shop",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);

  const product = useMemo(() => {
    if (!damage?.product_code) return null;
    const row = products.find((p) => p.product_code === damage.product_code);
    if (!row) return null;
    const uom = uomById.get(row.unit_id);
    return { ...row, uom };
  }, [damage, products, uomById]);

  useEffect(() => {
    if (!open || !damage) return;
    const uom = product?.uom;
    const packageType = normalizeDamageLevel(damage.package_type ?? "full", uom);
    setForm({
      quantity: damageBaseToDisplay(damage.quantity, packageType, uom),
      package_type: packageType,
      stock_location: damage.stock_location ?? "shop",
      reason: damage.reason ?? "",
    });
    setError(null);
  }, [open, damage, product?.uom]);

  function handleClose() {
    if (saving) return;
    setError(null);
    onClose();
  }

  function quantityLabel() {
    const label = damageMeasureLabel(product?.uom, form.package_type);
    return `Quantity (${label})`;
  }

  async function submit(e) {
    e.preventDefault();
    if (!damage?.id) return;

    setSaving(true);
    setError(null);
    try {
      const uom = product?.uom;
      const baseQty = damageQtyToBase(form.quantity, form.package_type, uom);
      await apiRequest(`/damages/${damage.id}`, {
        method: "PUT",
        body: {
          quantity: baseQty,
          package_type: form.package_type,
          uom_label: damageMeasureLabel(uom, form.package_type),
          stock_location: form.stock_location,
          reason: form.reason.trim() || null,
        },
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update damage");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDrawer
      title="Edit damage"
      subtitle="Adjust quantity, location, or reason — stock is updated automatically"
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
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {product?.product_name ?? damage?.product_code ?? "—"}
            {damage?.product_code ? (
              <span className="ml-2 font-mono text-xs text-slate-500">{damage.product_code}</span>
            ) : null}
          </p>
        </Field>

        {product?.uom ? (
          <p className="text-xs text-slate-500">Pack size: {formatPackagingLabel(product.uom)}</p>
        ) : null}

        <Field label="Measured as">
          <DamageMeasureSelect
            uom={product?.uom}
            value={form.package_type}
            onChange={(package_type) => setForm((p) => ({ ...p, package_type }))}
            className={inputClassName()}
          />
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
            <option value="store">Store</option>
          </select>
        </Field>

        <Field label="Reason">
          <textarea
            className={`${inputClassName()} min-h-[80px]`}
            value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            placeholder="Why was stock written off?"
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <PrimaryButton type="submit" showIcon={false} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </PrimaryButton>
        </div>
      </form>
    </FormDrawer>
  );
}
