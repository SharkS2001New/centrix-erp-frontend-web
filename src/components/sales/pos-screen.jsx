"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { parseDecimalInput } from "@/components/catalog/catalog-shared";
import { enrichProductForLpo } from "@/components/lpo/lpo-product-utils";
import { formatMixedStockDisplay, formatPosCartQty } from "@/lib/stock-uom";
import { uomWholesaleConversionExample } from "@/lib/uom-packaging";
import {
  cartLineDisplayUnitPrice,
  computePosLine,
  defaultPosEntryQty,
  isPosRetailSession,
  posCartLineTypeLabel,
  posEntryQtyFromCartLine,
  posEntryQtyFromBaseQty,
  posQuantityFieldMeta,
  posStockDeductionHint,
  posUnitPriceFieldLabel,
  usesPosRetailPricing,
} from "@/lib/pos-line";
import {
  computeProductLineDiscount,
  formatProductDiscountLabel,
  productHasConfiguredDiscount,
} from "@/lib/product-discount";
import { cartTotals, formatSaleKes } from "@/lib/sales";
import {
  getPosSalesConfig,
  posChannelFromStockSource,
  resolveSaveOrderStatus,
} from "@/lib/sales-settings";
import {
  cartLineRetailStockFlag,
  posCartHasInsufficientStock,
  posLineRetailStockFlag,
  posLineStockLocation,
  posStockAvailability,
  posStockDisplayMode,
  posStockInsufficientMessage,
  posStockLocationLabel,
} from "@/lib/pos-stock";
import { findMergeableCartLine } from "@/lib/pos-cart-merge";
import { PosPaymentPanel } from "./pos-payment-panel";
import { PosProductSearch } from "./pos-product-search";
import { PosSaveOrderDialog } from "./pos-save-order-dialog";

const fieldInput =
  "w-full rounded border border-[#b8a88a] bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:border-[#185FA5]";

