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
import {
  computePosLine,
  defaultPosEntryQty,
  lineDiscountTotal,
  posCartLineTypeLabel,
  productHasRetailTiers,
} from "@/lib/pos-line";
import { getPosSalesConfig, saleAppliesRouteMarkupPricing, showBackofficeLineDiscountEdit } from "@/lib/sales-settings";
import { isBackofficeSale } from "@/lib/sales";
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
import {
  creditCustomerToOption,
  fetchCreditCustomerByNum,
  searchCreditCustomers,
} from "@/lib/credit-customer-search";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";

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

/** Product can be sold at retail only when retail package tiers exist. */
function productAllowsRetail(productCode, retailMap) {
  if (!productCode) return false;
  return productHasRetailTiers(retailMap[String(productCode)] ?? null);
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
    product: line.product ? productWithUom(line.product, uomById) : line.product,
    quantity: Number(line.quantity ?? 0),
    selling_price: Number(line.selling_price ?? 0),
    display_unit_price: line.display_unit_price,
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

/**
 * POS-aligned pricing for edit drafts: wholesale/retail tiers, package markups, and route markup.
 */
function priceDraftLine(
  line,
  uomById,
  retailMap,
  routeMarkupPerUnit,
  { discountEditEnabled = false } = {},
) {
  const product = productWithUom(
    line.product ?? {
      product_code: line.product_code,
      unit_price: line.selling_price,
      uom: line.uom,
    },
    uomById,
  );
  if (!product?.product_code) {
    return {
      amount: saleLinePreviewRowAmount(line, line.draftQty, uomById, {
        retailByCode: retailMap,
        draftDiscount: line.draftDiscount,
        discountEditEnabled,
      }),
      unitPrice: saleLineSoldUnitPrice(line, uomById, retailMap),
      baseQty: saleLineEntryQtyToBase(line, line.draftQty, uomById, retailMap),
      displayUnitPrice: saleLineSoldUnitPrice(line, uomById, retailMap),
    };
  }

  const retailPackage = retailMap[line.product_code] ?? null;
  const asRetail = isRetailLine(line) && productHasRetailTiers(retailPackage);
  const sellWholesale = !asRetail;
  const entryQty = String(line.draftQty ?? defaultPosEntryQty(product, sellWholesale, retailPackage));

  const base = computePosLine({
    product,
    entryQty,
    sellWholesale,
    retailPackage,
    discount: 0,
    routeMarkupPerUnit,
    retailLine: asRetail,
  });

  let discountTotal = 0;
  if (discountEditEnabled) {
    discountTotal = lineDiscountTotal(Number(line.draftDiscount ?? 0), base.packQty);
  } else if (line.id != null) {
    const oldBase = Number(line.quantity ?? 0);
    if (oldBase > 0 && base.baseQty > 0) {
      discountTotal = Math.round((Number(line.discount_given ?? 0) * base.baseQty) / oldBase * 100) / 100;
    }
  }

  const computed =
    discountTotal > 0
      ? computePosLine({
          product,
          entryQty,
          sellWholesale,
          retailPackage,
          discount: discountTotal,
          routeMarkupPerUnit,
          retailLine: asRetail,
        })
      : base;

  return {
    amount: computed.lineAmount,
    unitPrice: computed.displayUnitPrice,
    displayUnitPrice: computed.displayUnitPrice,
    baseQty: computed.baseQty,
    packQty: computed.packQty,
    discountTotal: computed.discountApplied,
  };
}

function buildNewDraftLine(product, uomById, retailMap, { asRetail = false, routeMarkupPerUnit = 0 } = {}) {
  const productResolved = productWithUom(product, uomById);
  const retailPackage = retailMap[product.product_code] ?? null;
  const useRetail = Boolean(asRetail && productHasRetailTiers(retailPackage));
  const sellWholesale = !useRetail;
  const entryQty = defaultPosEntryQty(productResolved, sellWholesale, retailPackage);
  const computed = computePosLine({
    product: productResolved,
    entryQty,
    sellWholesale,
    retailPackage,
    discount: 0,
    routeMarkupPerUnit,
    retailLine: useRetail,
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
    display_unit_price: computed.displayUnitPrice,
    amount: computed.lineAmount,
    product_vat: 0,
    discount_given: 0,
    uom: productResolved.uom,
    on_wholesale_retail: useRetail ? 1 : 0,
    draftDiscount: 0,
    draftQty: String(entryQty),
  };
}

export function BackofficeOrderEditModal({ open, sale, uomById, onClose, onSaved, capabilities = null }) {
  const { hasPermission } = useAuth();
  const [lines, setLines] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [baselineDraft, setBaselineDraft] = useState([]);
  const [baselineRemovedIds, setBaselineRemovedIds] = useState([]);
  const [retailByCode, setRetailByCode] = useState({});
  const [addProductCode, setAddProductCode] = useState("");
  const [addAsRetail, setAddAsRetail] = useState(false);
  const [routeMarkupPerUnit, setRouteMarkupPerUnit] = useState(0);
  const [routeMarkupLabel, setRouteMarkupLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [customerNum, setCustomerNum] = useState("");
  const [baselineCustomerNum, setBaselineCustomerNum] = useState("");
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);

  const currentCustomerLabel = useMemo(() => {
    const fromSale =
      sale?.customer?.customer_name?.trim() ||
      sale?.customer_name?.trim() ||
      sale?.customer_name_override?.trim() ||
      "";
    if (fromSale && sale?.customer_num) {
      return `${fromSale} (#${sale.customer_num})`;
    }
    if (fromSale) return fromSale;
    if (sale?.customer_num) return `Customer #${sale.customer_num}`;
    return "Walk-in / no customer";
  }, [sale]);

  const posSalesConfig = useMemo(
    () => getPosSalesConfig(capabilities?.module_settings),
    [capabilities?.module_settings],
  );
  const retailPricingEnabled = Boolean(posSalesConfig.enableRetailPricing);

  const searchCustomersForSelect = useCallback(async (query) => {
    const rows = await searchCreditCustomers(query, { perPage: 30 });
    setCustomerOptions((prev) => {
      const byValue = new Map(prev.map((row) => [String(row.value), row]));
      for (const row of rows) byValue.set(String(row.value), row);
      return Array.from(byValue.values());
    });
    return rows;
  }, []);

  const loadItems = useCallback(async () => {
    if (!sale?.id) return;
    setLoading(true);
    setError(null);
    setRemovedIds([]);
    setAddProductCode("");
    setAddAsRetail(false);
    setLeavePromptOpen(false);
    const originalCustomer = sale?.customer_num != null ? String(sale.customer_num) : "";
    setCustomerNum(originalCustomer);
    setBaselineCustomerNum(originalCustomer);
    setCustomerOptions([]);
    try {
      const [detail, retailRows] = await Promise.all([
        // Always load full sale so route_id / fulfillment_meta are present for markup rules.
        apiRequest(`/sales/${sale.id}`),
        fetchRetailPackagesCached().catch(() => []),
      ]);
      const saleForPricing = { ...sale, ...detail };
      const applyMarkup = saleAppliesRouteMarkupPricing(saleForPricing, capabilities?.module_settings, {
        standalone: !isBackofficeSale(saleForPricing, capabilities),
      });
      const routeId = saleForPricing.route_id ?? saleForPricing.route?.id ?? null;
      const routeRes =
        applyMarkup && routeId
          ? await apiRequest(`/routes/${routeId}`).catch(() => saleForPricing.route ?? null)
          : null;

      const retailMap = indexRetailPackages(retailRows);
      setRetailByCode(retailMap);
      const markup = applyMarkup
        ? Number(routeRes?.route_markup_price ?? saleForPricing.route?.route_markup_price ?? 0)
        : 0;
      const safeMarkup = Number.isFinite(markup) && markup > 0 ? markup : 0;
      setRouteMarkupPerUnit(safeMarkup);
      setRouteMarkupLabel(
        safeMarkup > 0
          ? `Route markup KES ${safeMarkup.toLocaleString("en-KE")} applied (${
              routeRes?.route_name ?? saleForPricing.route?.route_name ?? `route #${routeId}`
            })`
          : "",
      );
      const nextLines = (detail.items ?? sale.items ?? []).map((line) =>
        buildEditLine(line, uomById, retailMap),
      );
      setLines(nextLines);
      setBaselineDraft(snapshotDraft(nextLines));
      setBaselineRemovedIds([]);

      const resolvedCustomerNum =
        detail.customer_num != null ? String(detail.customer_num) : originalCustomer;
      setCustomerNum(resolvedCustomerNum);
      setBaselineCustomerNum(resolvedCustomerNum);
      if (resolvedCustomerNum) {
        setCustomerLoading(true);
        try {
          const customer =
            detail.customer?.customer_num != null
              ? detail.customer
              : await fetchCreditCustomerByNum(resolvedCustomerNum);
          if (customer) {
            setCustomerOptions([creditCustomerToOption(customer)]);
          }
        } catch {
          // Keep num; select still works once user searches.
        } finally {
          setCustomerLoading(false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load order lines.");
      setLines([]);
      setRetailByCode({});
      setRouteMarkupPerUnit(0);
      setRouteMarkupLabel("");
      setBaselineDraft([]);
      setBaselineRemovedIds([]);
    } finally {
      setLoading(false);
    }
  }, [sale, uomById, capabilities]);

  useEffect(() => {
    if (!open || !sale?.id) {
      setLines([]);
      setRemovedIds([]);
      setRetailByCode({});
      setAddProductCode("");
      setAddAsRetail(false);
      setRouteMarkupPerUnit(0);
      setRouteMarkupLabel("");
      setError(null);
      setLeavePromptOpen(false);
      setBaselineDraft([]);
      setBaselineRemovedIds([]);
      setCustomerNum("");
      setBaselineCustomerNum("");
      setCustomerOptions([]);
      setCustomerLoading(false);
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

  const customerDirty = String(customerNum ?? "") !== String(baselineCustomerNum ?? "");

  const dirty = useMemo(() => {
    if (customerDirty) return true;
    if (!draftsEqual(snapshotDraft(lines), baselineDraft)) return true;
    const sortedRemoved = [...removedIds].sort((a, b) => a - b);
    const sortedBaseline = [...baselineRemovedIds].sort((a, b) => a - b);
    if (sortedRemoved.length !== sortedBaseline.length) return true;
    return sortedRemoved.some((id, index) => id !== sortedBaseline[index]);
  }, [lines, removedIds, baselineDraft, baselineRemovedIds, customerDirty]);

  const totals = useMemo(() => {
    return lines.reduce((sum, line) => {
      const priced = priceDraftLine(line, uomById, retailByCode, routeMarkupPerUnit, {
        discountEditEnabled,
      });
      return sum + Number(priced.amount ?? 0);
    }, 0);
  }, [lines, retailByCode, uomById, discountEditEnabled, routeMarkupPerUnit]);

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
        if (asRetail && !productAllowsRetail(line.product_code, retailByCode)) {
          return line;
        }
        const rebuilt = buildNewDraftLine(line.product, uomById, retailByCode, {
          asRetail,
          routeMarkupPerUnit,
        });
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
    const allowsRetail = productAllowsRetail(product.product_code, retailByCode);
    const asRetail = retailPricingEnabled && addAsRetail && allowsRetail;
    if (addAsRetail && !allowsRetail) {
      setError("This product has wholesale pricing only — added as wholesale.");
    }
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
      return [...prev, buildNewDraftLine(product, uomById, retailByCode, { asRetail, routeMarkupPerUnit })];
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
    if (customerDirty && !customerNum) {
      setError("Select the correct customer for this order.");
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
              on_wholesale_retail:
                isRetailLine(line) && productAllowsRetail(line.product_code, retailByCode),
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
      if (customerDirty && customerNum) {
        body.customer_num = Number(customerNum);
      }
      const updated = await apiRequest(`/sales/orders/${sale.id}/line-quantities`, {
        method: "PATCH",
        body,
      });
      setLeavePromptOpen(false);
      setBaselineDraft(snapshotDraft(lines));
      setBaselineRemovedIds([]);
      setBaselineCustomerNum(customerNum);
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
                : `Change customer if needed, add or remove items, adjust quantities${discountEditEnabled ? " and discounts" : ""}, then save.`}
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
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer</p>
            <p className="mt-1 text-sm text-slate-700">
              Current: <span className="font-medium text-slate-900">{currentCustomerLabel}</span>
            </p>
            <label className="mt-2 block text-xs font-medium text-slate-600">
              Move to customer
            </label>
            <div className="mt-1">
              <PosSearchableSelect
                value={customerNum}
                onChange={(nextValue, option) => {
                  setCustomerNum(nextValue);
                  if (option) {
                    setCustomerOptions((prev) => {
                      const without = prev.filter((row) => String(row.value) !== String(option.value));
                      return [option, ...without];
                    });
                  }
                  setError(null);
                }}
                options={customerOptions}
                loadOptions={searchCustomersForSelect}
                loading={customerLoading}
                disabled={saving || loading}
                placeholder="Search customer name or number…"
                searchPlaceholder="Type name, phone, or customer #…"
                emptyLabel="No customers found"
                idleSearchLabel="Type to search customers…"
              />
            </div>
            {customerDirty ? (
              <p className="mt-1.5 text-xs font-medium text-amber-700">
                Customer will update when you save.
              </p>
            ) : null}
          </div>

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

          {routeMarkupLabel ? (
            <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800/50 dark:bg-sky-950/20 dark:text-sky-100">
              {routeMarkupLabel}. Added and updated lines use this markup (same as when the order was
              created).
            </div>
          ) : null}

          {!loading ? (
            <div className="mb-4 space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Add item
              </label>
              {retailPricingEnabled ? (
                <div className="space-y-1">
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
                  <p className="text-xs text-slate-500">
                    Retail applies only to products with retail package pricing. Wholesale-only
                    products are always added as wholesale.
                  </p>
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
                  const priced = priceDraftLine(line, uomById, retailByCode, routeMarkupPerUnit, {
                    discountEditEnabled,
                  });
                  const amount = priced.amount;
                  const unitPrice = priced.unitPrice;
                  const allowsRetail = productAllowsRetail(line.product_code, retailByCode);
                  const canTogglePricing =
                    retailPricingEnabled && line.id == null && allowsRetail;

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
                              title={
                                line.id == null && !allowsRetail
                                  ? "This product has wholesale pricing only"
                                  : undefined
                              }
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
