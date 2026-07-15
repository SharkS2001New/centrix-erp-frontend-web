"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { canDirectInventoryAction } from "@/lib/approval-permissions";
import { useAuth } from "@/contexts/auth-context";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { isStockAdjustmentApprovalEnabled } from "@/lib/sales-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { lineFromEnrichedProduct } from "@/components/lpo/lpo-product-utils";
import {
  DamageMeasureSelect,
  defaultDamagePackageType,
} from "@/components/inventory/damage-measure-select";
import {
  InventoryProductLines,
  useInventoryCatalogMaps,
} from "@/components/inventory/inventory-product-lines";
import { InventoryPageShell } from "@/components/inventory/inventory-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { damageQtyToBase } from "@/lib/stock-uom";

function lineFromProduct(product) {
  const uom = product.uom;
  return {
    ...lineFromEnrichedProduct(product),
    quantity: "1",
    package_type: defaultDamagePackageType(uom),
    stock_location: "shop",
    direction: "increase",
  };
}

export function InventoryAdjustmentsNewScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, capabilities, hasPermission } = useAuth();
  const branchId = user?.branch_id ?? 1;
  const presetProductCode = searchParams.get("product")?.trim() ?? "";

  const [uoms, setUoms] = useState([]);
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [presetLoaded, setPresetLoaded] = useState(false);

  useEffect(() => {
    fetchUomsCached(user?.organization_id)
      .then((rows) => setUoms(rows ?? []))
      .catch(() => setUoms([]));
  }, [user?.organization_id]);

  const { uomById } = useInventoryCatalogMaps(uoms);

  useEffect(() => {
    if (!presetProductCode || presetLoaded) return;
    let cancelled = false;
    apiRequest(`/products/${encodeURIComponent(presetProductCode)}`, {
      searchParams: { branch_id: branchId },
    })
      .then((product) => {
        if (cancelled || !product?.product_code) return;
        const uom = uomById.get(product.unit_id);
        setLines([lineFromProduct({ ...product, uom })]);
        setPresetLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setPresetLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [presetProductCode, presetLoaded, branchId, uomById]);

  function addProduct(product) {
    const code = product.product_code;
    if (lines.some((l) => l.product_code === code)) return;
    setLines((prev) => [...prev, lineFromProduct(product)]);
  }

  function addProducts(products) {
    const existing = new Set(lines.map((l) => l.product_code));
    const toAdd = products.filter((p) => !existing.has(p.product_code));
    if (!toAdd.length) return;
    setLines((prev) => [...prev, ...toAdd.map((product) => lineFromProduct(product))]);
  }

  function updateLine(index, patch) {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit(e) {
    e.preventDefault();
    const toPost = lines.filter((line) => line.product_code && Number(line.quantity) > 0);
    if (toPost.length === 0) {
      notifyError("Add at least one product with a quantity.");
      return;
    }

    setSaving(true);
    const noteText = notes.trim();
    const useRequestFlow =
      isStockAdjustmentApprovalEnabled(capabilities?.module_settings) &&
      !canDirectInventoryAction({ hasPermission, capabilities });
    try {
      for (const line of toPost) {
        const uom = uomById.get(line.unit_id);
        const baseQty = damageQtyToBase(line.quantity, line.package_type, uom);
        const signedQty = line.direction === "decrease" ? -Math.abs(baseQty) : Math.abs(baseQty);
        const body = {
          branch_id: branchId,
          product_code: line.product_code,
          stock_location: line.stock_location,
          quantity_change: signedQty,
          notes: noteText || null,
        };
        const res = await apiRequest(useRequestFlow ? "/inventory/adjust/request" : "/inventory/adjust", {
          method: "POST",
          body,
        });
        if (res?.pending_approval) {
          notifySuccess("Adjustment submitted for manager approval.");
        }
      }
      if (!useRequestFlow) {
        notifySuccess("Stock adjusted.");
      }
      router.push("/inventory/adjustments");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save adjustment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InventoryPageShell
      title="Adjust stock"
      subtitle="Increase or decrease shop or store quantities without a purchase order or stock take"
    >
      <AppBreadcrumb
        items={[
          { label: "Stock adjustments", href: "/inventory/adjustments" },
          { label: "New adjustment" },
        ]}
      />

      <form
        onSubmit={submit}
        className="space-y-5 theme-panel rounded-xl border p-6 shadow-sm"
      >
        <Field label="Reason / notes">
          <textarea
            className={`${inputClassName()} min-h-[72px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Opening balance, found extra stock, correction after count"
          />
        </Field>

        <InventoryProductLines
          lines={lines}
          onChange={setLines}
          uomById={uomById}
          onAddProduct={addProduct}
          onAddProducts={addProducts}
          tableHeaders={[
            { key: "product", label: "Product" },
            { key: "direction", label: "Direction" },
            { key: "measure", label: "Measured as" },
            { key: "qty", label: "Qty", align: "right" },
            { key: "loc", label: "Location" },
          ]}
          emptyMessage="Search and add products to adjust."
          renderCells={(line, index) => {
            const uom = uomById.get(line.unit_id);
            return (
              <>
                <td className="px-3 py-2">
                  <select
                    className={`${inputClassName()} text-xs`}
                    value={line.direction}
                    onChange={(e) => updateLine(index, { direction: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="increase">Increase (+)</option>
                    <option value="decrease">Decrease (−)</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <DamageMeasureSelect
                    uom={uom}
                    value={line.package_type}
                    onChange={(package_type) => updateLine(index, { package_type })}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    className={`${inputClassName()} w-24 text-right`}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    className={`${inputClassName()} text-xs`}
                    value={line.stock_location}
                    onChange={(e) => updateLine(index, { stock_location: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="shop">Shop</option>
                    <option value="store">Store</option>
                  </select>
                </td>
              </>
            );
          }}
        />

        <p className="text-xs text-slate-500">
          Each line posts to the inventory ledger immediately. Use{" "}
          <strong>Goods received</strong> when stock arrives from a supplier, and{" "}
          <strong>Stock take</strong> when reconciling a full physical count.
        </p>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Link
            href="/inventory/adjustments"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <PrimaryButton type="submit" showIcon={false} disabled={saving}>
            {saving ? "Saving…" : "Save adjustments"}
          </PrimaryButton>
        </div>
      </form>
    </InventoryPageShell>
  );
}
