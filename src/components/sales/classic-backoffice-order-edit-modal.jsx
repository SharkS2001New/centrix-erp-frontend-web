"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { searchProductCatalogCached } from "@/lib/catalog-cache";
import { fetchRetailPackagesForProductCodes } from "@/lib/reference-data-cache";
import { formatOrderNumber, formatSaleKes, isBackofficeSale } from "@/lib/sales";
import { computePosLine, defaultPosEntryQty, productHasRetailTiers } from "@/lib/pos-line";
import { posCashOrderTotal } from "@/lib/pos-cash-round";
import {
  getPosSalesConfig,
  saleAppliesRouteMarkupPricing,
  showBackofficeLineDiscountEdit,
} from "@/lib/sales-settings";
import { useAuth } from "@/contexts/auth-context";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
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
import { PosProductSearch } from "@/components/sales/pos-product-search";
import { ClassicPosCartTable } from "@/components/sales/classic-pos-cart-table";
import {
  buildEditLine,
  buildLineQuantitiesSaveBody,
  buildNewDraftLine,
  draftsEqual,
  indexRetailPackages,
  isRetailLine,
  lineKey,
  lineLabel,
  priceDraftLine,
  productAllowsRetail,
  productWithUom,
  snapshotDraft,
  swapLineWithProduct,
} from "@/lib/backoffice-order-edit";
import {
  applyClassicPosDocumentTheme,
  applyOrgErpSidebarTheme,
  clearClassicPosDocumentTheme,
  classicPosThemeBridgeVars,
  resolveClassicPosThemeColors,
  resolveClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import { getTheme } from "@/lib/theme";
import { uomCompactPackageLabel } from "@/lib/uom-packaging";
import {
  isPosFunctionKeyEvent,
  resolvePosShortcutKey,
} from "@/lib/pos-keyboard-shortcuts";

/**
 * Classic POS-style Edit order popup — same pricing/route markup path as modern.
 */
export function ClassicBackofficeOrderEditModal({
  open,
  sale,
  uomById,
  onClose,
  onSaved,
  capabilities = null,
}) {
  const { hasPermission, capabilities: authCapabilities, user } = useAuth();
  const effectiveCapabilities = capabilities ?? authCapabilities;
  const [lines, setLines] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [baselineDraft, setBaselineDraft] = useState([]);
  const [baselineRemovedIds, setBaselineRemovedIds] = useState([]);
  const [retailByCode, setRetailByCode] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sellAtRetail, setSellAtRetail] = useState(false);
  const [routeMarkupPerUnit, setRouteMarkupPerUnit] = useState(0);
  const [routeMarkupLabel, setRouteMarkupLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [customerNum, setCustomerNum] = useState("");
  const [baselineCustomerNum, setBaselineCustomerNum] = useState("");
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedLineKey, setSelectedLineKey] = useState(null);
  const [selectedLineIds, setSelectedLineIds] = useState(() => new Set());
  const [replacingLineKey, setReplacingLineKey] = useState(null);
  const [swapDraft, setSwapDraft] = useState(null);
  const swapLineQtyRef = useRef(null);
  const entryQtyRef = useRef(null);
  const searchInputRef = useRef(null);
  const [entryProduct, setEntryProduct] = useState(null);
  const [entryQty, setEntryQty] = useState("");

  const classicThemeTemplate = useMemo(
    () => resolveClassicPosThemeTemplate(effectiveCapabilities),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveCapabilities?.module_settings?.sales?.classic_pos_theme_template],
  );
  const classicThemeColorsKey = JSON.stringify(
    effectiveCapabilities?.module_settings?.sales?.classic_pos_theme_colors ?? {},
  );
  const classicThemeColors = useMemo(
    () => resolveClassicPosThemeColors(effectiveCapabilities),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classicThemeColorsKey],
  );
  const themeStyle = useMemo(
    () => classicPosThemeBridgeVars(classicThemeTemplate, classicThemeColors),
    [classicThemeTemplate, classicThemeColors],
  );

  // Match Classic External POS: apply the ERP-selected classic theme on document
  // so portaled scan dropdowns / buttons inherit the palette.
  useLayoutEffect(() => {
    if (!open) return undefined;
    applyClassicPosDocumentTheme(classicThemeTemplate, classicThemeColors);
    return () => {
      clearClassicPosDocumentTheme();
      applyOrgErpSidebarTheme(classicThemeTemplate, classicThemeColors, {
        mode: getTheme(),
      });
    };
  }, [open, classicThemeTemplate, classicThemeColors]);

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
    () => getPosSalesConfig(effectiveCapabilities?.module_settings),
    [effectiveCapabilities?.module_settings],
  );
  const enablePosCashRounding = Boolean(posSalesConfig.enablePosCashRounding);
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

  useEffect(() => {
    if (!open) return undefined;
    const trimmed = String(searchQuery ?? "").trim();
    if (trimmed.length < 1) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const list = await searchProductCatalogCached(user?.organization_id, trimmed, {
            limit: 50,
            status: "all",
          });
          if (!cancelled) setSearchResults(Array.isArray(list) ? list : []);
        } catch {
          if (!cancelled) setSearchResults([]);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, searchQuery, user?.organization_id]);

  const resetTransient = useCallback(() => {
    setReplacingLineKey(null);
    setSwapDraft(null);
    setEntryProduct(null);
    setEntryQty("");
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  const loadItems = useCallback(async () => {
    if (!sale?.id) return;
    setLoading(true);
    setError(null);
    setRemovedIds([]);
    setSellAtRetail(false);
    setLeavePromptOpen(false);
    resetTransient();
    const originalCustomer = sale?.customer_num != null ? String(sale.customer_num) : "";
    setCustomerNum(originalCustomer);
    setBaselineCustomerNum(originalCustomer);
    setCustomerOptions([]);
    try {
      const detail = await apiRequest(`/sales/${sale.id}`);
      const saleForPricing = { ...sale, ...detail };
      const applyMarkup = saleAppliesRouteMarkupPricing(saleForPricing, effectiveCapabilities?.module_settings, {
        standalone: !isBackofficeSale(saleForPricing, effectiveCapabilities),
      });
      const routeId = saleForPricing.route_id ?? saleForPricing.route?.id ?? null;
      const routeRes =
        applyMarkup && routeId
          ? await apiRequest(`/routes/${routeId}`).catch(() => saleForPricing.route ?? null)
          : null;

      const lineCodes = (detail.items ?? sale.items ?? [])
        .map((line) => line.product_code)
        .filter(Boolean);
      const retailRows = await fetchRetailPackagesForProductCodes(lineCodes).catch(() => []);
      const retailMap = indexRetailPackages(retailRows);
      setRetailByCode(retailMap);
      const markup = applyMarkup
        ? Number(routeRes?.route_markup_price ?? saleForPricing.route?.route_markup_price ?? 0)
        : 0;
      const safeMarkup = Number.isFinite(markup) && markup > 0 ? markup : 0;
      setRouteMarkupPerUnit(safeMarkup);
      setRouteMarkupLabel(
        safeMarkup > 0
          ? `Route markup KES ${safeMarkup.toLocaleString("en-KE")} · ${
              routeRes?.route_name ?? saleForPricing.route?.route_name ?? `route #${routeId}`
            }`
          : "",
      );
      const nextLines = (detail.items ?? sale.items ?? []).map((line) =>
        buildEditLine(line, uomById, retailMap),
      );
      setLines(nextLines);
      setBaselineDraft(snapshotDraft(nextLines));
      setBaselineRemovedIds([]);
      setSelectedLineKey(nextLines[0] ? lineKey(nextLines[0]) : null);
      setSelectedLineIds(new Set());
      setStatusMessage("");

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
  }, [sale, uomById, effectiveCapabilities, resetTransient]);

  useEffect(() => {
    if (!open || !sale?.id) {
      setLines([]);
      setRemovedIds([]);
      setRetailByCode({});
      setSellAtRetail(false);
      setRouteMarkupPerUnit(0);
      setRouteMarkupLabel("");
      setError(null);
      setStatusMessage("");
      setLeavePromptOpen(false);
      setBaselineDraft([]);
      setBaselineRemovedIds([]);
      setCustomerNum("");
      setBaselineCustomerNum("");
      setCustomerOptions([]);
      setCustomerLoading(false);
      setSelectedLineKey(null);
      resetTransient();
      return;
    }
    void loadItems();
  }, [open, sale?.id, loadItems, resetTransient]);

  const discountEditEnabled = useMemo(
    () =>
      showBackofficeLineDiscountEdit(effectiveCapabilities?.module_settings, {
        hasPermission,
        sale,
      }),
    [effectiveCapabilities?.module_settings, hasPermission, sale],
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
    const lineAmounts = lines.map((line) => {
      const priced = priceDraftLine(line, uomById, retailByCode, routeMarkupPerUnit, {
        discountEditEnabled,
        cashRound: enablePosCashRounding,
      });
      return Number(priced.amount ?? 0);
    });
    if (enablePosCashRounding) {
      return posCashOrderTotal(lineAmounts);
    }
    return lineAmounts.reduce((sum, amount) => sum + amount, 0);
  }, [lines, retailByCode, uomById, discountEditEnabled, routeMarkupPerUnit, enablePosCashRounding]);

  const cartLines = useMemo(
    () =>
      lines.map((line) => {
        const key = lineKey(line);
        const product = line.product ?? {};
        return {
          ...line,
          id: key,
          product_name:
            product.product_name ?? line.description ?? line.product_code ?? "Item",
          package_label: uomCompactPackageLabel(product.uom ?? line.uom) || "—",
        };
      }),
    [lines],
  );

  const swapLinePreview = useMemo(() => {
    if (!swapDraft?.product || swapDraft.quantity == null || swapDraft.quantity === "") {
      return null;
    }
    const product = productWithUom(swapDraft.product, uomById);
    const retailPackage = retailByCode[product.product_code] ?? null;
    const asRetail =
      retailPricingEnabled &&
      sellAtRetail &&
      productHasRetailTiers(retailPackage);
    const computed = computePosLine({
      product,
      entryQty: String(swapDraft.quantity),
      sellWholesale: !asRetail,
      retailPackage,
      discount: 0,
      routeMarkupPerUnit,
      retailLine: asRetail,
      cashRound: enablePosCashRounding,
    });
    return {
      lineId: swapDraft.lineKey,
      productCode: product.product_code,
      productName: product.product_name ?? product.product_code,
      package: uomCompactPackageLabel(product.uom) || "—",
      unitPrice: computed.displayUnitPrice,
      amount: computed.lineAmount,
    };
  }, [
    swapDraft,
    sellAtRetail,
    retailByCode,
    retailPricingEnabled,
    routeMarkupPerUnit,
    enablePosCashRounding,
    uomById,
  ]);

  const entryReady = Boolean(entryProduct && !replacingLineKey);
  const entryComputed = useMemo(() => {
    if (!entryReady || !entryProduct) return null;
    const product = productWithUom(entryProduct, uomById);
    const retailPackage = retailByCode[product.product_code] ?? null;
    const asRetail =
      retailPricingEnabled && sellAtRetail && productHasRetailTiers(retailPackage);
    const qty =
      entryQty !== ""
        ? entryQty
        : defaultPosEntryQty(product, !asRetail, retailPackage);
    return computePosLine({
      product,
      entryQty: String(qty),
      sellWholesale: !asRetail,
      retailPackage,
      discount: 0,
      routeMarkupPerUnit,
      retailLine: asRetail,
      cashRound: enablePosCashRounding,
    });
  }, [
    entryReady,
    entryProduct,
    entryQty,
    sellAtRetail,
    retailByCode,
    retailPricingEnabled,
    routeMarkupPerUnit,
    enablePosCashRounding,
    uomById,
  ]);

  async function ensureRetailPackage(code) {
    if (retailByCode[code] !== undefined) return retailByCode;
    const rows = await fetchRetailPackagesForProductCodes([code]).catch(() => []);
    const packages = { ...retailByCode, ...indexRetailPackages(rows) };
    if (packages[code] === undefined) packages[code] = null;
    setRetailByCode(packages);
    return packages;
  }

  function beginReplaceCartLine(tableLineId) {
    const line = lines.find((row) => lineKey(row) === String(tableLineId));
    if (!line || saving) return;
    setSwapDraft(null);
    setReplacingLineKey(lineKey(line));
    setSelectedLineKey(lineKey(line));
    setEntryProduct(null);
    setEntryQty("");
    setSearchQuery("");
    setSearchResults([]);
    setStatusMessage(
      `Swap ${lineLabel(line)}: search or scan the replacement product. Esc cancels.`,
    );
  }

  function cancelReplaceCartLine() {
    if (!replacingLineKey && !swapDraft) return;
    setReplacingLineKey(null);
    setSwapDraft(null);
    setEntryProduct(null);
    setEntryQty("");
    setSearchQuery("");
    setSearchResults([]);
    setStatusMessage("Swap cancelled.");
  }

  function focusNewLineScan() {
    setSelectedLineKey(null);
    setEntryProduct(null);
    setEntryQty("");
    setSearchQuery("");
    setSearchResults([]);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus?.();
      searchInputRef.current?.select?.();
    });
  }

  async function completeSwapFromDraft(entryQtyRaw) {
    const draft = swapDraft;
    if (!draft?.product || !draft.lineKey) return;
    const qty = String(entryQtyRaw ?? draft.quantity ?? "").trim();
    if (!qty || Number(qty) <= 0) {
      setError("Enter a valid quantity for the replacement.");
      return;
    }
    const packages = await ensureRetailPackage(String(draft.product.product_code));
    const asRetail =
      retailPricingEnabled &&
      sellAtRetail &&
      productAllowsRetail(draft.product.product_code, packages);
    const result = swapLineWithProduct({
      lines,
      removedIds,
      targetKey: draft.lineKey,
      product: draft.product,
      entryQty: qty,
      uomById,
      retailMap: packages,
      asRetail,
      routeMarkupPerUnit,
      cashRound: enablePosCashRounding,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setLines(result.lines);
    setRemovedIds(result.removedIds);
    setReplacingLineKey(null);
    setSwapDraft(null);
    setError(null);
    setStatusMessage(`Swapped to ${draft.product.product_code}.`);
    focusNewLineScan();
  }

  async function handleProductPicked(product) {
    if (!product?.product_code || saving) return;
    setError(null);
    const packages = await ensureRetailPackage(String(product.product_code));
    const allowsRetail = productAllowsRetail(product.product_code, packages);
    const asRetail = retailPricingEnabled && sellAtRetail && allowsRetail;
    if (sellAtRetail && !allowsRetail) {
      setStatusMessage("Wholesale-only product — priced as wholesale.");
    }

    if (replacingLineKey) {
      const target = lines.find((line) => lineKey(line) === replacingLineKey);
      const defaultQty = defaultPosEntryQty(
        productWithUom(product, uomById),
        !asRetail,
        packages[product.product_code] ?? null,
      );
      setSwapDraft({
        lineKey: replacingLineKey,
        line: target,
        product: productWithUom(product, uomById),
        quantity: String(defaultQty),
      });
      setSearchQuery("");
      setSearchResults([]);
      setStatusMessage(
        `Replacement ${product.product_code} ready — edit qty and press Enter to commit.`,
      );
      requestAnimationFrame(() => {
        swapLineQtyRef.current?.focus?.();
        swapLineQtyRef.current?.select?.();
      });
      return;
    }

    const code = String(product.product_code);
    // Same product already parked on the entry row — keep code, just refocus qty.
    if (
      entryProduct &&
      String(entryProduct.product_code) === code &&
      String(searchQuery).trim() !== ""
    ) {
      requestAnimationFrame(() => {
        entryQtyRef.current?.focus?.();
        entryQtyRef.current?.select?.();
      });
      return;
    }

    const existing = lines.find(
      (line) => String(line.product_code) === code && isRetailLine(line) === asRetail,
    );
    if (existing) {
      const focusKey = lineKey(existing);
      const nextQty = Math.max(0.0001, Number(existing.draftQty) + 1);
      setLines((prev) =>
        prev.map((line) =>
          lineKey(line) === focusKey ? { ...line, draftQty: String(nextQty) } : line,
        ),
      );
      setSelectedLineKey(focusKey);
      setSearchQuery("");
      setSearchResults([]);
      setEntryProduct(null);
      setEntryQty("");
      setStatusMessage(`Increased qty for ${code}.`);
      return;
    }

    setEntryProduct(productWithUom(product, uomById));
    const defaultQty = defaultPosEntryQty(
      productWithUom(product, uomById),
      !asRetail,
      packages[code] ?? null,
    );
    setEntryQty(String(defaultQty));
    // Keep product code in scan field while qty is edited (same as Classic POS).
    setSearchQuery(code);
    setSearchResults([]);
    requestAnimationFrame(() => {
      entryQtyRef.current?.focus?.();
      entryQtyRef.current?.select?.();
    });
  }

  function commitEntryLine() {
    if (!entryProduct || replacingLineKey) return;
    const qty = String(entryQty || "").trim();
    if (!qty || Number(qty) <= 0) {
      setError("Enter a valid quantity.");
      return;
    }
    const packages = retailByCode;
    const allowsRetail = productAllowsRetail(entryProduct.product_code, packages);
    const asRetail = retailPricingEnabled && sellAtRetail && allowsRetail;
    const newLine = buildNewDraftLine(entryProduct, uomById, packages, {
      asRetail,
      routeMarkupPerUnit,
      cashRound: enablePosCashRounding,
      draftQty: qty,
    });
    setLines((prev) => [...prev, newLine]);
    setSelectedLineKey(lineKey(newLine));
    setEntryProduct(null);
    setEntryQty("");
    setSearchQuery("");
    setSearchResults([]);
    setError(null);
    setStatusMessage(`Added ${entryProduct.product_code}.`);
  }

  function handleSetLineQty(tableLine, qtyRaw) {
    const key = String(tableLine?.id ?? "");
    if (swapDraft && String(swapDraft.lineKey) === key) {
      void completeSwapFromDraft(qtyRaw);
      return;
    }
    const line = lines.find((row) => lineKey(row) === key);
    if (!line) return;
    const trimmed = String(qtyRaw ?? "").trim();
    if (!trimmed || Number(trimmed) <= 0) {
      setError("Each line needs a quantity greater than zero.");
      return;
    }
    setError(null);

    // Unsaved lines: qty Enter applies current F12 retail/wholesale mode (classic POS).
    if (line.id == null && line.product) {
      const allowsRetail = productAllowsRetail(line.product_code, retailByCode);
      const asRetail = retailPricingEnabled && sellAtRetail && allowsRetail;
      const rebuilt = buildNewDraftLine(line.product, uomById, retailByCode, {
        asRetail,
        routeMarkupPerUnit,
        cashRound: enablePosCashRounding,
        draftQty: trimmed,
      });
      setLines((prev) =>
        prev.map((row) =>
          lineKey(row) === key
            ? { ...rebuilt, clientKey: line.clientKey, draftDiscount: line.draftDiscount }
            : row,
        ),
      );
      focusNewLineScan();
      return;
    }

    setLines((prev) =>
      prev.map((row) => (lineKey(row) === key ? { ...row, draftQty: trimmed } : row)),
    );
    focusNewLineScan();
  }

  function removeSelectedLine() {
    const checkedKeys = [...selectedLineIds].map(String).filter(Boolean);
    const keysToRemove =
      checkedKeys.length > 0
        ? checkedKeys
        : selectedLineKey
          ? [String(selectedLineKey)]
          : [];
    if (!keysToRemove.length) return;

    const keySet = new Set(keysToRemove);
    const targets = lines.filter((row) => keySet.has(String(lineKey(row))));
    if (!targets.length) return;

    if (lines.length - targets.length < 1) {
      setError(
        targets.length > 1
          ? "Keep at least one line on the order. Uncheck some items before deleting."
          : "An order must keep at least one line item.",
      );
      return;
    }

    setError(null);
    setRemovedIds((prev) => {
      const next = [...prev];
      for (const line of targets) {
        if (line.id != null && !next.includes(line.id)) next.push(line.id);
      }
      return next;
    });
    const nextLines = lines.filter((row) => !keySet.has(String(lineKey(row))));
    setLines(nextLines);
    setSelectedLineIds(new Set());
    setSelectedLineKey(nextLines[0] ? lineKey(nextLines[0]) : null);
    if (replacingLineKey && keySet.has(String(replacingLineKey))) {
      cancelReplaceCartLine();
    }
    const label =
      targets.length === 1
        ? lineLabel(targets[0])
        : `${targets.length} items`;
    setStatusMessage(`Removed ${label}.`);
  }

  function handleSelectLine(id) {
    const key = String(id);
    setSelectedLineKey(key);
    setSelectedLineIds((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  function toggleLineSelect(id) {
    const key = String(id);
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelectedLineKey(key);
  }

  function toggleAllLines(checked) {
    if (!checked) {
      setSelectedLineIds(new Set());
      return;
    }
    setSelectedLineIds(new Set(cartLines.map((line) => String(line.id))));
  }

  function updateSelectedDiscount(value) {
    if (!selectedLineKey || !discountEditEnabled) return;
    setLines((prev) =>
      prev.map((line) =>
        lineKey(line) === selectedLineKey ? { ...line, draftDiscount: value } : line,
      ),
    );
  }

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (leavePromptOpen) return;
      if (isPosFunctionKeyEvent(e) && resolvePosShortcutKey(e) === "F12" && retailPricingEnabled) {
        e.preventDefault();
        e.stopPropagation();
        setSellAtRetail((prev) => {
          const next = !prev;
          queueMicrotask(() => setStatusMessage(next ? "Mode: RETAIL" : "Mode: WHOLESALE"));
          return next;
        });
        return;
      }
      if (e.key === "Escape" && (replacingLineKey || swapDraft)) {
        e.preventDefault();
        cancelReplaceCartLine();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, leavePromptOpen, retailPricingEnabled, replacingLineKey, swapDraft]);

  const isEditableResubmit = sale?.status === "editable";
  const advisedDiscountLines = advisedDiscountLinesFromRejection(sale?.discount_rejection);
  const canApplyAdvisedDiscounts =
    isEditableResubmit && hasPerLineAdvisedDiscounts(sale?.discount_rejection) && discountEditEnabled;
  const matchesAdvisedDiscounts =
    isEditableResubmit &&
    (draftLinesMatchAdvisedDiscounts(lines, advisedDiscountLines, {
      getDraftDiscount: (line) => line.draftDiscount,
    }) ||
      (sale?.discount_rejection?.rejection_guidance_type === "remove_discount" &&
        !lines.some((line) => Number(line.draftDiscount ?? 0) > 0.01)));

  function requestClose() {
    if (saving) return;
    if (!dirty) {
      onClose?.();
      return;
    }
    setLeavePromptOpen(true);
  }

  async function handleSave() {
    if (!sale?.id || saving) return false;
    const bodyOrError = buildLineQuantitiesSaveBody({
      lines,
      removedIds,
      customerNum,
      baselineCustomerNum,
      uomById,
      retailByCode,
      discountEditEnabled,
    });
    if (bodyOrError.error) {
      setError(bodyOrError.error);
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest(`/sales/orders/${sale.id}/line-quantities`, {
        method: "PATCH",
        body: bodyOrError,
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

  const selectedLine = lines.find((line) => lineKey(line) === selectedLineKey) ?? null;
  const selectedCount = selectedLineIds.size > 0
    ? selectedLineIds.size
    : selectedLineKey
      ? 1
      : 0;
  const allLinesSelected =
    cartLines.length > 0 && cartLines.every((line) => selectedLineIds.has(String(line.id)));
  const someLinesSelected =
    !allLinesSelected && cartLines.some((line) => selectedLineIds.has(String(line.id)));
  const productSearch = (
    <PosProductSearch
      variant="classic"
      inputRef={searchInputRef}
      query={searchQuery}
      onQueryChange={(value) => {
        if (entryProduct) {
          setEntryProduct(null);
          setEntryQty("");
        }
        setSearchQuery(value);
      }}
      results={searchResults}
      searching={searching}
      selectedCode={entryProduct?.product_code ?? swapDraft?.product?.product_code ?? null}
      sellWholesale={!sellAtRetail}
      retailByCode={retailByCode}
      routeMarkupPerUnit={routeMarkupPerUnit}
      onSelect={(product) => void handleProductPicked(product)}
      onEscapeKey={replacingLineKey || swapDraft ? cancelReplaceCartLine : null}
      barcodeEnabled={false}
      posSalesConfig={posSalesConfig}
      disabled={saving || loading}
      placeholder={replacingLineKey ? "Scan / search replacement…" : "Scan / search product…"}
    />
  );

  if (!open || !sale?.id) return null;

  return renderPosModalPortal(
    <div className={posModalOverlayClass(false, "z-50")} role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={requestClose} aria-hidden />
      <div
        className={posModalPanelClass(
          false,
          "pos-workspace-classic relative flex h-[min(94vh,920px)] max-h-[94vh] w-[min(98vw,1320px)] flex-col overflow-hidden rounded-md border shadow-2xl",
        )}
        data-pos-layout="classic"
        data-classic-pos-theme={classicThemeTemplate}
        style={themeStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="classic-backoffice-order-edit-title"
      >
        <div className="classic-pos-cart-caption flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
          <div className="min-w-0">
            <h2
              id="classic-backoffice-order-edit-title"
              className="text-sm font-semibold"
              style={{ color: "var(--classic-text, #1a1a1a)" }}
            >
              Edit order {formatOrderNumber(sale)}
            </h2>
            <p className="text-xs" style={{ color: "var(--classic-muted, #5c5340)" }}>
              {routeMarkupLabel
                ? `${routeMarkupLabel}. Click scan code to swap · F12 retail/wholesale.`
                : "Click scan code to swap · F12 retail/wholesale · same markups as POS."}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            className="theme-secondary-btn shrink-0 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        {saving ? (
          <div
            className="absolute inset-0 z-[55] flex items-center justify-center bg-white/55"
            role="status"
            aria-live="polite"
          >
            <div className="rounded border bg-white px-3 py-2 text-sm shadow-sm">
              {isEditableResubmit ? "Saving…" : "Saving changes…"}
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2">
          <div
            className="shrink-0 rounded border px-3 py-2"
            style={{
              background: "var(--classic-panel, #f7f1e4)",
              borderColor: "var(--classic-border, #8a7a55)",
            }}
          >
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--classic-muted)" }}>
              Customer — current: {currentCustomerLabel}
            </p>
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
              <p className="mt-1 text-xs font-medium text-amber-800">Customer will update on save.</p>
            ) : null}
          </div>

          {canApplyAdvisedDiscounts ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-sm text-amber-900">Manager advised per-item discounts on this order.</p>
              <button
                type="button"
                disabled={saving || loading}
                onClick={() => setLines((prev) => applyAdvisedDiscountsToDraftLines(prev, advisedDiscountLines))}
                className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 disabled:opacity-50"
              >
                Apply advised discounts
              </button>
            </div>
          ) : null}

          <div className="classic-backoffice-edit-cart flex min-h-0 flex-1 flex-col overflow-hidden">
            {loading ? (
              <p
                className="flex flex-1 items-center justify-center text-center text-sm"
                style={{ color: "var(--classic-muted)" }}
              >
                Loading order lines…
              </p>
            ) : (
              <ClassicPosCartTable
              lines={cartLines}
              selectedLineId={selectedLineKey}
              onSelectLine={handleSelectLine}
              selectionEnabled
              selectedLineIds={selectedLineIds}
              allLinesSelected={allLinesSelected}
              someLinesSelected={someLinesSelected}
              onToggleAllLines={toggleAllLines}
              onToggleLineSelect={toggleLineSelect}
              orderCaption={formatOrderNumber(sale)}
              showOrderNav={false}
              showRetailModeHint={retailPricingEnabled}
              sellAtRetail={sellAtRetail}
              onToggleRetailMode={() => {
                setSellAtRetail((prev) => {
                  const next = !prev;
                  setStatusMessage(next ? "Mode: RETAIL" : "Mode: WHOLESALE");
                  return next;
                });
              }}
              replacingLineId={replacingLineKey}
              swapDraftLineId={swapDraft?.lineKey ?? null}
              swapDraftQty={swapDraft?.quantity ?? ""}
              swapLinePreview={swapLinePreview}
              swapLineQtyRef={swapLineQtyRef}
              onScanCodeClick={(id) => beginReplaceCartLine(id)}
              busy={saving}
              showLineDiscount={discountEditEnabled}
              formatMoney={(value) => formatSaleKes(value)}
              linePackage={(line) => line.package_label}
              lineUnitPrice={(line) => {
                const draft = lines.find((row) => lineKey(row) === String(line.id));
                if (!draft) return "—";
                const priced = priceDraftLine(draft, uomById, retailByCode, routeMarkupPerUnit, {
                  discountEditEnabled,
                  cashRound: enablePosCashRounding,
                });
                return formatSaleKes(priced.unitPrice);
              }}
              lineDiscount={(line) => {
                const draft = lines.find((row) => lineKey(row) === String(line.id));
                return draft ? String(draft.draftDiscount ?? 0) : "0";
              }}
              lineAmount={(line) => {
                const draft = lines.find((row) => lineKey(row) === String(line.id));
                if (!draft) return "—";
                const priced = priceDraftLine(draft, uomById, retailByCode, routeMarkupPerUnit, {
                  discountEditEnabled,
                  cashRound: enablePosCashRounding,
                });
                return formatSaleKes(priced.amount);
              }}
              lineEntryQty={(line) => {
                const draft = lines.find((row) => lineKey(row) === String(line.id));
                return draft ? String(draft.draftQty ?? "") : "";
              }}
              onSetQty={handleSetLineQty}
              onSwapDraftQtyChange={(_line, value) => {
                setSwapDraft((prev) => (prev ? { ...prev, quantity: value } : prev));
              }}
              scanSearch={productSearch}
              qtyRef={entryQtyRef}
              entryDescription={
                entryReady
                  ? entryProduct?.product_name ?? entryProduct?.product_code ?? ""
                  : ""
              }
              entryPackage={
                entryReady ? uomCompactPackageLabel(entryProduct?.uom) || "—" : ""
              }
              entryQty={entryQty}
              entryUnitPrice={entryComputed ? entryComputed.displayUnitPrice : ""}
              entryAmount={entryComputed ? entryComputed.lineAmount : ""}
              entryReady={entryReady}
              onEntryQtyChange={setEntryQty}
              onEntryQtyCommit={() => {
                commitEntryLine();
              }}
              onEntryQtyKeyDown={(e) => {
                if (isPosFunctionKeyEvent(e)) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEntryLine();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEntryProduct(null);
                  setEntryQty("");
                  setSearchQuery("");
                  setSearchResults([]);
                  requestAnimationFrame(() => {
                    searchInputRef.current?.focus?.();
                    searchInputRef.current?.select?.();
                  });
                }
              }}
            />
            )}
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center gap-2 border-t px-0 py-[0.49rem] text-xs"
            style={{ color: "var(--classic-muted)", borderColor: "var(--classic-border, #8a7a55)" }}
          >
            <button
              type="button"
              disabled={saving || loading || selectedCount === 0 || lines.length <= 1}
              onClick={removeSelectedLine}
              className="rounded border border-red-700 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
            >
              {selectedCount > 1 ? `Delete (${selectedCount})` : "Delete"}
            </button>
            {discountEditEnabled && selectedLine ? (
              <label className="inline-flex items-center gap-1.5">
                Disc / unit
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="w-24 rounded border px-1.5 py-0.5 text-right"
                  style={{ borderColor: "var(--classic-border)" }}
                  value={selectedLine.draftDiscount ?? 0}
                  disabled={saving || loading}
                  onChange={(e) => updateSelectedDiscount(e.target.value)}
                />
              </label>
            ) : null}
            {statusMessage ? <span>{statusMessage}</span> : null}
          </div>
        </div>

        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t px-3 py-[0.735rem]"
          style={{
            background: "var(--classic-footer, #fafafa)",
            borderColor: "var(--classic-border, #8a7a55)",
          }}
        >
          <div className="text-sm" style={{ color: "var(--classic-text)" }}>
            Order total:{" "}
            <span className="font-semibold classic-pos-accent">{formatSaleKes(totals)}</span>
            {dirty ? (
              <span className="ml-2 text-xs font-medium text-amber-800">Unsaved changes</span>
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

        {leavePromptOpen ? (
          <div
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="classic-edit-order-leave-title"
          >
            <div
              className="w-full max-w-md rounded border p-5 shadow-2xl"
              style={{ background: "var(--classic-panel, #f7f1e4)" }}
            >
              <h3 id="classic-edit-order-leave-title" className="text-base font-semibold">
                Save changes?
              </h3>
              <p className="mt-2 text-sm" style={{ color: "var(--classic-muted)" }}>
                You have unsaved order changes. Save them before closing, or discard to leave
                without saving.
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setLeavePromptOpen(false)}
                  className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
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
                  className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="theme-primary-btn rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
  );
}
