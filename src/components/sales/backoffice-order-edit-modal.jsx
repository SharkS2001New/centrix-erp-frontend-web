"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchRetailPackagesCached } from "@/lib/reference-data-cache";
import { formatOrderNumber, formatSaleKes } from "@/lib/sales";
import {
  saleLineSoldUnitPrice,
  saleLineDiscountTotalFromEntered,
  saleLineEnteredDiscountPerUnit,
  saleLineEntryQtyForEdit,
  saleLineEntryQtyToBase,
  saleLinePreviewRowAmount,
} from "@/lib/sale-line-items";
import {
  computePosLine,
  defaultPosEntryQty,
  posCartLineTypeLabel,
} from "@/lib/pos-line";
import { getPosSalesConfig, showBackofficeLineDiscountEdit } from "@/lib/sales-settings";
import { useAuth } from "@/contexts/auth-context";
import { inputClassName, PrimaryButton, TrashIcon } from "@/components/catalog/catalog-shared";
import { ProductSearchSelect } from "@/components/catalog/product-search-select";
import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";
import { InlineActionError } from "@/components/shared/inline-action-error";
import {
  advisedDiscountLinesFromRejection,
  applyAdvisedDiscountsToDraftLines,
  draftLinesMatchAdvisedDiscounts,
  hasPerLineAdvisedDiscounts,
} from "@/lib/advised-discount-lines";

function lineLabel(line) {
  const code = line?.product_code ?? line?.product?.product_code ?? "";
  const name = line?.product?.product_name ?? line?.description ?? "";
  if (name && code) return `${name} (${code})`;
  return name || code || "Item";
}

function lineKey(line) {
  return line?.id != null ? `id-${line.id}` : `new-${line.clientKey}`;
}

function isRetailLine(line) {
  return Number(line?.on_wholesale_retail) === 1;
}

function indexRetailPackages(rows) {
  const map = {};
  for (const row of rows ?? []) {
    if (row?.product_code) map[row.product_code] = row;
  }
  return map;
}

function productWithUom(product, uomById) {
  if (!product) return product;
  if (product.uom && typeof product.uom === "object") return product;
  const unit =
    product.unit_id != null && uomById?.get
      ? uomById.get(product.unit_id)
      : (product.unit ?? null);
  return unit ? { ...product, uom: unit } : product;
}

function snapshotDraft(lines) {
  return lines.map((line) => ({
    key: lineKey(line),
    id: line.id ?? null,
    product_code: String(line.product_code ?? ""),
    draftQty: String(line.draftQty ?? ""),
    draftDiscount: String(line.draftDiscount ?? 0),
    on_wholesale_retail: isRetailLine(line) ? 1 : 0,
  }));
}

function draftsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.key !== right.key ||
      left.id !== right.id ||
      left.product_code !== right.product_code ||
      left.draftQty !== right.draftQty ||
      left.draftDiscount !== right.draftDiscount ||
      left.on_wholesale_retail !== right.on_wholesale_retail
    ) {
      return false;
    }
  }
  return true;
}

function buildEditLine(line, uomById, retailMap) {
  const editLine = {
    id: line.id,
    clientKey: line.clientKey ?? null,
    product_code: line.product_code,
    product: line.product,
    quantity: Number(line.quantity ?? 0),
    selling_price: Number(line.selling_price ?? 0),
    amount: Number(line.amount ?? 0),
    product_vat: Number(line.product_vat ?? 0),
    discount_given: Number(line.discount_given ?? 0),
    uom: line.uom,
    on_wholesale_retail: line.on_wholesale_retail,
  };
  return {
    ...editLine,
    draftDiscount: saleLineEnteredDiscountPerUnit(editLine, uomById, retailMap),
    draftQty: saleLineEntryQtyForEdit(editLine, uomById, retailMap),
  };
}

function buildNewDraftLine(product, uomById, retailMap, { asRetail = false } = {}) {
  const productResolved = productWithUom(product, uomById);
  const retailPackage = retailMap[product.product_code] ?? null;
  const sellWholesale = !asRetail;
  const entryQty = defaultPosEntryQty(productResolved, sellWholesale, retailPackage);
  const computed = computePosLine({
    product: productResolved,
    entryQty,
    sellWholesale,
    retailPackage,
    discount: 0,
  });
  const baseQty =
    Number.isFinite(computed.baseQty) && computed.baseQty > 0 ? computed.baseQty : 1;

  return {
    id: null,
    clientKey: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    product_code: product.product_code,
    product: productResolved,
    quantity: baseQty,
    selling_price: computed.displayUnitPrice,
    amount: computed.lineAmount,
    product_vat: 0,
    discount_given: 0,
    uom: productResolved.uom,
    on_wholesale_retail: asRetail ? 1 : 0,
    draftDiscount: 0,
    draftQty: String(entryQty),
  };
}