function PosLabel({ children }) {
  return (
    <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-[#4a5d23]">
      {children}
    </span>
  );
}

const EMPTY_LINE = {
  product_code: "",
  description: "",
  package: "",
  quantity: "1",
  discount: "0",
  unit_price: "",
};

export function PosScreen() {
  const { user, capabilities, refreshCapabilities } = useAuth();
  const posSalesConfig = useMemo(
    () =>
      getPosSalesConfig(capabilities?.module_settings, {
        allowNegativeStock: capabilities?.allow_negative_stock,
      }),
    [capabilities?.module_settings, capabilities?.allow_negative_stock],
  );
  const allowDiscounts = posSalesConfig.allowDiscounts;
  const allowEditUnitPrice = posSalesConfig.allowEditUnitPrice;
  const enableBarcodeScanner = posSalesConfig.enableBarcodeScanner;
  const allowNegativeStock = posSalesConfig.allowNegativeStock;
  const addRouteMarkupPrices = posSalesConfig.addRouteMarkupPrices;
  const posOrderTypeMode = posSalesConfig.posOrderTypeMode;
  const canChooseOrderType = addRouteMarkupPrices && posOrderTypeMode === "toggle";
  const lockedToRouteOrder = addRouteMarkupPrices && posOrderTypeMode === "route";
  const showRouteOrderUi = addRouteMarkupPrices && posOrderTypeMode !== "normal";
  const qtyInputRef = useRef(null);
  const unitPriceRef = useRef(null);
  const searchInputRef = useRef(null);
  const focusSearchAfterAdd = useRef(false);
  const appliedRouteMarkupRef = useRef(0);
  const [sellFromShop, setSellFromShop] = useState(true);
  const [sellWholesale, setSellWholesale] = useState(true);
  const [isRouteOrder, setIsRouteOrder] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routes, setRoutes] = useState([]);

  const channel = posChannelFromStockSource(sellFromShop, posSalesConfig);

  useEffect(() => {
    if (posSalesConfig.perLineStockRouting) return;
    setSellFromShop(posSalesConfig.defaultSellFromShop);
  }, [
    posSalesConfig.defaultSellFromShop,
    posSalesConfig.allowShop,
    posSalesConfig.allowStore,
    posSalesConfig.perLineStockRouting,
  ]);

  useEffect(() => {
    if (!posSalesConfig.enableRetailPricing) setSellWholesale(true);
  }, [posSalesConfig.enableRetailPricing]);

  useEffect(() => {
    if (!addRouteMarkupPrices) {
      setIsRouteOrder(false);
      setSelectedRouteId("");
      return;
    }
    if (posOrderTypeMode === "normal") {
      setIsRouteOrder(false);
      setSelectedRouteId("");
    } else if (posOrderTypeMode === "route") {
      setIsRouteOrder(true);
    }
  }, [addRouteMarkupPrices, posOrderTypeMode]);

  useEffect(() => {
    if (!showRouteOrderUi) {
      return;
    }
    let cancelled = false;
    apiRequest("/routes", { searchParams: { per_page: 200 } })
      .then((res) => {
        if (!cancelled) setRoutes(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setRoutes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showRouteOrderUi]);

  const usesRouteMarkup =
    showRouteOrderUi && isRouteOrder && Boolean(selectedRouteId);

  const routeMarkupPerUnit = useMemo(() => {
    if (!usesRouteMarkup) return 0;
    const route = routes.find((r) => String(r.id) === String(selectedRouteId));
    return Number(route?.route_markup_price ?? 0);
  }, [usesRouteMarkup, selectedRouteId, routes]);

  const [uomById, setUomById] = useState(new Map());
  const [vatById, setVatById] = useState(new Map());
  const [retailByCode, setRetailByCode] = useState({});
  const [productByCode, setProductByCode] = useState({});

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedProductCode, setSelectedProductCode] = useState(null);
  const searchSeq = useRef(0);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [lineForm, setLineForm] = useState(EMPTY_LINE);
  const [unitPriceTouched, setUnitPriceTouched] = useState(false);
  const [cart, setCart] = useState(null);
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [editingLineId, setEditingLineId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saveOrderOpen, setSaveOrderOpen] = useState(false);
  const [saveOrderError, setSaveOrderError] = useState(null);
  const [paymentError, setPaymentError] = useState(null);
  const [completedSale, setCompletedSale] = useState(null);

  useEffect(() => {
    if (!posSalesConfig.enableRetailPricing) return undefined;
    function onKeyDown(e) {
      if (e.key !== "F12") return;
      if (paymentOpen || saveOrderOpen) return;
      e.preventDefault();
      setSellWholesale((prev) => !prev);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [posSalesConfig.enableRetailPricing, paymentOpen, saveOrderOpen]);

  const totals = useMemo(() => cartTotals(cart?.lines), [cart?.lines]);

  useEffect(() => {
    if (busy || !focusSearchAfterAdd.current) return;
    focusSearchAfterAdd.current = false;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy]);

  const loadPosReferenceData = useCallback(async () => {
    const [uomRes, vatRes, retailRes] = await Promise.all([
      apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      apiRequest("/vats", { searchParams: { per_page: 50 } }).catch(() => ({ data: [] })),
      apiRequest("/retail-package-settings", { searchParams: { per_page: 500 } }).catch(() => ({
        data: [],
      })),
    ]);
    const uomMap = new Map();
    for (const u of uomRes.data ?? []) uomMap.set(u.id, u);
    const vatMap = new Map();
    for (const v of vatRes.data ?? []) vatMap.set(v.id, v);
    const retailMap = {};
    for (const row of retailRes.data ?? []) {
      if (row.product_code) retailMap[row.product_code] = row;
    }
    setUomById(uomMap);
    setVatById(vatMap);
    setRetailByCode(retailMap);
    return { uomMap, vatMap, retailMap };
  }, []);

  useEffect(() => {
    loadPosReferenceData().catch(() => {});
  }, [loadPosReferenceData]);

  useEffect(() => {
    if (!cart?.lines?.length || uomById.size === 0) return;
    const missing = [
      ...new Set(
        cart.lines.map((l) => l.product_code).filter((code) => code && !productByCode[code]),
      ),
    ];
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(
      missing.map((code) => apiRequest(`/products/${encodeURIComponent(code)}`).catch(() => null)),
    ).then((rows) => {
      if (cancelled) return;
      setProductByCode((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (row?.product_code) {
            next[row.product_code] = enrichProductForLpo(row, uomById, vatById);
          }
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [cart?.lines, uomById, vatById, productByCode]);

  const loadCashierCart = useCallback(async () => {
    if (!user?.branch_id) return null;
    const body = { channel, branch_id: user.branch_id };
    if (usesRouteMarkup) {
      body.route_id = Number(selectedRouteId);
    }
    const created = await apiRequest("/sales/carts", {
      method: "POST",
      body,
    });
    const full = Array.isArray(created?.lines)
      ? created
      : await apiRequest(`/sales/carts/${created.id}`);
    setCart(full);
    if (showRouteOrderUi && full?.route_id) {
      const route = routes.find((r) => r.id === full.route_id);
      appliedRouteMarkupRef.current = Number(route?.route_markup_price ?? 0);
    } else {
      appliedRouteMarkupRef.current = 0;
    }
    return full;
  }, [
    channel,
    user?.branch_id,
    showRouteOrderUi,
    usesRouteMarkup,
    selectedRouteId,
    routes,
  ]);

  const ensureCart = useCallback(async () => {
    if (cart?.id && cart.channel === channel && Array.isArray(cart.lines)) {
      return cart;
    }
    return loadCashierCart();
  }, [cart, channel, loadCashierCart]);

  useEffect(() => {
    if (!user?.branch_id) return;
    let cancelled = false;
    setCart(null);
    loadCashierCart().catch(() => {
      if (!cancelled) setCart(null);
    });
    return () => {
      cancelled = true;
    };
  }, [channel, user?.branch_id, loadCashierCart]);

  useEffect(() => {
    if (!cart?.route_id || !showRouteOrderUi || !routes.length) return;
    setIsRouteOrder(true);
    setSelectedRouteId(String(cart.route_id));
    const route = routes.find((r) => r.id === cart.route_id);
    appliedRouteMarkupRef.current = Number(route?.route_markup_price ?? 0);
  }, [cart?.id, cart?.route_id, showRouteOrderUi, routes]);

  const refreshCart = useCallback(async (cartId) => {
    const updated = await apiRequest(`/sales/carts/${cartId}`);
    setCart(updated);
    return updated;
  }, []);

  const searchProducts = useCallback(
    async (q, maps = null) => {
      const uomMap = maps?.uomMap ?? uomById;
      const vatMap = maps?.vatMap ?? vatById;
      const trimmed = q.trim();
      const seq = ++searchSeq.current;
      if (!trimmed) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const res = await apiRequest("/products", {
          searchParams: { per_page: 80, q: trimmed },
        });
        if (seq !== searchSeq.current) return;
        const list = (res.data ?? []).map((p) => enrichProductForLpo(p, uomMap, vatMap));
        setSearchResults(list.slice(0, 40));
        setProductByCode((prev) => {
          const next = { ...prev };
          for (const p of list) next[p.product_code] = p;
          return next;
        });
      } catch {
        if (seq !== searchSeq.current) return;
        setSearchResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    },
    [uomById, vatById],
  );

  useEffect(() => {
    const t = setTimeout(() => searchProducts(searchQuery), 280);
    return () => clearTimeout(t);
  }, [searchQuery, searchProducts]);

  function applyComputedPrice(product, entryQty, discount, overridePrice = null) {
    const retailPackage = retailByCode[product.product_code] ?? null;
    const autoProductDiscount =
      allowDiscounts && productHasConfiguredDiscount(product);
    let discountAmount = 0;

    if (allowDiscounts) {
      if (autoProductDiscount) {
        const preDiscount = computePosLine({
          product,
          entryQty,
          sellWholesale,
          retailPackage,
          discount: 0,
          unitPriceOverride: overridePrice,
          routeMarkupPerUnit,
        });
        discountAmount = computeProductLineDiscount(
          product,
          preDiscount.lineAmountBeforeDiscount,
          preDiscount.packQty,
        );
      } else {
        discountAmount = parseDecimalInput(discount);
      }
    }

    const computed = computePosLine({
      product,
      entryQty,
      sellWholesale,
      retailPackage,
      discount: discountAmount,
      unitPriceOverride: overridePrice,
      routeMarkupPerUnit,
    });

    return {
      ...computed,
      autoProductDiscount,
      discountAmount,
    };
  }

  const stockDisplayMode = useMemo(
    () => posStockDisplayMode(posSalesConfig, sellWholesale),
    [posSalesConfig, sellWholesale],
  );

  async function resolveProductByCode(code) {
    const trimmed = String(code ?? "").trim();
    if (!trimmed) return null;
    if (productByCode[trimmed]) return productByCode[trimmed];
    const fromResults = searchResults.find(
      (p) => p.product_code.toLowerCase() === trimmed.toLowerCase(),
    );
    if (fromResults) return fromResults;
    try {
      const row = await apiRequest(`/products/${encodeURIComponent(trimmed)}`);
      const enriched = enrichProductForLpo(row, uomById, vatById);
      setProductByCode((prev) => ({ ...prev, [enriched.product_code]: enriched }));
      return enriched;
    } catch {
      return null;
    }
  }

  function assertRouteReadyForAdd() {
    if (showRouteOrderUi && isRouteOrder && !selectedRouteId) {
      setStatusMessage(
        lockedToRouteOrder
          ? "Select a route to apply markup — this POS requires a route on every sale."
          : "Select a route to apply markup.",
      );
      return false;
    }
    return true;
  }

  async function commitCartLine({
    product,
    computed,
    incrementBaseQty,
    mergeTarget = null,
    editingId = null,
    discount = 0,
    override = null,
    successMessage,
    clearEntry = true,
  }) {
    const retailPackage = retailByCode[product.product_code] ?? null;
    let finalComputed = computed;
    let targetLineId = editingId ?? mergeTarget?.id ?? null;

    if (mergeTarget && !editingId) {
      const newBaseQty = Number(mergeTarget.quantity) + incrementBaseQty;
      const mergedEntryQty = posEntryQtyFromBaseQty(
        newBaseQty,
        product,
        retailPackage,
        cartLineRetailStockFlag(mergeTarget),
      );
      finalComputed = applyComputedPrice(product, mergedEntryQty, discount, override);
    }

    const lineRetailStockFlag = posLineRetailStockFlag(
      posSalesConfig,
      sellWholesale,
      computed.isRetail,
    );

    const stockBaseQty =
      mergeTarget && !editingId
        ? Number(mergeTarget.quantity) + incrementBaseQty
        : computed.baseQty;

    const stockCheck = posStockAvailability({
      product,
      baseQty: stockBaseQty,
      cartLines: cart?.lines,
      sellFromShop,
      posSalesConfig,
      allowNegativeStock,
      lineRetailStockFlag,
      productByCode,
      excludeLineId: editingId ?? mergeTarget?.id,
    });
    if (!stockCheck.ok) {
      setStatusMessage(
        posStockInsufficientMessage(stockCheck, {
          product,
          sellWholesale,
          retailPackage,
          posSalesConfig,
        }),
      );
      return false;
    }

    const activeCart = await ensureCart();
    const lineBody = {
      product_code: product.product_code,
      quantity: finalComputed.baseQty,
      unit_price: finalComputed.unitPricePerBase,
      uom: finalComputed.uomLabel || product.package_name,
      on_wholesale_retail: lineRetailStockFlag ? 1 : 0,
      discount_given: allowDiscounts ? finalComputed.discountApplied : 0,
    };

    if (targetLineId) {
      await apiRequest(`/sales/carts/${activeCart.id}/lines/${targetLineId}`, {
        method: "PATCH",
        body: {
          ...lineBody,
          update_no: activeCart.update_no,
        },
      });
    } else {
      await apiRequest(`/sales/carts/${activeCart.id}/lines`, {
        method: "POST",
        body: lineBody,
      });
    }

    await refreshCart(activeCart.id);

    if (clearEntry) {
      setLineForm(EMPTY_LINE);
      setSelectedProductCode(null);
      setSelectedProduct(null);
      setSearchQuery("");
      setSearchResults([]);
      setUnitPriceTouched(false);
      setEditingLineId(null);
      setSelectedLineId(null);
      focusSearchAfterAdd.current = true;
    }

    if (successMessage) setStatusMessage(successMessage);
    return true;
  }

  async function quickAddOrIncrementProduct(product) {
    if (busy || !product) return;
    if (!assertRouteReadyForAdd()) return;

    const computed = applyComputedPrice(product, "1", 0);
    if (computed.baseQty <= 0) return;

    const mergeTarget = findMergeableCartLine(
      cart?.lines,
      product.product_code,
      computed,
      posSalesConfig,
      sellWholesale,
    );

    setBusy(true);
    setStatusMessage(null);
    try {
      await commitCartLine({
        product,
        computed,
        incrementBaseQty: computed.baseQty,
        mergeTarget,
        successMessage: mergeTarget ? "Quantity increased." : "Line added.",
      });
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to add line");
    } finally {
      setBusy(false);
    }
  }

  async function handleBarcodeEnter(code) {
    if (!enableBarcodeScanner) return false;
    const product = await resolveProductByCode(code);
    if (!product) {
      setStatusMessage("Barcode not found — search by name or code.");
      return false;
    }
    await quickAddOrIncrementProduct(product);
    return true;
  }

  function pickProduct(product) {
    if (!product) return;
    setSelectedProductCode(product.product_code);
    setSelectedProduct(product);
    setUnitPriceTouched(false);
    const retailPackage = retailByCode[product.product_code] ?? null;
    const quantity = defaultPosEntryQty(product, sellWholesale, retailPackage);
    const computed = applyComputedPrice(product, quantity, 0);
    setLineForm({
      product_code: product.product_code,
      description: product.product_name ?? "",
      package: computed.packagingLabel,
      quantity,
      discount: String(computed.discountAmount ?? 0),
      unit_price: String(computed.displayUnitPrice),
    });
  }

  useEffect(() => {
    setUnitPriceTouched(false);
  }, [sellWholesale, routeMarkupPerUnit]);

  useEffect(() => {
    if (!selectedProduct?.product_code) return;
    const frame = window.requestAnimationFrame(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedProduct?.product_code]);

  useEffect(() => {
    if (!selectedProduct) return;
    const retailPackage = retailByCode[selectedProduct.product_code] ?? null;
    const autoRetailPrice = usesPosRetailPricing(
      sellWholesale,
      selectedProduct,
      retailPackage,
    );
    if (unitPriceTouched && !autoRetailPrice) return;
    const computed = applyComputedPrice(
      selectedProduct,
      lineForm.quantity,
      lineForm.discount,
    );
    setLineForm((prev) => {
      const nextPrice = String(computed.displayUnitPrice);
      const nextDiscount = allowDiscounts
        ? computed.autoProductDiscount
          ? String(computed.discountAmount ?? 0)
          : prev.discount
        : "0";
      if (
        prev.unit_price === nextPrice &&
        prev.package === computed.packagingLabel &&
        prev.discount === nextDiscount
      ) {
        return prev;
      }
      return {
        ...prev,
        package: computed.packagingLabel,
        unit_price: nextPrice,
        discount: nextDiscount,
      };
    });
  }, [
    selectedProduct,
    lineForm.quantity,
    sellWholesale,
    retailByCode,
    unitPriceTouched,
    allowDiscounts,
    routeMarkupPerUnit,
  ]);

  const retailPricingSession = isPosRetailSession(sellWholesale);

  const unitPriceLabel = useMemo(() => {
    if (!selectedProduct) return "Unit price";
    const retailPackage = retailByCode[selectedProduct.product_code] ?? null;
    return posUnitPriceFieldLabel(
      selectedProduct,
      sellWholesale,
      retailPackage,
      lineForm.quantity,
      routeMarkupPerUnit,
    );
  }, [selectedProduct, sellWholesale, retailByCode, lineForm.quantity, routeMarkupPerUnit]);

  const qtyFieldMeta = useMemo(() => {
    if (!selectedProduct) {
      return isPosRetailSession(sellWholesale)
        ? posQuantityFieldMeta(null, sellWholesale, null, lineForm.quantity)
        : null;
    }
    const retailPackage = retailByCode[selectedProduct.product_code] ?? null;
    return posQuantityFieldMeta(
      selectedProduct,
      sellWholesale,
      retailPackage,
      lineForm.quantity,
    );
  }, [selectedProduct, sellWholesale, retailByCode, lineForm.quantity]);

  const stockDeductionHint = useMemo(() => {
    if (!selectedProduct) return null;
    const retailPackage = retailByCode[selectedProduct.product_code] ?? null;
    const computed = computePosLine({
      product: selectedProduct,
      entryQty: lineForm.quantity || "1",
      sellWholesale,
      retailPackage,
      discount: 0,
      routeMarkupPerUnit,
    });
    const lineRetailStockFlag = posLineRetailStockFlag(
      posSalesConfig,
      sellWholesale,
      computed.isRetail,
    );
    const loc = posStockLocationLabel(
      posLineStockLocation(sellFromShop, posSalesConfig, lineRetailStockFlag),
      posSalesConfig,
    );
    const hint = posStockDeductionHint(
      lineForm.quantity,
      selectedProduct,
      sellWholesale,
      retailPackage,
    );
    return hint ? `${hint} (${loc})` : null;
  }, [
    selectedProduct,
    lineForm.quantity,
    sellWholesale,
    retailByCode,
    posSalesConfig,
    sellFromShop,
    routeMarkupPerUnit,
  ]);

  const lineStockCheck = useMemo(() => {
    if (!selectedProduct || allowNegativeStock) {
      return { ok: true };
    }
    const retailPackage = retailByCode[selectedProduct.product_code] ?? null;
    const computed = computePosLine({
      product: selectedProduct,
      entryQty: lineForm.quantity,
      sellWholesale,
      retailPackage,
      discount: 0,
      routeMarkupPerUnit,
    });
    return posStockAvailability({
      product: selectedProduct,
      baseQty: computed.baseQty,
      cartLines: cart?.lines,
      sellFromShop,
      posSalesConfig,
      allowNegativeStock,
      lineRetailStockFlag: posLineRetailStockFlag(
        posSalesConfig,
        sellWholesale,
        computed.isRetail,
      ),
      productByCode,
      excludeLineId: editingLineId,
    });
  }, [
    selectedProduct,
    lineForm.quantity,
    sellWholesale,
    retailByCode,
    cart?.lines,
    sellFromShop,
    posSalesConfig,
    allowNegativeStock,
    routeMarkupPerUnit,
    editingLineId,
    productByCode,
  ]);

  const lineStockMessage = useMemo(() => {
    if (!selectedProduct) return null;
    const retailPackage = retailByCode[selectedProduct.product_code] ?? null;
    return posStockInsufficientMessage(lineStockCheck, {
      product: selectedProduct,
      sellWholesale,
      retailPackage,
      posSalesConfig,
    });
  }, [lineStockCheck, selectedProduct, sellWholesale, retailByCode, posSalesConfig]);

  const cartStockBlocked = useMemo(
    () =>
      !allowNegativeStock &&
      posCartHasInsufficientStock(
        cart?.lines,
        productByCode,
        sellFromShop,
        posSalesConfig,
        allowNegativeStock,
      ),
    [cart?.lines, productByCode, sellFromShop, posSalesConfig, allowNegativeStock],
  );

  const addLineBlocked =
    !selectedProduct ||
    (lineStockCheck.ok === false && !allowNegativeStock);

  async function syncCartRoute(routeId) {
    if (!cart?.id) return null;
    const updated = await apiRequest(`/sales/carts/${cart.id}`, {
      method: "PATCH",
      body: { route_id: routeId ?? null },
    });
    setCart(updated);
    return updated;
  }

  async function repriceCartForRouteMarkup(nextMarkup) {
    if (!cart?.id) {
      appliedRouteMarkupRef.current = nextMarkup;
      return;
    }
    const delta = nextMarkup - appliedRouteMarkupRef.current;
    if (!cart.lines?.length || Math.abs(delta) < 0.0001) {
      appliedRouteMarkupRef.current = nextMarkup;
      return;
    }
    const repriced = cart.lines.map((row) => ({
      ...row,
      unit_price: Math.max(0, Number(row.unit_price) + delta),
    }));
    await rebuildCart(repriced);
    appliedRouteMarkupRef.current = nextMarkup;
  }

  async function handleOrderTypeChange(routeOrder) {
    if (routeOrder === isRouteOrder) return;
    if (cart?.lines?.length) {
      const ok = window.confirm(
        "Changing order type will reprice cart lines. Continue?",
      );
      if (!ok) return;
    }
    setIsRouteOrder(routeOrder);
    if (!routeOrder) {
      setSelectedRouteId("");
    }
    const routeId =
      routeOrder && selectedRouteId ? Number(selectedRouteId) : null;
    const nextMarkup =
      routeOrder && selectedRouteId
        ? Number(
            routes.find((r) => String(r.id) === String(selectedRouteId))
              ?.route_markup_price ?? 0,
          )
        : 0;
    if (cart?.id) {
      setBusy(true);
      try {
        await syncCartRoute(routeId);
        await repriceCartForRouteMarkup(nextMarkup);
      } catch (e) {
        setStatusMessage(e instanceof ApiError ? e.message : "Failed to update order type");
      } finally {
        setBusy(false);
      }
    } else {
      appliedRouteMarkupRef.current = nextMarkup;
    }
  }

  async function handleRouteChange(routeId) {
    if (String(selectedRouteId) === String(routeId)) return;
    if (cart?.lines?.length) {
      const ok = window.confirm("Changing route will reprice cart lines. Continue?");
      if (!ok) return;
    }
    setSelectedRouteId(routeId);
    const nextMarkup = routeId
      ? Number(routes.find((r) => String(r.id) === String(routeId))?.route_markup_price ?? 0)
      : 0;
    if (cart?.id && isRouteOrder) {
      setBusy(true);
      try {
        await syncCartRoute(routeId ? Number(routeId) : null);
        await repriceCartForRouteMarkup(nextMarkup);
      } catch (e) {
        setStatusMessage(e instanceof ApiError ? e.message : "Failed to update route");
      } finally {
        setBusy(false);
      }
    } else {
      appliedRouteMarkupRef.current = nextMarkup;
    }
  }

  async function handleAddLine() {
    if (!lineForm.product_code || !selectedProduct) {
      setStatusMessage("Select a product first.");
      return;
    }
    if (!assertRouteReadyForAdd()) return;

    const discount = parseDecimalInput(lineForm.discount);
    const override = unitPriceTouched ? parseDecimalInput(lineForm.unit_price) : null;
    const computed = applyComputedPrice(
      selectedProduct,
      lineForm.quantity,
      discount,
      override,
    );
    if (computed.baseQty <= 0) {
      setStatusMessage("Enter a valid quantity.");
      return;
    }

    const mergeTarget = editingLineId
      ? null
      : findMergeableCartLine(
          cart?.lines,
          lineForm.product_code,
          computed,
          posSalesConfig,
          sellWholesale,
        );

    setBusy(true);
    setStatusMessage(null);
    const wasEditing = editingLineId;
    try {
      const ok = await commitCartLine({
        product: selectedProduct,
        computed,
        incrementBaseQty: computed.baseQty,
        mergeTarget,
        editingId: editingLineId,
        discount,
        override,
        successMessage: wasEditing
          ? "Line updated."
          : mergeTarget
            ? "Quantity increased."
            : "Line added.",
      });
      if (!ok) return;
    } catch (e) {
      setStatusMessage(
        e instanceof ApiError
          ? e.message
          : wasEditing
            ? "Failed to update line"
            : "Failed to add line",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleQuantityEnter() {
    if (!selectedProduct || busy || addLineBlocked) return;
    if (allowEditUnitPrice) {
      unitPriceRef.current?.focus();
      unitPriceRef.current?.select();
      return;
    }
    void handleAddLine();
  }

  function handleUnitPriceEnter(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!busy && !addLineBlocked) void handleAddLine();
  }

  async function rebuildCart(remainingLines) {
    if (!cart?.id) return;
    await apiRequest(`/sales/carts/${cart.id}/lines`, { method: "DELETE" });
    for (const row of remainingLines) {
      await apiRequest(`/sales/carts/${cart.id}/lines`, {
        method: "POST",
        body: {
          product_code: row.product_code,
          quantity: row.quantity,
          unit_price: row.unit_price,
          uom: row.uom,
          on_wholesale_retail: row.on_wholesale_retail,
          discount_given: Number(row.discount_given ?? 0),
        },
      });
    }
    await refreshCart(cart.id);
  }

  async function removeSelectedLine() {
    if (!cart?.id || !cart?.lines?.length || !selectedLineId) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const updated = await apiRequest(`/sales/carts/${cart.id}/lines/${selectedLineId}`, {
        method: "DELETE",
      });
      setCart(updated);
      if (editingLineId === selectedLineId) {
        clearLineEntry();
      }
      setSelectedLineId(null);
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to remove line");
    } finally {
      setBusy(false);
    }
  }

  async function clearAllLines() {
    if (!cart?.id) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      await apiRequest(`/sales/carts/${cart.id}/lines`, { method: "DELETE" });
      await refreshCart(cart.id);
      setSelectedLineId(null);
      setStatusMessage("Cart cleared.");
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to clear cart");
    } finally {
      setBusy(false);
    }
  }

  function clearLineEntry() {
    setLineForm(EMPTY_LINE);
    setSelectedProductCode(null);
    setSelectedProduct(null);
    setSearchQuery("");
    setSearchResults([]);
    setUnitPriceTouched(false);
    setEditingLineId(null);
  }

  function handleEditSelectedLine(lineId = selectedLineId) {
    if (!lineId || !cart?.lines?.length) return;
    const line = cart.lines.find((l) => l.id === lineId);
    if (!line) return;

    const product =
      productByCode[line.product_code] ??
      searchResults.find((p) => p.product_code === line.product_code);
    if (!product) {
      setStatusMessage("Product details still loading — try again in a moment.");
      return;
    }

    const retailPackage = retailByCode[line.product_code] ?? null;
    const isRetailLine = Number(line.on_wholesale_retail) === 1;
    setSellWholesale(!isRetailLine);
    setSelectedProductCode(line.product_code);
    setSelectedProduct(product);
    setSearchQuery(product.product_name ?? line.product_code);
    setUnitPriceTouched(true);
    setEditingLineId(line.id);
    setSelectedLineId(line.id);
    setLineForm({
      product_code: line.product_code,
      description: line.product_name ?? product.product_name ?? "",
      package: line.uom ?? "",
      quantity: posEntryQtyFromCartLine(line, product, retailPackage),
      discount: String(Number(line.discount_given ?? 0)),
      unit_price: String(
        cartLineDisplayUnitPrice(line, product.uom, isRetailLine),
      ),
    });
    setStatusMessage(`Editing line #${line.line_no ?? line.id} (${posCartLineTypeLabel(line)}).`);
    window.requestAnimationFrame(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select?.();
    });
  }

  function handleCancelEdit() {
    clearLineEntry();
    setStatusMessage("Edit cancelled.");
  }

  async function reloadCartProductMeta(lines, uomMap, vatMap) {
    const codes = [...new Set((lines ?? []).map((l) => l.product_code).filter(Boolean))];
    if (!codes.length) {
      setProductByCode({});
      return;
    }
    const rows = await Promise.all(
      codes.map((code) => apiRequest(`/products/${encodeURIComponent(code)}`).catch(() => null)),
    );
    const next = {};
    for (const row of rows) {
      if (row?.product_code) {
        next[row.product_code] = enrichProductForLpo(row, uomMap, vatMap);
      }
    }
    setProductByCode(next);
  }

  async function handleRefresh() {
    setBusy(true);
    setStatusMessage(null);
    try {
      clearLineEntry();
      await refreshCapabilities();
      const { uomMap, vatMap } = await loadPosReferenceData();
      const activeCart = cart?.id ? await refreshCart(cart.id) : await loadCashierCart();
      await reloadCartProductMeta(activeCart?.lines, uomMap, vatMap);
      setStatusMessage("Refreshed — settings and products reloaded.");
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleStockSourceChange(fromShop) {
    if (sellFromShop === fromShop) return;
    if (cart?.lines?.length) {
      const ok = window.confirm("Changing stock source will clear the current cart. Continue?");
      if (!ok) return;
      await clearAllLines();
      setCart(null);
    }
    setSellFromShop(fromShop);
  }

  async function handleCheckout(body) {
    if (!cart?.id) return null;
    setBusy(true);
    setPaymentError(null);
    try {
      const sale = await apiRequest(`/sales/carts/${cart.id}/checkout`, {
        method: "POST",
        body,
      });
      setCompletedSale(sale);
      setCart(null);
      setSelectedLineId(null);
      return sale;
    } catch (e) {
      setPaymentError(e instanceof ApiError ? e.message : "Checkout failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleContinueNextOrder() {
    setPaymentOpen(false);
    setPaymentError(null);
    clearLineEntry();
    setBusy(true);
    try {
      await loadCashierCart();
      setStatusMessage(
        completedSale?.order_num
          ? `Ready for next order — previous order #${completedSale.order_num}.`
          : "Ready for next order.",
      );
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to start next order");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOrder({ walkIn, walkInName, customer }) {
    if (!cart?.id) return;
    setBusy(true);
    setSaveOrderError(null);
    setStatusMessage(null);
    try {
      const body = {
        status: resolveSaveOrderStatus(channel),
        pay_now: 0,
        is_credit_sale: false,
        deduct_stock: false,
      };
      if (walkIn) {
        body.customer_name_override = walkInName?.trim() || "Walk-in";
      } else if (customer) {
        body.customer_num = customer.customer_num;
        body.customer_name_override = customer.customer_name;
      }
      const sale = await apiRequest(`/sales/carts/${cart.id}/checkout`, {
        method: "POST",
        body,
      });
      setCompletedSale(sale);
      setCart(null);
      setSaveOrderOpen(false);
      setSelectedLineId(null);
      const who = walkIn ? walkInName?.trim() || "Walk-in" : customer?.customer_name;
      setStatusMessage(`Order saved for ${who} — #${sale.order_num} (${sale.status})`);
    } catch (e) {
      setSaveOrderError(e instanceof ApiError ? e.message : "Failed to save order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="-m-6 flex min-h-[calc(100vh-4rem)] flex-col bg-[#e8e0d4] text-slate-900 md:-m-8">
      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#8a7a5c] bg-[#d4cbb8] px-3 py-2">
        <div className="flex items-center gap-3">
          <Link href="/sales" className="text-xs text-[#185FA5] hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-sm font-bold text-slate-800">CREATE NEW ORDER</h1>
          {completedSale ? (
            <Link
              href={`/sales/orders/${completedSale.id}`}
              className="text-xs font-medium text-emerald-700 hover:underline"
            >
              View #{completedSale.order_num}
            </Link>
          ) : null}
        </div>
        <div className="text-right text-[10px] text-slate-600">
          <p>{capabilities?.profile_label ?? "POS"} · {channel.toUpperCase()}</p>
          {statusMessage ? (
            <p className="mt-0.5 normal-case text-slate-700">{statusMessage}</p>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left — product info + search */}
        <div className="flex w-full shrink-0 flex-col border-b border-[#8a7a5c] bg-[#f3ebe0] lg:w-[42%] lg:border-b-0 lg:border-r">
          <div className="border-b border-[#c4b89a] px-3 py-2">
            <p className="text-center text-xs font-bold uppercase text-[#4a5d23]">Product info</p>
            <div className="mt-2 flex flex-wrap gap-4 text-xs">
              {posSalesConfig.perLineStockRouting ? (
                <span className="text-slate-600">
                  Stock routing:{" "}
                  <strong>{posSalesConfig.stockSourceLabel}</strong>
                </span>
              ) : posSalesConfig.canChooseStockSource ? (
                <>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="pos-stock-source"
                      checked={sellFromShop}
                      onChange={() => handleStockSourceChange(true)}
                    />
                    Sell from shop stock
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="pos-stock-source"
                      checked={!sellFromShop}
                      onChange={() => handleStockSourceChange(false)}
                    />
                    Sell from store stock
                  </label>
                </>
              ) : posSalesConfig.stockSourceLabel ? (
                <span className="text-slate-600">
                  Stock source: <strong>{posSalesConfig.stockSourceLabel}</strong>
                </span>
              ) : null}
              {posSalesConfig.enableRetailPricing ? (
                <label className="flex cursor-pointer items-center gap-1.5 font-medium text-[#0C447C]">
                  <input
                    type="checkbox"
                    checked={!sellWholesale}
                    onChange={(e) => setSellWholesale(!e.target.checked)}
                  />
                  Sell at retail prices
                  <span className="text-[10px] font-normal text-slate-500">(F12)</span>
                  {retailPricingSession ? (
                    <span className="rounded bg-[#E6F1FB] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      Retail
                    </span>
                  ) : null}
                </label>
              ) : null}
              {showRouteOrderUi ? (
                <div className="flex w-full flex-wrap items-center gap-3">
                  {canChooseOrderType ? (
                    <>
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="radio"
                          name="pos-order-type"
                          checked={!isRouteOrder}
                          disabled={busy}
                          onChange={() => void handleOrderTypeChange(false)}
                        />
                        Normal order
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="radio"
                          name="pos-order-type"
                          checked={isRouteOrder}
                          disabled={busy}
                          onChange={() => void handleOrderTypeChange(true)}
                        />
                        Select Route to Apply Markup
                      </label>
                    </>
                  ) : lockedToRouteOrder ? (
                    <span className="text-xs font-medium text-[#0C447C]">
                      Select Route to Apply Markup
                    </span>
                  ) : null}
                  {lockedToRouteOrder || isRouteOrder ? (
                    <select
                      className="min-w-[10rem] rounded border border-[#b8a88a] bg-white px-2 py-1 text-xs text-slate-900"
                      value={selectedRouteId}
                      disabled={busy}
                      onChange={(e) => void handleRouteChange(e.target.value)}
                    >
                      <option value="">Select route…</option>
                      {routes.map((route) => (
                        <option key={route.id} value={route.id}>
                          {route.route_name}
                          {Number(route.route_markup_price ?? 0) > 0
                            ? ` (+${Number(route.route_markup_price).toLocaleString()} / unit)`
                            : ""}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Line entry form */}
          <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1 border-b border-[#c4b89a] p-3 text-sm">
            <div className="col-span-2 space-y-1">
              <PosProductSearch
                inputRef={searchInputRef}
                query={searchQuery}
                onQueryChange={setSearchQuery}
                results={searchResults}
                searching={searching}
                selectedCode={selectedProductCode}
                sellWholesale={sellWholesale}
                retailByCode={retailByCode}
                onSelect={pickProduct}
                onBarcodeEnter={handleBarcodeEnter}
                barcodeEnabled={enableBarcodeScanner}
                stockDisplayMode={stockDisplayMode}
                disabled={busy}
              />
              <div>
                <PosLabel>Description</PosLabel>
                <input
                  className={fieldInput}
                  value={lineForm.description}
                  readOnly
                  placeholder="Select from search"
                />
              </div>
            </div>
            <div className="col-span-2">
              <PosLabel>Package</PosLabel>
              <input
                className={`${fieldInput} cursor-not-allowed bg-slate-100 text-slate-700`}
                value={lineForm.package}
                readOnly
                placeholder="Set from product UOM"
              />
              {selectedProduct && lineForm.package ? (
                <p className="mt-0.5 text-[10px] text-slate-600">
                  Set automatically from UOM and retail package tiers
                </p>
              ) : null}
            </div>
            <div className="col-span-2">
              <PosLabel>{qtyFieldMeta?.label ?? "Quantity"}</PosLabel>
              <input
                ref={qtyInputRef}
                type="number"
                min="0"
                step={qtyFieldMeta?.step ?? "any"}
                className={fieldInput}
                value={lineForm.quantity}
                disabled={busy || !selectedProduct}
                onChange={(e) =>
                  setLineForm((p) => ({ ...p, quantity: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleQuantityEnter();
                  }
                }}
              />
              {selectedProduct && qtyFieldMeta?.hint ? (
                <p className="mt-0.5 text-[10px] text-slate-600">{qtyFieldMeta.hint}</p>
              ) : null}
              {stockDeductionHint ? (
                <p className="mt-0.5 text-[10px] font-medium text-[#4a5d23]">
                  {stockDeductionHint}
                </p>
              ) : null}
              {lineStockMessage ? (
                <p className="mt-0.5 text-[10px] font-medium text-red-700">{lineStockMessage}</p>
              ) : null}
            </div>
            {allowDiscounts ? (
              <div className="col-span-2">
                <PosLabel>Discount given</PosLabel>
                <input
                  className={`${fieldInput} text-[#185FA5] font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600`}
                  type="number"
                  min="0"
                  step="any"
                  value={lineForm.discount}
                  readOnly={productHasConfiguredDiscount(selectedProduct)}
                  disabled={productHasConfiguredDiscount(selectedProduct) || busy || !selectedProduct}
                  onChange={(e) => setLineForm((p) => ({ ...p, discount: e.target.value }))}
                />
                {productHasConfiguredDiscount(selectedProduct) ? (
                  <p className="mt-0.5 text-[10px] text-slate-600">
                    Auto: {formatProductDiscountLabel(selectedProduct)}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="col-span-2">
              <PosLabel>{unitPriceLabel}</PosLabel>
              <input
                ref={unitPriceRef}
                className={`${fieldInput} ${!allowEditUnitPrice ? "cursor-not-allowed bg-slate-100 text-slate-700" : ""}`}
                type="number"
                min="0"
                step="any"
                value={lineForm.unit_price}
                readOnly={!allowEditUnitPrice}
                disabled={!allowEditUnitPrice || busy || !selectedProduct}
                onChange={(e) => {
                  if (!allowEditUnitPrice) return;
                  setUnitPriceTouched(true);
                  setLineForm((p) => ({ ...p, unit_price: e.target.value }));
                }}
                onKeyDown={allowEditUnitPrice ? handleUnitPriceEnter : undefined}
              />
            </div>
            <div className="col-span-2 mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || addLineBlocked}
                onClick={handleAddLine}
                className="flex min-w-[7rem] flex-1 items-center justify-center gap-1 rounded border border-[#6b8f3c] bg-[#e8f5d8] py-2 text-xs font-bold uppercase text-[#2d5016] hover:bg-[#d4edc0] disabled:opacity-50"
              >
                <span className="text-base text-[#185FA5]">{editingLineId ? "✓" : "+"}</span>
                {editingLineId ? "Update" : "Add"}
              </button>
              {editingLineId ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancelEdit}
                  className="flex min-w-[7rem] flex-1 items-center justify-center gap-1 rounded border border-slate-300 bg-white py-2 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={handleRefresh}
                className="flex min-w-[7rem] flex-1 items-center justify-center gap-1 rounded border border-[#6b8f3c] bg-[#e8f5d8] py-2 text-xs font-bold uppercase text-[#2d5016] hover:bg-[#d4edc0] disabled:opacity-50"
              >
                <span className="text-base text-emerald-600">↻</span> Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Right — cart grid */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#fff4e6]">
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-[#f5dcc4]">
                <tr className="border-b border-[#c4a882] text-left font-bold uppercase text-slate-700">
                  <th className="px-2 py-2">Scan code</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Package</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Unit price</th>
                  {allowDiscounts ? (
                    <th className="px-2 py-2 text-right">Discount</th>
                  ) : null}
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {!cart?.lines?.length ? (
                  <tr>
                    <td colSpan={allowDiscounts ? 8 : 7} className="h-[min(40vh,320px)] text-center text-slate-500">
                      No items in cart
                    </td>
                  </tr>
                ) : (
                  cart.lines.map((line) => {
                    const selected = selectedLineId === line.id;
                    const editing = editingLineId === line.id;
                    const productMeta = productByCode[line.product_code];
                    const uom = productMeta?.uom;
                    const isRetailLine = Number(line.on_wholesale_retail) === 1;
                    return (
                      <tr
                        key={line.id}
                        onClick={() => setSelectedLineId(line.id)}
                        onDoubleClick={() => handleEditSelectedLine(line.id)}
                        className={`cursor-pointer border-b border-[#e8d4b8] ${
                          editing
                            ? "bg-amber-100 ring-1 ring-inset ring-amber-400"
                            : selected
                              ? "bg-red-100"
                              : "hover:bg-[#ffecd6]"
                        }`}
                      >
                        <td className="px-2 py-1.5 font-mono text-[11px]">
                          {line.product_code}
                          <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                            #{line.line_no ?? line.id}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">{line.product_name}</td>
                        <td className="px-2 py-1.5 text-[11px]">
                          <span
                            className={`rounded px-1.5 py-0.5 font-semibold ${
                              isRetailLine
                                ? "bg-violet-100 text-violet-800"
                                : "bg-sky-100 text-sky-800"
                            }`}
                          >
                            {posCartLineTypeLabel(line)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-[11px]">
                          {uom
                            ? uomWholesaleConversionExample(uom)
                            : (line.uom ?? productMeta?.packaging_label ?? "—")}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {uom
                            ? formatPosCartQty(line.quantity, uom)
                            : formatMixedStockDisplay(line.quantity, 1).text}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {Number(
                            cartLineDisplayUnitPrice(line, uom, isRetailLine),
                          ).toLocaleString()}
                        </td>
                        {allowDiscounts ? (
                          <td className="px-2 py-1.5 text-right">
                            {Number(line.discount_given ?? 0).toLocaleString()}
                          </td>
                        ) : null}
                        <td className="px-2 py-1.5 text-right font-medium">
                          {Number(line.amount).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#c4a882] bg-[#ebe3d4] px-3 py-2">
            <div className="flex flex-wrap gap-2">
              <PosActionButton
                label="Edit item"
                icon="✎"
                iconClass="text-[#185FA5]"
                disabled={busy || !selectedLineId}
                onClick={handleEditSelectedLine}
              />
              <PosActionButton
                label="Remove item"
                icon="−"
                iconClass="text-[#185FA5]"
                disabled={busy || !selectedLineId}
                onClick={removeSelectedLine}
              />
              <PosActionButton
                label="Clear all"
                icon="⌫"
                iconClass="text-amber-700"
                disabled={busy || !cart?.lines?.length}
                onClick={clearAllLines}
              />
              {posSalesConfig.showCheckoutOnCreate ? (
                <PosActionButton
                  label="Complete"
                  icon="🛒"
                  iconClass="text-red-600"
                  disabled={busy || !cart?.lines?.length || cartStockBlocked}
                  onClick={() => {
                    setPaymentError(null);
                    setPaymentOpen(true);
                  }}
                />
              ) : (
                <PosActionButton
                  label="Save order"
                  icon="💾"
                  iconClass="text-[#185FA5]"
                  disabled={busy || !cart?.lines?.length || cartStockBlocked}
                  onClick={() => {
                    setSaveOrderError(null);
                    setSaveOrderOpen(true);
                  }}
                />
              )}
            </div>
            <p className="text-lg font-bold text-slate-900">
              TOTAL:{" "}
              <span className="text-xl">{Math.round(totals.total).toLocaleString()}</span>
            </p>
            {cartStockBlocked ? (
              <p className="w-full text-right text-xs font-medium text-red-700">
                Cart exceeds available stock — reduce quantities or enable negative stock in admin.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <PosPaymentPanel
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        billTotal={totals.total}
        channel={channel}
        paymentConfig={posSalesConfig.payment}
        saving={busy}
        error={paymentError}
        onComplete={handleCheckout}
        onContinueNextOrder={handleContinueNextOrder}
      />

      <PosSaveOrderDialog
        open={saveOrderOpen}
        onClose={() => setSaveOrderOpen(false)}
        saving={busy}
        error={saveOrderError}
        onSave={handleSaveOrder}
      />
    </div>
  );
}

function PosActionButton({ label, icon, iconClass, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 rounded border border-[#8a7a5c] bg-white px-3 py-1.5 text-[10px] font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-40"
    >
      <span className={`text-lg leading-none ${iconClass}`}>{icon}</span>
      {label}
    </button>
  );
}
