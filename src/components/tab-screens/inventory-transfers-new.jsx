"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { canDirectInventoryAction } from "@/lib/approval-permissions";
import { useAuth } from "@/contexts/auth-context";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { isStockTransferApprovalEnabled } from "@/lib/sales-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import {
  lineFromEnrichedProduct,
  resolveInventoryLineUom,
} from "@/components/lpo/lpo-product-utils";
import {
  UomMeasureSelect,
  defaultUomMeasureLevel,
} from "@/components/inventory/damage-measure-select";
import {
  InventoryProductLines,
  useInventoryCatalogMaps,
} from "@/components/inventory/inventory-product-lines";
import { InventoryPageShell } from "@/components/inventory/inventory-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import {
  TRANSFER_FROM_OPTIONS,
  isLocationTransferTarget,
  isStoreToShopTransfer,
  transferPurposeLabel,
  transferToOptionsFor,
} from "@/lib/inventory-transfer-routes";
import { damageQtyToBase } from "@/lib/stock-uom";

function lineFromProduct(product) {
  const uom = product.uom;
  return {
    ...lineFromEnrichedProduct(product),
    uom,
    quantity: "1",
    package_type: defaultUomMeasureLevel(uom),
  };
}

export function InventoryTransfersNewScreen() {
  const router = useRouter();
  const { user, capabilities, hasPermission } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [uoms, setUoms] = useState([]);
  const [lines, setLines] = useState([]);
  const [fromLocation, setFromLocation] = useState("store");
  const [toLocation, setToLocation] = useState("shop");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUomsCached(user?.organization_id)
      .then((rows) => setUoms(rows ?? []))
      .catch(() => setUoms([]));
  }, [user?.organization_id]);

  const { uomById } = useInventoryCatalogMaps(uoms);
  const toOptions = useMemo(
    () => transferToOptionsFor(fromLocation),
    [fromLocation],
  );
  const isStoreToShop = isStoreToShopTransfer(fromLocation, toLocation);
  const isPurposeTransfer = !isLocationTransferTarget(toLocation);
  const showReasonField = !isStoreToShop;
  const reasonRequired = isPurposeTransfer;
  const useRequestFlow =
    isStockTransferApprovalEnabled(capabilities?.module_settings) &&
    !isStoreToShop &&
    !canDirectInventoryAction({ hasPermission, capabilities });

  useEffect(() => {
    if (!toOptions.some((opt) => opt.value === toLocation)) {
      setToLocation(toOptions[0]?.value ?? "shop");
    }
  }, [fromLocation, toOptions, toLocation]);

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

  function handleFromChange(from) {
    setFromLocation(from);
    const nextToOptions = transferToOptionsFor(from);
    setToLocation((prev) =>
      nextToOptions.some((opt) => opt.value === prev)
        ? prev
        : (nextToOptions[0]?.value ?? "shop"),
    );
  }

  async function submit(e) {
    e.preventDefault();
    const toPost = lines.filter((line) => line.product_code && Number(line.quantity) > 0);
    if (toPost.length === 0) {
      notifyError("Add at least one product with a quantity.");
      return;
    }
    if (reasonRequired && !reason.trim()) {
      notifyError("Add a reason for this transfer (e.g. staff lunch, donation recipient).");
      return;
    }

    setSaving(true);
    let pendingApproval = false;
    try {
      for (const line of toPost) {
        const uom = resolveInventoryLineUom(line, uomById);
        const body = {
          branch_id: branchId,
          product_code: line.product_code,
          quantity: damageQtyToBase(line.quantity, line.package_type, uom),
          from_location: fromLocation,
          to_location: toLocation,
        };
        if (showReasonField && reason.trim()) {
          body.notes = reason.trim();
        } else if (isPurposeTransfer) {
          body.notes = transferPurposeLabel(toLocation);
        }
        const res = await apiRequest(useRequestFlow ? "/inventory/transfer/request" : "/inventory/transfer", {
          method: "POST",
          body,
        });
        if (res?.pending_approval) pendingApproval = true;
      }
      if (pendingApproval) {
        notifySuccess("Transfer submitted for manager approval.");
        router.push("/notifications");
        return;
      }
      notifySuccess(toPost.length === 1 ? "Stock transferred." : `${toPost.length} transfers completed.`);
      router.push("/inventory/transactions?type=TRANSFER");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InventoryPageShell
      title="Transfer stock"
      subtitle="Move stock between shop and store, or issue stock for internal use, donations, and similar purposes"
    >
      <AppBreadcrumb
        items={[
          { label: "Stock movements", href: "/inventory/transactions" },
          { label: "New transfer" },
        ]}
      />

      <form
        onSubmit={submit}
        className="space-y-5 theme-panel rounded-xl border p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From">
            <select
              className={inputClassName()}
              value={fromLocation}
              onChange={(e) => handleFromChange(e.target.value)}
            >
              {TRANSFER_FROM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select
              className={inputClassName()}
              value={toLocation}
              onChange={(e) => setToLocation(e.target.value)}
            >
              {toOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {isPurposeTransfer ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            Stock will leave <strong>{fromLocation === "store" ? "store" : "shop"}</strong> for{" "}
            <strong>{transferPurposeLabel(toLocation)}</strong> — it will not arrive in another stock
            location.
          </p>
        ) : null}

        {showReasonField ? (
          <Field label={reasonRequired ? "Reason" : "Reason (optional)"} required={reasonRequired}>
            <input
              className={inputClassName()}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isPurposeTransfer
                  ? "e.g. Staff lunch, donation to church, sample for marketing"
                  : "e.g. Rebalancing stock between floors"
              }
            />
          </Field>
        ) : null}

        {isStoreToShop ? (
          <p className="text-xs text-slate-500">
            Restocking the shop from the warehouse does not require a reason or manager approval.
          </p>
        ) : null}

        {useRequestFlow ? (
          <p className="text-xs text-amber-700">
            This transfer will be sent to a manager for approval before stock is moved.
          </p>
        ) : null}

        <InventoryProductLines
          lines={lines}
          onChange={setLines}
          uomById={uomById}
          onAddProduct={addProduct}
          onAddProducts={addProducts}
          tableHeaders={[
            { key: "product", label: "Product" },
            { key: "measure", label: "Measured as" },
            { key: "qty", label: "Qty", align: "right" },
          ]}
          emptyMessage="Search and add products to transfer."
          renderCells={(line, index) => {
            const uom = resolveInventoryLineUom(line, uomById);
            return (
              <>
                <td className="px-3 py-2">
                  <UomMeasureSelect
                    uom={uom}
                    value={line.package_type}
                    onChange={(package_type) => updateLine(index, { package_type })}
                    className={`${inputClassName()} text-xs`}
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
              </>
            );
          }}
        />

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Link
            href="/inventory/transactions"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <PrimaryButton type="submit" showIcon={false} disabled={saving || lines.length === 0}>
            {saving
              ? useRequestFlow
                ? "Submitting…"
                : "Transferring…"
              : useRequestFlow
                ? "Submit for approval"
                : isPurposeTransfer
                  ? "Issue stock"
                  : "Transfer stock"}
          </PrimaryButton>
        </div>
      </form>
    </InventoryPageShell>
  );
}