export function BackofficeOrderEditModal({ open, sale, uomById, onClose, onSaved, capabilities = null }) {
  const { hasPermission } = useAuth();
  const [lines, setLines] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [retailByCode, setRetailByCode] = useState({});
  const [addProductCode, setAddProductCode] = useState("");
  const [addAsRetail, setAddAsRetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const baselineRef = useRef([]);
  const removedBaselineRef = useRef([]);

  const posSalesConfig = useMemo(
    () => getPosSalesConfig(capabilities?.module_settings),
    [capabilities?.module_settings],
  );
  const retailPricingEnabled = Boolean(posSalesConfig.enableRetailPricing);

  const loadItems = useCallback(async () => {
    if (!sale?.id) return;
    setLoading(true);
    setError(null);
    setRemovedIds([]);
    setAddProductCode("");
    setAddAsRetail(false);
    setLeavePromptOpen(false);
    try {
      const [detail, retailRows] = await Promise.all([
        sale.items?.length ? Promise.resolve(sale) : apiRequest(`/sales/${sale.id}`),
        fetchRetailPackagesCached().catch(() => []),
      ]);
      const retailMap = indexRetailPackages(retailRows);
      setRetailByCode(retailMap);
      const nextLines = (detail.items ?? []).map((line) => buildEditLine(line, uomById, retailMap));
      setLines(nextLines);
      baselineRef.current = snapshotDraft(nextLines);
      removedBaselineRef.current = [];
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load order lines.");
      setLines([]);
      setRetailByCode({});
      baselineRef.current = [];
      removedBaselineRef.current = [];
    } finally {
      setLoading(false);
    }
  }, [sale, uomById]);

  useEffect(() => {
    if (!open || !sale?.id) {
      setLines([]);
      setRemovedIds([]);
      setRetailByCode({});
      setAddProductCode("");
      setAddAsRetail(false);
      setError(null);
      setLeavePromptOpen(false);
      baselineRef.current = [];
      removedBaselineRef.current = [];
      return;
    }
    void loadItems();
  }, [open, sale?.id, loadItems]);

  const discountEditEnabled = useMemo(
    () =>
      showBackofficeLineDiscountEdit(capabilities?.module_settings, {
        hasPermission,
        sale,
      }),
    [capabilities?.module_settings, hasPermission, sale],
  );

  const dirty = useMemo(() => {
    if (!draftsEqual(snapshotDraft(lines), baselineRef.current)) return true;
    const sortedRemoved = [...removedIds].sort((a, b) => a - b);
    const sortedBaseline = [...removedBaselineRef.current].sort((a, b) => a - b);
    if (sortedRemoved.length !== sortedBaseline.length) return true;
    return sortedRemoved.some((id, index) => id !== sortedBaseline[index]);
  }, [lines, removedIds]);

  const totals = useMemo(() => {
    return lines.reduce(
      (sum, line) =>
        sum +
        saleLinePreviewRowAmount(line, line.draftQty, uomById, {
          retailByCode,
          draftDiscount: line.draftDiscount,
          discountEditEnabled,
        }),
      0,
    );
  }, [lines, retailByCode, uomById, discountEditEnabled]);

  function updateQty(key, value) {
    setLines((prev) => prev.map((line) => (lineKey(line) === key ? { ...line, draftQty: value } : line)));
  }

  function updateDiscount(key, value) {
    setLines((prev) =>
      prev.map((line) => (lineKey(line) === key ? { ...line, draftDiscount: value } : line)),
    );
  }

  function updateLinePricingMode(key, asRetail) {
    setLines((prev) =>
      prev.map((line) => {
        if (lineKey(line) !== key || line.id != null) return line;
        const rebuilt = buildNewDraftLine(line.product, uomById, retailByCode, { asRetail });
        return {
          ...rebuilt,
          clientKey: line.clientKey,
          draftDiscount: line.draftDiscount,
        };
      }),
    );
  }

  function removeLine(line) {
    if (lines.length <= 1) {
      setError("An order must keep at least one line item.");
      return;
    }
    setError(null);
    if (line.id != null) {
      setRemovedIds((prev) => (prev.includes(line.id) ? prev : [...prev, line.id]));
    }
    setLines((prev) => prev.filter((row) => lineKey(row) !== lineKey(line)));
  }

  function handleAddProduct(product) {
    if (!product?.product_code) return;
    setError(null);
    const asRetail = retailPricingEnabled && addAsRetail;
    setLines((prev) => {
      const existing = prev.find(
        (line) =>
          String(line.product_code) === String(product.product_code) &&
          isRetailLine(line) === asRetail,
      );
      if (existing) {
        const nextQty = Math.max(0.0001, Number(existing.draftQty) + 1);
        return prev.map((line) =>
          lineKey(line) === lineKey(existing) ? { ...line, draftQty: String(nextQty) } : line,
        );
      }
      return [...prev, buildNewDraftLine(product, uomById, retailByCode, { asRetail })];
    });
    setAddProductCode("");
  }

  const isEditableResubmit = sale?.status === "editable";
  const advisedDiscountLines = advisedDiscountLinesFromRejection(sale?.discount_rejection);
  const canApplyAdvisedDiscounts =
    isEditableResubmit && hasPerLineAdvisedDiscounts(sale?.discount_rejection) && discountEditEnabled;
  const matchesAdvisedDiscounts =
    isEditableResubmit &&
    draftLinesMatchAdvisedDiscounts(lines, advisedDiscountLines, {
      getDraftDiscount: (line) => line.draftDiscount,
    });

  function applyAdvisedDiscounts() {
    setLines((prev) => applyAdvisedDiscountsToDraftLines(prev, advisedDiscountLines));
  }

  function requestClose() {
    if (saving) return;
    if (!dirty) {
      onClose?.();
      return;
    }
    setLeavePromptOpen(true);
  }

  async function handleSave() {
    if (!sale?.id) return false;
    if (lines.length === 0) {
      setError("An order must keep at least one line item.");
      return false;
    }

    const payload = [];
    for (const line of lines) {
      const entryQty = Number(line.draftQty);
      if (!Number.isFinite(entryQty) || entryQty <= 0) {
        setError("Each line needs a quantity greater than zero.");
        return false;
      }
      const baseQty = saleLineEntryQtyToBase(line, entryQty, uomById, retailByCode);
      if (!Number.isFinite(baseQty) || baseQty <= 0) {
        setError("Each line needs a quantity greater than zero.");
        return false;
      }

      const item =
        line.id != null
          ? { id: line.id, quantity: baseQty }
          : {
              product_code: line.product_code,
              quantity: baseQty,
              on_wholesale_retail: isRetailLine(line),
            };

      if (discountEditEnabled) {
        const perUnit = Number(line.draftDiscount ?? 0);
        if (Number.isFinite(perUnit)) {
          item.discount_given = saleLineDiscountTotalFromEntered(
            perUnit,
            line,
            entryQty,
            uomById,
            retailByCode,
          );
        }
      }
      payload.push(item);
    }

    setSaving(true);
    setError(null);
    try {
      const body = { items: payload };
      if (removedIds.length) body.remove_item_ids = removedIds;
      const updated = await apiRequest(`/sales/orders/${sale.id}/line-quantities`, {
        method: "PATCH",
        body,
      });
      setLeavePromptOpen(false);
      baselineRef.current = snapshotDraft(lines);
      removedBaselineRef.current = [];
      onSaved?.(updated);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save changes.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (!open || !sale?.id) return null;

  return renderPosModalPortal(
    <div className={posModalOverlayClass(false, "z-50")} role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={requestClose} aria-hidden />
      <div
        className={posModalPanelClass(
          false,
          "theme-panel flex w-[min(96vw,840px)] flex-col overflow-hidden rounded-xl border shadow-2xl",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backoffice-order-edit-title"
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 id="backoffice-order-edit-title" className="theme-heading text-base font-semibold">
              Edit order {formatOrderNumber(sale)}
            </h2>
            <p className="theme-subtext mt-0.5 text-xs">
              {isEditableResubmit
                ? matchesAdvisedDiscounts
                  ? "Approver-advised discounts are applied. Save to book this order."
                  : "Adjust pricing per manager guidance, then save to resubmit for approval."
                : `Add or remove items, adjust quantities${discountEditEnabled ? " and discounts" : ""}, then save.`}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <div className="max-h-[min(60vh,520px)] overflow-auto px-5 py-4">
          {canApplyAdvisedDiscounts ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/20">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                Manager advised per-item discounts on this order.
              </p>
              <button
                type="button"
                disabled={saving || loading}
                onClick={applyAdvisedDiscounts}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
              >
                Apply advised discounts
              </button>
            </div>
          ) : null}

          {!loading ? (
            <div className="mb-4 space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Add item
              </label>
              {retailPricingEnabled ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex cursor-pointer items-center gap-1.5 text-slate-700">
                    <input
                      type="radio"
                      name="edit-order-add-pricing"
                      checked={!addAsRetail}
                      disabled={saving}
                      onChange={() => setAddAsRetail(false)}
                    />
                    Wholesale
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-slate-700">
                    <input
                      type="radio"
                      name="edit-order-add-pricing"
                      checked={addAsRetail}
                      disabled={saving}
                      onChange={() => setAddAsRetail(true)}
                    />
                    Retail
                  </label>
                </div>
              ) : null}
              <ProductSearchSelect
                value={addProductCode}
                onChange={setAddProductCode}
                onProductSelect={handleAddProduct}
                disabled={saving}
                placeholder="Search product name or code…"
              />
            </div>
          ) : null}

          {loading ? (
            <p className="theme-subtext py-8 text-center text-sm">Loading order lines…</p>
          ) : lines.length === 0 ? (
            <p className="theme-subtext py-8 text-center text-sm">No line items on this order.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="theme-table-head border-b text-left text-xs font-medium uppercase tracking-wide">
                  <th className="px-3 py-2">Item</th>
                  {retailPricingEnabled ? <th className="w-28 px-3 py-2">Type</th> : null}
                  <th className="w-28 px-3 py-2 text-right">Qty</th>
                  <th className="w-32 px-3 py-2 text-right">Unit price</th>
                  {discountEditEnabled ? (
                    <th className="w-28 px-3 py-2 text-right">Disc / unit</th>
                  ) : null}
                  <th className="w-32 px-3 py-2 text-right">Amount</th>
                  <th className="w-12 px-2 py-2 text-center">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const key = lineKey(line);
                  const amount = saleLinePreviewRowAmount(line, line.draftQty, uomById, {
                    retailByCode,
                    draftDiscount: line.draftDiscount,
                    discountEditEnabled,
                  });
                  const unitPrice = saleLineSoldUnitPrice(line, uomById);
                  const canTogglePricing = retailPricingEnabled && line.id == null;

                  return (
                    <tr key={key} className="theme-table-row border-b last:border-b-0">
                      <td className="px-3 py-2.5 text-slate-800">{lineLabel(line)}</td>
                      {retailPricingEnabled ? (
                        <td className="px-3 py-2.5">
                          {canTogglePricing ? (
                            <select
                              value={isRetailLine(line) ? "retail" : "wholesale"}
                              disabled={saving}
                              onChange={(e) =>
                                updateLinePricingMode(key, e.target.value === "retail")
                              }
                              className={`${inputClassName()} w-full min-w-[6.5rem] text-xs`}
                              aria-label={`Pricing type for ${lineLabel(line)}`}
                            >
                              <option value="wholesale">Wholesale</option>
                              <option value="retail">Retail</option>
                            </select>
                          ) : (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                isRetailLine(line)
                                  ? "bg-violet-100 text-violet-800"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {posCartLineTypeLabel(line)}
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min="0.0001"
                          step="any"
                          value={line.draftQty ?? ""}
                          disabled={saving}
                          onChange={(e) => updateQty(key, e.target.value)}
                          className={`${inputClassName()} w-24 text-right text-sm`}
                          aria-label={`Quantity for ${lineLabel(line)}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">
                        {formatSaleKes(unitPrice)}
                      </td>
                      {discountEditEnabled ? (
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.draftDiscount ?? 0}
                            disabled={saving}
                            onChange={(e) => updateDiscount(key, e.target.value)}
                            className={`${inputClassName()} w-28 text-right text-sm`}
                            aria-label={`Discount for ${lineLabel(line)}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                        {formatSaleKes(amount)}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          disabled={saving || lines.length <= 1}
                          onClick={() => removeLine(line)}
                          className="inline-flex rounded-md p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Remove ${lineLabel(line)}`}
                          title="Remove item"
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
          <div className="text-sm text-slate-600">
            Order total: <span className="font-semibold text-slate-900">{formatSaleKes(totals)}</span>
            {dirty ? (
              <span className="ml-2 text-xs font-medium text-amber-700">Unsaved changes</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {error ? (
              <InlineActionError message={error} className="max-w-xs text-right text-xs" />
            ) : null}
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={saving || loading || !lines.length}
              onClick={() => void handleSave()}
            >
              {saving
                ? "Saving…"
                : isEditableResubmit
                  ? matchesAdvisedDiscounts
                    ? "Save & book order"
                    : "Save & resubmit for approval"
                  : "Save"}
            </PrimaryButton>
          </div>
        </div>
      </div>

      {leavePromptOpen ? (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="edit-order-leave-title"
          aria-describedby="edit-order-leave-message"
        >
          <div className="theme-panel w-full max-w-md rounded-xl border p-5 shadow-2xl">
            <h3 id="edit-order-leave-title" className="theme-heading text-base font-semibold">
              Save changes?
            </h3>
            <p id="edit-order-leave-message" className="theme-subtext mt-2 text-sm">
              You have unsaved order changes (including any newly added items). Save them before
              closing, or discard to leave without saving.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setLeavePromptOpen(false)}
                className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Keep editing
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setLeavePromptOpen(false);
                  onClose?.();
                }}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
  );
}
