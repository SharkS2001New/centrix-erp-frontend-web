"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { isDamageWriteOffApprovalEnabled } from "@/lib/sales-settings";
import { notifySuccess } from "@/lib/notify";
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
  damageMeasureLabel,
  damageQtyToBase,
} from "@/lib/stock-uom";

export function RecordDamageDrawer({ open, onClose, onSaved }) {
  const { user, capabilities, hasPermission } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [form, setForm] = useState({
    product_code: "",
    quantity: "",
    package_type: "full",
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
    return { ...product, uom };
  }, [form.product_code, products, uomById]);

  function reset() {
    setForm({
      product_code: "",
      quantity: "",
      package_type: "full",
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

  function handleProductChange(productCode) {
    const product = products.find((p) => p.product_code === productCode);
    const uom = product ? uomById.get(product.unit_id) : null;
    setForm((p) => ({
      ...p,
      product_code: productCode,
      package_type: defaultDamagePackageType(uom),
    }));
  }

  function quantityLabel() {
    const label = damageMeasureLabel(selectedProduct?.uom, form.package_type);
    return `Quantity (${label})`;
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const uom = selectedProduct?.uom;
      const baseQty = damageQtyToBase(form.quantity, form.package_type, uom);
      const reason = [form.reason.trim(), form.notes.trim()].filter(Boolean).join(" — ");
      const body = {
        product_code: form.product_code,
        branch_id: branchId,
        quantity: baseQty,
        package_type: form.package_type,
        uom_label: damageMeasureLabel(uom, form.package_type),
        stock_location: form.stock_location,
        reason: reason || null,
      };
      const useRequestFlow =
        isDamageWriteOffApprovalEnabled(capabilities?.module_settings) &&
        !user?.is_admin &&
        !hasPermission("inventory.manage");
      const res = await apiRequest(useRequestFlow ? "/damages/request" : "/damages", {
        method: "POST",
        body,
      });
      if (res?.pending_approval) {
        notifySuccess("Write-off submitted for manager approval.");
      }
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
            onChange={(e) => handleProductChange(e.target.value)}
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

        <Field label="Measured as">
          <DamageMeasureSelect
            uom={selectedProduct?.uom}
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
