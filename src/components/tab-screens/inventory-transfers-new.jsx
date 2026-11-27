"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import { useEffect, useMemo, useRef, useState } from "react";
import { tabAddTitle, useTabFormExit } from "@/hooks/use-tab-form-exit";
import { TabFormCancelButton } from "@/components/layout/tab-form-exit-button";
import { apiRequest, ApiError } from "@/lib/api";
import { canDirectInventoryAction } from "@/lib/approval-permissions";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/hooks/use-branch-scope";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { isStockTransferApprovalEnabled } from "@/lib/sales-settings";
import { Field, PrimaryButton, SearchableSelect, inputClassName } from "@/components/catalog/catalog-shared";
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
import {
  availableStockLocations,
  defaultStockLocation,
} from "@/lib/inventory-settings";
import {
  TRANSFER_FROM_OPTIONS,
  isLocationTransferTarget,
  isSalesRepTransferTarget,
  isStoreToShopTransfer,
  transferPurposeLabel,
  transferToOptionsFor,
} from "@/lib/inventory-transfer-routes";
import { damageQtyToBase } from "@/lib/stock-uom";
import { fetchUsersCached } from "@/lib/reference-data-cache";

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
  const { exitTo } = useTabFormExit(tabAddTitle("stock transfer"));
  const { user, capabilities, hasPermission } = useAuth();
  const { branches, showBranchFilter, effectiveBranchId, globalBranchId } = useBranchScope();
  const availableLocations = useMemo(() => availableStockLocations(capabilities), [capabilities]);
  const repStockEnabled = Boolean(capabilities?.module_settings?.sales?.sales_rep_stock_enabled);
  const canTransferToRep =
    repStockEnabled && Boolean(user?.is_admin) && hasPermission("inventory.manage");
  const locationOptions = useMemo(
    () => TRANSFER_FROM_OPTIONS.filter((option) => availableLocations.includes(option.value)),
    [availableLocations],
  );

  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [uoms, setUoms] = useState([]);
  const [salesReps, setSalesReps] = useState([]);
  const [selectedSalesRepId, setSelectedSalesRepId] = useState("");
  const [loadingSalesReps, setLoadingSalesReps] = useState(false);
  const [lines, setLines] = useState([]);
  const [fromLocation, setFromLocation] = useState(() => defaultStockLocation(capabilities, "store"));
  const [toLocation, setToLocation] = useState("shop");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [salesRepsError, setSalesRepsError] = useState("");
  const branchId = showBranchFilter
    ? selectedBranchId
    : effectiveBranchId;

  useEffect(() => {
    setSelectedBranchId(globalBranchId);
  }, [globalBranchId]);

  useEffect(() => {
    fetchUomsCached(user?.organization_id)
      .then((rows) => setUoms(rows ?? []))
      .catch(() => setUoms([]));
  }, [user?.organization_id]);

  useEffect(() => {
    if (!canTransferToRep || !branchId) {
      setSalesReps([]);
      setSelectedSalesRepId("");
      setLoadingSalesReps(false);
      setSalesRepsError("");
      return;
    }

    let active = true;
    setSalesReps([]);
    setSelectedSalesRepId("");
    setLoadingSalesReps(true);
    setSalesRepsError("");
    fetchUsersCached(user?.organization_id)
      .then((rows) => {
        if (!active) return;
        const eligible = (rows ?? []).filter(
          (rep) =>
            rep.is_admin !== true &&
            Number(rep.is_admin ?? 0) !== 1 &&
            rep.is_active !== false &&
            Number(rep.is_active ?? 1) !== 0 &&
            (rep.branch_id == null || String(rep.branch_id) === String(branchId)),
        );
        setSalesReps(eligible);
        setSelectedSalesRepId((current) =>
          eligible.some((rep) => String(rep.id) === current)
            ? current
            : String(eligible[0]?.id ?? ""),
        );
        setLoadingSalesReps(false);
      })
      .catch((error) => {
        if (!active) return;
        setSalesReps([]);
        setSelectedSalesRepId("");
        setLoadingSalesReps(false);
        setSalesRepsError(
          error instanceof Error ? error.message : "Could not load sales reps.",
        );
      });

    return () => {
      active = false;
    };
  }, [branchId, canTransferToRep, user?.organization_id]);

  const { uomById } = useInventoryCatalogMaps(uoms);
  const toOptions = useMemo(
    () =>
      transferToOptionsFor(fromLocation, availableLocations, {
        includeSalesRep: canTransferToRep,
      }),
    [availableLocations, canTransferToRep, fromLocation],
  );
  const isStoreToShop = isStoreToShopTransfer(fromLocation, toLocation);
  const isRepTransfer = isSalesRepTransferTarget(toLocation);
  const isPurposeTransfer = !isLocationTransferTarget(toLocation) && !isRepTransfer;
  const showReasonField = !isStoreToShop && !isRepTransfer;
  const reasonRequired = isPurposeTransfer;
  const useRequestFlow =
    isStockTransferApprovalEnabled(capabilities?.module_settings) &&
    !isRepTransfer &&
    !isStoreToShop &&
    !canDirectInventoryAction({ hasPermission, capabilities });

  useEffect(() => {
    if (!availableLocations.includes(fromLocation)) {
      setFromLocation(defaultStockLocation(capabilities, "store"));
    }
    if (!toOptions.some((opt) => opt.value === toLocation)) {
      setToLocation(toOptions[0]?.value ?? "shop");
    }
  }, [availableLocations, capabilities, fromLocation, toOptions, toLocation]);

  function addProduct(product) {
    if (!branchId) {
      notifyError("Select a branch before adding products.");
      return;
    }
    const code = product.product_code;
    if (lines.some((l) => l.product_code === code)) return;
    setLines((prev) => [...prev, lineFromProduct(product)]);
  }

  function addProducts(products) {
    if (!branchId) {
      notifyError("Select a branch before adding products.");
      return;
    }
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
    const nextToOptions = transferToOptionsFor(from, availableLocations, {
      includeSalesRep: canTransferToRep,
    });
    setToLocation((prev) =>
      nextToOptions.some((opt) => opt.value === prev)
        ? prev
        : (nextToOptions[0]?.value ?? "shop"),
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!branchId) {
      notifyError("Select a branch before transferring stock.");
      return;
    }
    const toPost = lines.filter((line) => line.product_code && Number(line.quantity) > 0);
    if (toPost.length === 0) {
      notifyError("Add at least one product with a quantity.");
      return;
    }
    if (reasonRequired && !reason.trim()) {
      notifyError("Add a reason for this transfer (e.g. staff lunch, donation recipient).");
      return;
    }
    if (isRepTransfer && !selectedSalesRepId) {
      notifyError("Select an active sales rep before transferring stock.");
      return;
    }

    setSaving(true);
    let pendingApproval = false;
    try {
      for (const line of toPost) {
        const uom = resolveInventoryLineUom(line, uomById);
        const quantity = damageQtyToBase(line.quantity, line.package_type, uom);
        const body = {
          branch_id: Number(branchId),
          product_code: line.product_code,
          quantity,
        };
        if (isRepTransfer) {
          await apiRequest("/sales/rep-stock-allocations", {
            method: "POST",
            body: {
              ...body,
              user_id: Number(selectedSalesRepId),
              stock_location: fromLocation,
            },
          });
        } else {
          const transferBody = {
            ...body,
            from_location: fromLocation,
            to_location: toLocation,
          };
          if (showReasonField && reason.trim()) {
            transferBody.notes = reason.trim();
          } else if (isPurposeTransfer) {
            transferBody.notes = transferPurposeLabel(toLocation);
          }
          const res = await apiRequest(useRequestFlow ? "/inventory/transfer/request" : "/inventory/transfer", {
            method: "POST",
            body: transferBody,
          });
          if (res?.pending_approval) pendingApproval = true;
        }
      }
      if (pendingApproval) {
        notifySuccess("Transfer submitted for manager approval.");
        exitTo("/notifications");
        return;
      }
      notifySuccess(
        isRepTransfer
          ? toPost.length === 1
            ? "Stock transferred to sales rep."
            : `${toPost.length} stock transfers to sales rep completed.`
          : toPost.length === 1
            ? "Stock transferred."
            : `${toPost.length} transfers completed.`,
      );
      exitTo(isRepTransfer ? "/inventory/transfers" : "/inventory/transactions?type=TRANSFER");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InventoryPageShell
      title="Transfer stock"
      subtitle={
        availableLocations.length === 1
          ? `Move stock from ${availableLocations[0]} for internal use, donations, and similar purposes`
          : "Move stock between shop and store, issue stock for internal use, or allocate stock to a sales rep"
      }
      backHref="/inventory/transactions"
      backLabel="Back to stock movements"
    >
      <form
        onSubmit={submit}
        className="space-y-5 theme-panel rounded-xl border p-6 shadow-sm"
      >
        {showBranchFilter ? (
          <Field label="Branch">
            <SearchableSelect
              className={inputClassName()}
              value={selectedBranchId}
              onChange={(value) => {
                setSelectedBranchId(value);
                setLines([]);
              }}
              required
              placeholder="Select branch"
              options={[
                { value: "", label: "Select branch" },
                ...branches.map((branch) => ({
                  value: String(branch.id),
                  label: branch.branch_name ?? `Branch #${branch.id}`,
                })),
              ]}
            />
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From">
            <SearchableSelect
              className={inputClassName()}
              value={fromLocation}
              onChange={handleFromChange}
              options={locationOptions}
            />
          </Field>
          <Field label="To">
            <SearchableSelect
              className={inputClassName()}
              value={toLocation}
              onChange={setToLocation}
              options={toOptions}
            />
          </Field>
        </div>

        {isRepTransfer ? (
          <Field label="Sales rep" required>
            <SearchableSelect
              className={inputClassName()}
              value={selectedSalesRepId}
              onChange={setSelectedSalesRepId}
              required
              placeholder={salesReps.length ? "Select sales rep" : "No active sales reps"}
              options={[
                { value: "", label: "Select sales rep" },
                ...salesReps.map((rep) => ({
                  value: String(rep.id),
                  label: rep.full_name || rep.name || rep.username || `User ${rep.id}`,
                })),
              ]}
              disabled={saving || loadingSalesReps || !salesReps.length}
            />
            {loadingSalesReps ? (
              <span className="mt-1 block text-xs text-slate-500">Loading sales reps…</span>
            ) : null}
            {salesRepsError ? (
              <span className="mt-1 block text-xs text-red-600">{salesRepsError}</span>
            ) : null}
            {!salesRepsError && !salesReps.length && branchId ? (
              <span className="mt-1 block text-xs text-slate-500">
                No active non-admin users are assigned to this branch.
              </span>
            ) : null}
          </Field>
        ) : null}

        {isRepTransfer ? (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            Stock will be allocated from {fromLocation === "store" ? "store" : "shop"} stock to the selected rep’s balance.
          </p>
        ) : null}

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

        {!branchId ? (
          <p className="text-sm text-amber-800">Select a branch before adding products.</p>
        ) : <InventoryProductLines
          lines={lines}
          onChange={setLines}
          uomById={uomById}
          branchId={Number(branchId)}
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
        />}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <TabFormCancelButton href="/inventory/transactions" />
          <PrimaryButton type="submit" showIcon={false} disabled={saving || lines.length === 0}>
            {saving
              ? useRequestFlow
                ? "Submitting…"
                : "Transferring…"
              : useRequestFlow
                ? "Submit for approval"
                : isRepTransfer
                  ? "Transfer to sales rep"
                : isPurposeTransfer
                  ? "Issue stock"
                  : "Transfer stock"}
          </PrimaryButton>
        </div>
      </form>
    </InventoryPageShell>
  );
}
