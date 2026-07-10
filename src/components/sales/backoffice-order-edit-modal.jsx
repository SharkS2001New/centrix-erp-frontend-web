"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
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
import { inputClassName, PrimaryButton } from "@/components/catalog/catalog-shared";
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

function indexRetailPackages(rows) {
  const map = {};
  for (const row of rows ?? []) {
    if (row?.product_code) map[row.product_code] = row;
  }
  return map;
}

export function BackofficeOrderEditModal({ open, sale, uomById, onClose, onSaved, capabilities = null }) {
  const { hasPermission } = useAuth();
  const [lines, setLines] = useState([]);
  const [retailByCode, setRetailByCode] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadItems = useCallback(async () => {
    if (!sale?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, retailRes] = await Promise.all([
        sale.items?.length ? Promise.resolve(sale) : apiRequest(`/sales/${sale.id}`),
        apiRequest("/retail-package-settings", { searchParams: { per_page: 500 } }).catch(() => ({
          data: [],
        })),
      ]);
      const retailMap = indexRetailPackages(retailRes.data);
      setRetailByCode(retailMap);
      setLines(
        (detail.items ?? []).map((line) => {
          const editLine = {
            id: line.id,
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
        }),
      );
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
      setRetailByCode({});
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

  function updateQty(lineId, value) {
    setLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, draftQty: value } : line)),
    );
  }

  function updateDiscount(lineId, value) {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, draftDiscount: value } : line)));
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
      const item = { id: line.id, quantity: baseQty };
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
      const updated = await apiRequest(`/sales/orders/${sale.id}/line-quantities`, {
        method: "PATCH",
        body: { items: payload },
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
          "theme-panel flex w-[min(96vw,720px)] flex-col overflow-hidden rounded-xl border shadow-2xl",
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
                : `Adjust quantities${discountEditEnabled ? " and discounts" : ""} and save.`}
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

        <div className="max-h-[min(60vh,480px)] overflow-auto px-5 py-4">
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
                </tr>
              </thead>
              <tbody>
                    {lines.map((line) => {
                  const amount = saleLinePreviewRowAmount(line, line.draftQty, uomById, {
                    retailByCode,
                    draftDiscount: line.draftDiscount,
                    discountEditEnabled,
                  });
                  const unitPrice = saleLineSoldUnitPrice(line, uomById);

                  return (
                    <tr key={line.id} className="theme-table-row border-b last:border-b-0">
                      <td className="px-3 py-2.5 text-slate-800">{lineLabel(line)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min="0.0001"
                          step="any"
                          value={line.draftQty ?? ""}
                          disabled={saving}
                          onChange={(e) => updateQty(line.id, e.target.value)}
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
                                onChange={(e) => updateDiscount(line.id, e.target.value)}
                                className={`${inputClassName()} w-28 text-right text-sm`}
                                aria-label={`Discount for ${lineLabel(line)}`}
                              />
                            </td>
                          ) : null}
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                        {formatSaleKes(amount)}
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
            <PrimaryButton type="button" showIcon={false} disabled={saving || loading || !lines.length} onClick={() => void handleSave()}>
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
