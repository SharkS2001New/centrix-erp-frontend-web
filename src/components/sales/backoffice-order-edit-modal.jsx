"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { showBackofficeLineDiscountEdit } from "@/lib/sales-settings";
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

function indexRetailPackages(rows) {
  const map = {};
  for (const row of rows ?? []) {
    if (row?.product_code) map[row.product_code] = row;
  }
  return map;
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

function buildNewDraftLine(product, uomById, retailMap) {
  const unitPrice = Number(product?.unit_price ?? product?.last_selling_price ?? 0);
  const draft = {
    id: null,
    clientKey: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    product_code: product.product_code,
    product,
    quantity: 1,
    selling_price: unitPrice,
    amount: unitPrice,
    product_vat: 0,
    discount_given: 0,
    uom: product.uom ?? product.unit ?? product.unit_id,
    on_wholesale_retail: 0,
    draftDiscount: 0,
    draftQty: "1",
  };
  const baseQty = saleLineEntryQtyToBase(draft, 1, uomById, retailMap);
  const safeBase = Number.isFinite(baseQty) && baseQty > 0 ? baseQty : 1;
  draft.quantity = safeBase;
  draft.amount = Math.round(unitPrice * Number(draft.draftQty) * 100) / 100;
  return draft;
}

export function BackofficeOrderEditModal({ open, sale, uomById, onClose, onSaved, capabilities = null }) {
  const { hasPermission } = useAuth();
  const [lines, setLines] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [retailByCode, setRetailByCode] = useState({});
  const [addProductCode, setAddProductCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadItems = useCallback(async () => {
    if (!sale?.id) return;
    setLoading(true);
    setError(null);
    setRemovedIds([]);
    setAddProductCode("");
    try {
      const [detail, retailRows] = await Promise.all([
        sale.items?.length ? Promise.resolve(sale) : apiRequest(`/sales/${sale.id}`),
        fetchRetailPackagesCached().catch(() => []),
      ]);
      const retailMap = indexRetailPackages(retailRows);
      setRetailByCode(retailMap);
      setLines((detail.items ?? []).map((line) => buildEditLine(line, uomById, retailMap)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load order lines.");
      setLines([]);
      setRetailByCode({});
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
      setError(null);
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
    setLines((prev) => {
      const existing = prev.find(
        (line) => String(line.product_code) === String(product.product_code),
      );
      if (existing) {
        const nextQty = Math.max(0.0001, Number(existing.draftQty) + 1);
        return prev.map((line) =>
          lineKey(line) === lineKey(existing)
            ? { ...line, draftQty: String(nextQty) }
            : line,
        );
      }
      return [...prev, buildNewDraftLine(product, uomById, retailByCode)];
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

  async function handleSave() {
    if (!sale?.id) return;
    if (lines.length === 0) {
      setError("An order must keep at least one line item.");
      return;
    }

    const payload = [];
    for (const line of lines) {
      const entryQty = Number(line.draftQty);
      if (!Number.isFinite(entryQty) || entryQty <= 0) {
        setError("Each line needs a quantity greater than zero.");
        return;
      }
      const baseQty = saleLineEntryQtyToBase(line, entryQty, uomById, retailByCode);
      if (!Number.isFinite(baseQty) || baseQty <= 0) {
        setError("Each line needs a quantity greater than zero.");
        return;
      }

      const item =
        line.id != null
          ? { id: line.id, quantity: baseQty }
          : {
              product_code: line.product_code,
              quantity: baseQty,
              on_wholesale_retail: Number(line.on_wholesale_retail) === 1,
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
      onSaved?.(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !sale?.id) return null;

  return renderPosModalPortal(
    <div className={posModalOverlayClass(false, "z-50")} role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
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
            onClick={onClose}
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
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Add item
              </label>
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

                  return (
                    <tr key={key} className="theme-table-row border-b last:border-b-0">
                      <td className="px-3 py-2.5 text-slate-800">{lineLabel(line)}</td>
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
                          className="inline-flex rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
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
    </div>,
  );
}
