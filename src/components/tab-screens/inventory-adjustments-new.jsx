"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { tabAddTitle, useTabFormExit } from "@/hooks/use-tab-form-exit";
import { TabFormCancelButton } from "@/components/layout/tab-form-exit-button";
import { apiRequest, ApiError } from "@/lib/api";
import { canDirectInventoryAction } from "@/lib/approval-permissions";
import { useAuth } from "@/contexts/auth-context";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { isStockAdjustmentApprovalEnabled } from "@/lib/sales-settings";
import { Field, PrimaryButton, SearchableSelect, inputClassName } from "@/components/catalog/catalog-shared";
import {
  lineFromEnrichedProduct,
  resolveInventoryLineUom,
} from "@/components/lpo/lpo-product-utils";
import {
  DamageMeasureSelect,
} from "@/components/inventory/damage-measure-select";
import {
  InventoryProductLines,
  useInventoryCatalogMaps,
} from "@/components/inventory/inventory-product-lines";
import { InventoryPageShell } from "@/components/inventory/inventory-shared";
import { productStockAtLocation } from "@/lib/pos-stock";
import {
  defaultInventoryAdjustmentMeasure,
  formatDisplayQty,
  formatMixedStockDisplay,
  inventoryAdjustmentMeasureLevels,
  inventoryAdjustmentQtyToBase,
  normalizeInventoryAdjustmentLevel,
  productSellsRetail,
} from "@/lib/stock-uom";
import { smallPackagingLabel } from "@/lib/uom-packaging";

function lineFromProduct(product) {
  const uom = product.uom;
  const sellOnRetail = productSellsRetail(product);
  return {
    ...lineFromEnrichedProduct(product),
    uom: uom && typeof uom === "object" ? uom : null,
    unit_id: product.unit_id ?? null,
    sell_on_retail: sellOnRetail,
    retail_package: product.retail_package ?? null,
    quantity: "1",
    package_type: defaultInventoryAdjustmentMeasure(uom, {
      sellOnRetail,
      stockLocation: "shop",
    }),
    stock_location: "shop",
    direction: "increase",
    stock_in_shop: Number(product.stock_in_shop ?? product.stock_on_hand_shop ?? 0),
    stock_in_store: Number(product.stock_in_store ?? product.stock_on_hand_store ?? 0),
    stock_available_shop: Number(
      product.stock_available_shop ?? product.stock_in_shop ?? product.stock_on_hand_shop ?? 0,
    ),
    stock_available_store: Number(
      product.stock_available_store ?? product.stock_in_store ?? product.stock_on_hand_store ?? 0,
    ),
  };
}

function formatLineStock(line, uom, location) {
  const baseQty = productStockAtLocation(line, location);
  const sellOnRetail = productSellsRetail(line);
  if (!sellOnRetail || !uom) {
    return formatMixedStockDisplay(baseQty, uom).text;
  }
  const level = normalizeInventoryAdjustmentLevel(line.package_type, uom, { sellOnRetail });
  if (level === "small") {
    return `${formatDisplayQty(baseQty)} ${smallPackagingLabel(uom)}`;
  }
  return formatMixedStockDisplay(baseQty, uom).text;
}

export function InventoryAdjustmentsNewScreen() {
  const { exitTo } = useTabFormExit(tabAddTitle("stock adjustment"));
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
    if (!uoms.length) return;
    setLines((prev) => {
      if (!prev.length) return prev;
      let changed = false;
      const next = prev.map((line) => {
        const uom = resolveInventoryLineUom(line, uomById);
        if (!uom) return line;
        const sellOnRetail = productSellsRetail(line);
        const package_type = normalizeInventoryAdjustmentLevel(line.package_type, uom, {
          sellOnRetail,
        });
        const needsUom =
          !line.uom ||
          typeof line.uom !== "object" ||
          line.uom.id !== uom.id ||
          line.uom.uses_small_packaging !== uom.uses_small_packaging;
        if (needsUom || package_type !== line.package_type) {
          changed = true;
          return { ...line, uom, package_type };
        }
        return line;
      });
      return changed ? next : prev;
    });
  }, [uoms, uomById]);

  useEffect(() => {
    if (!presetProductCode || presetLoaded) return;
    let cancelled = false;
    apiRequest(`/products/${encodeURIComponent(presetProductCode)}`, {
      searchParams: { branch_id: branchId },
    })
      .then((product) => {
        if (cancelled || !product?.product_code) return;
        const uom =
          uomById.get(product.unit_id) ??
          uomById.get(String(product.unit_id ?? "")) ??
          product.uom ??
          null;
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
        const uom = resolveInventoryLineUom(line, uomById);
        const sellOnRetail = productSellsRetail(line);
        const baseQty = inventoryAdjustmentQtyToBase(line.quantity, line.package_type, uom, {
          sellOnRetail,
        });
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
      exitTo("/inventory/adjustments");
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
      backHref="/inventory/adjustments"
      backLabel="Back to stock adjustments"
    >
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
          branchId={branchId}
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
            const uom = resolveInventoryLineUom(line, uomById);
            const sellOnRetail = productSellsRetail(line);
            const measureLevels = inventoryAdjustmentMeasureLevels(uom, { sellOnRetail });
            const stockLabel = formatLineStock(line, uom, line.stock_location);
            return (
              <>
                <td className="px-3 py-2">
                  <SearchableSelect
                    className={`${inputClassName()} text-xs`}
                    value={line.direction}
                    onChange={(direction) => updateLine(index, { direction })}
                    options={[
                      { value: "increase", label: "Increase (+)" },
                      { value: "decrease", label: "Decrease (−)" },
                    ]}
                  />
                </td>
                <td className="px-3 py-2">
                  <DamageMeasureSelect
                    uom={uom}
                    sellOnRetail={sellOnRetail}
                    measureLevels={measureLevels}
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
                  <p className="mt-0.5 text-[10px] text-slate-500">In stock: {stockLabel}</p>
                </td>
                <td className="px-3 py-2">
                  <SearchableSelect
                    className={`${inputClassName()} text-xs`}
                    value={line.stock_location}
                    onChange={(stock_location) => {
                      const nextMeasure = sellOnRetail
                        ? defaultInventoryAdjustmentMeasure(uom, {
                            sellOnRetail,
                            stockLocation: stock_location,
                          })
                        : line.package_type;
                      updateLine(index, {
                        stock_location,
                        package_type: nextMeasure,
                      });
                    }}
                    options={[
                      { value: "shop", label: "Shop" },
                      { value: "store", label: "Store" },
                    ]}
                  />
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
          <TabFormCancelButton href="/inventory/adjustments" />
          <PrimaryButton type="submit" showIcon={false} disabled={saving}>
            {saving ? "Saving…" : "Save adjustments"}
          </PrimaryButton>
        </div>
      </form>
    </InventoryPageShell>
  );
}
