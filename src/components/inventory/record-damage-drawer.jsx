"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import { isDamageWriteOffApprovalEnabled } from "@/lib/sales-settings";
import { notifySuccess } from "@/lib/notify";
import {
  Field,
  FormDrawer,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { ProductSearchSelect } from "@/components/catalog/product-search-select";
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

  const [selectedProduct, setSelectedProduct] = useState(null);
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
    fetchUomsCached(user?.organization_id)
      .then((uomRows) => setUoms(uomRows ?? []))
      .catch(() => setUoms([]));
  }, [open, user?.organization_id]);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);

  const productWithUom = useMemo(() => {
    if (!form.product_code || !selectedProduct) return null;
    const uom = uomById.get(selectedProduct.unit_id);
    return { ...selectedProduct, uom };
  }, [form.product_code, selectedProduct, uomById]);

  function reset() {
    setForm({
      product_code: "",
      quantity: "",
      package_type: "full",
      stock_location: "shop",
      reason: "",
      notes: "",
    });
    setSelectedProduct(null);
    setError(null);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  function handleProductSelect(product) {
    const uom = product ? uomById.get(product.unit_id) : null;
    setSelectedProduct(product);
    setForm((p) => ({
      ...p,
      product_code: product?.product_code ?? "",
      package_type: defaultDamagePackageType(uom),
    }));
  }

  function quantityLabel() {
    const label = damageMeasureLabel(productWithUom?.uom, form.package_type);
    return `Quantity (${label})`;
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const uom = productWithUom?.uom;
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
          <ProductSearchSelect
            value={form.product_code}
            onChange={(code) => {
              if (!code) handleProductSelect(null);
              else setForm((p) => ({ ...p, product_code: code }));
            }}
            onProductSelect={handleProductSelect}
            required
          />
        </Field>

        {productWithUom?.uom ? (
          <p className="text-xs text-slate-500">Pack size: {formatPackagingLabel(productWithUom.uom)}</p>
        ) : null}

        <Field label="Measured as">
          <DamageMeasureSelect
            uom={productWithUom?.uom}
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
