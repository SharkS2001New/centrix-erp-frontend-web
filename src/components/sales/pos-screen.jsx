"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/api-concurrency";
import { CentrixLogoHeader } from "@/components/branding/centrix-logo";
import { PRODUCT_NAME } from "@/lib/branding";
import { useAuth } from "@/contexts/auth-context";
import { usePosSession } from "@/contexts/pos-session-context";
import {
  parseDecimalInput,
  INPUT_CLASS,
  SELECT_CLASS,
  INPUT_READONLY_CLASS,
  COMPACT_INPUT_CLASS,
} from "@/components/catalog/catalog-shared";
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
  resolvePosQuantity,
  posStockDeductionHint,
  posUnitPriceFieldLabel,
  usesPosRetailPricing,
} from "@/lib/pos-line";
import {
  computeProductLineDiscount,
  formatProductDiscountLabel,
  productHasConfiguredDiscount,
} from "@/lib/product-discount";
import { lineProductVat } from "@/lib/sales-vat";
import { formatSaleKes } from "@/lib/sales";
import { getChannelWorkflow, workflowPipelineSteps } from "@/lib/order-workflow";
import {
  getPosSalesConfig,
  isWorkspaceTillFloatRequired,
  posChannelFromStockSource,
  resolveCheckoutStatus,
  resolveSaveOrderStatus,
  resolveSaveOrderStatusLabel,
} from "@/lib/sales-settings";
import {
  isPlatformMpesaStkEnabled,
  isStkPushEnabled,
  shouldSubmitKraOnCheckout,
} from "@/lib/finance-settings";
import { printSaleOrder } from "@/components/sales/sale-order-print";
import {
  canAdjustCartLineQuantity,
  cartLineEntryQtyForBaseQty,
  cartLineNextBaseQty,
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
import { PosCartPaymentOptions, posCartPaymentPromptsEnabled } from "./pos-cart-payment-options";
import { PosHeldOrdersOverlay } from "./pos-held-orders-overlay";
import { PosOrderEditBar } from "./pos-order-edit-bar";
import { PosSaveOrderDialog } from "./pos-save-order-dialog";
import { PosLeaveGuardDialog } from "./pos-leave-guard-dialog";
import { PosActionButton } from "./pos-action-button";
import { CloseSessionModal, XReportModal, ZReportModal } from "@/components/pos/pos-session-modals";
import { FloatBreakdownModal, OpenSessionModal, RecordSessionExpenseModal } from "@/components/pos/till-session-ui";
import { dedupeErrorMessage, buildExpensesHref } from "@/lib/expenses-link";
import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { UserAccountMenu } from "@/components/layout/user-account-menu";
import { PosStatusFooter } from "./pos-status-footer";
import {
  PosPriceCheckerModal,
} from "./pos-utility-modals";
import { filterByOrganization, orgListParams } from "@/lib/admin";
import {
  createBranchTill,
  indexOpenSessionsByTill,
  pickBranchTillForCashier,
  tillDisplayName,
} from "@/lib/pos-till";

const cartToolbarBtnClassName =
  "theme-secondary-btn inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-wide shadow-sm disabled:opacity-50";

const posHeaderBtnClassName = "pos-header-action-btn";

const fieldInput = INPUT_CLASS;

const compactAmountInput = `${COMPACT_INPUT_CLASS} w-[4.5rem] shrink-0 text-right text-xs`;

function PosLabel({ children }) {
  return (
    <span className="theme-accent-label mb-1 block text-xs font-bold uppercase tracking-wide">
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

function cartLineRef(line) {
  return line?.update_code ?? line?.id ?? null;
}

function sameLineId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

export function PosScreen({ standalone = false }) {
  const router = useRouter();
  const { user, capabilities, refreshCapabilities, organization } = useAuth();
  const {
    activeSession,
    tillId,
    floatSessionId,
    openSession,
    addFloat,
    recordCashMovement,
    recordSessionExpense,
    suspendSession,
    resumeSession,
    closeSession,
    sessionReport,
    refreshReport,
    suspendedSession,
    busy: sessionBusy,
    error: sessionError,
    setError: setSessionError,
    loading: sessionLoading,
    hasPosTill,
  } = usePosSession();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const productBranchParams = useMemo(
    () => (user?.branch_id ? { branch_id: user.branch_id } : {}),
    [user?.branch_id],
  );
  const posSalesConfig = useMemo(
    () =>
      getPosSalesConfig(capabilities?.module_settings, {
        allowNegativeStock: capabilities?.allow_negative_stock,
        capabilities,
      }),
    [capabilities?.module_settings, capabilities?.allow_negative_stock, capabilities],
  );
  const allowDiscounts = posSalesConfig.allowDiscounts;
  const allowEditLineDiscount = posSalesConfig.allowEditLineDiscount;
  const showCartLineType = posSalesConfig.enableRetailPricing;
  const cartTableColSpan =
    6 + (showCartLineType ? 1 : 0) + (allowDiscounts ? 1 : 0);
  const enableOrderDiscount = posSalesConfig.enableOrderDiscount;
  const enableVouchers = posSalesConfig.enableVouchers;
  const enableRedeemablePoints = posSalesConfig.enableRedeemablePoints;
  const mpesaStkPlatformEnabled = isPlatformMpesaStkEnabled(
    capabilities?.module_settings,
    capabilities,
  );
  const enableMpesaOnPos =
    mpesaStkPlatformEnabled && Boolean(posSalesConfig.payment?.enableMpesaAmount);
  const enableStkPushOnPos = isStkPushEnabled(capabilities?.module_settings, capabilities);
  const showCartPaymentPrompts = posCartPaymentPromptsEnabled({
    enableVouchers,
    enablePoints: enableRedeemablePoints,
    enableMpesa: enableMpesaOnPos,
  });
  const checkoutPaymentConfig = useMemo(() => {
    if (mpesaStkPlatformEnabled) return posSalesConfig.payment;
    return {
      ...posSalesConfig.payment,
      enableMpesaAmount: false,
      enableMpesaCode: false,
    };
  }, [mpesaStkPlatformEnabled, posSalesConfig.payment]);
  const allowEditUnitPrice = posSalesConfig.allowEditUnitPrice;
  const enableBarcodeScanner = posSalesConfig.enableBarcodeScanner;
  const allowNegativeStock = posSalesConfig.allowNegativeStock;
  const addRouteMarkupPrices = posSalesConfig.addRouteMarkupPrices;
  const posOrderTypeMode = posSalesConfig.posOrderTypeMode;
  // External POS (/pos) → require_pos_till_float (platform). Backoffice create order → require_backoffice_till_float (org admin).
  const requireTillFloat = isWorkspaceTillFloatRequired(capabilities?.module_settings, { standalone });
  const canManageTillSession = hasPosTill || (standalone && requireTillFloat);
  const salesWorkspace = standalone ? "pos" : "backoffice";
  const enablePosOrderEdit = standalone && posSalesConfig.enablePosOrderEdit;
  const blindTillClose = posSalesConfig.blindTillClose;
  const canChooseOrderType = addRouteMarkupPrices && posOrderTypeMode === "toggle";
  const lockedToRouteOrder = addRouteMarkupPrices && posOrderTypeMode === "route";
  const showRouteOrderUi = addRouteMarkupPrices && posOrderTypeMode !== "normal";
  const qtyInputRef = useRef(null);
  const discountInputRef = useRef(null);
  const unitPriceRef = useRef(null);
  const searchInputRef = useRef(null);
  const focusSearchAfterAdd = useRef(false);
  const appliedRouteMarkupRef = useRef(0);
  const [sellFromShop, setSellFromShop] = useState(true);
  const [sellWholesale, setSellWholesale] = useState(true);
  const [isRouteOrder, setIsRouteOrder] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routes, setRoutes] = useState([]);
  const [posTills, setPosTills] = useState([]);
  const [posBranches, setPosBranches] = useState([]);
  const [posOpenSessions, setPosOpenSessions] = useState([]);
  const [floatModalOpen, setFloatModalOpen] = useState(false);
  const [floatDetailsOpen, setFloatDetailsOpen] = useState(false);
  const [recordExpenseOpen, setRecordExpenseOpen] = useState(false);
  const [xReportOpen, setXReportOpen] = useState(false);
  const [xReportLoading, setXReportLoading] = useState(false);
  const [closeSessionOpen, setCloseSessionOpen] = useState(false);
  const [zReportOpen, setZReportOpen] = useState(false);
  const [zReportPayload, setZReportPayload] = useState(null);
  const [zReportTillName, setZReportTillName] = useState(null);
  const [preferredTillId, setPreferredTillId] = useState(null);
  const [pendingTillSuggestion, setPendingTillSuggestion] = useState(null);
  const [posTillMetaLoading, setPosTillMetaLoading] = useState(false);

  const loadPosTillMeta = useCallback(async () => {
    if (!organizationId) return;
    setPosTillMetaLoading(true);
    try {
      const [tillRes, branchRes, sessionRes] = await Promise.all([
        apiRequest("/tills", { searchParams: { per_page: 200 } }),
        apiRequest("/branches", {
          searchParams: { per_page: 200, ...orgListParams(organizationId) },
        }),
        apiRequest("/till-float-sessions", {
          searchParams: { per_page: 200, "filter[status]": "open" },
        }).catch(() => ({ data: [] })),
      ]);
      let tills = tillRes.data ?? [];
      const sessions = sessionRes.data ?? [];
      const branches = filterByOrganization(branchRes.data ?? [], organizationId);
      const branchId = user?.branch_id ?? branches[0]?.id;

      if (branchId) {
        const picked = pickBranchTillForCashier({
          branchId,
          tills,
          openSessions: sessions,
          userId: user?.id,
        });
        setPreferredTillId(picked.till?.id ?? null);
        setPendingTillSuggestion(picked.suggested);
      } else {
        setPreferredTillId(tills[0]?.id ?? null);
        setPendingTillSuggestion(null);
      }

      setPosTills(tills);
      setPosBranches(branches);
      setPosOpenSessions(sessions);
    } catch {
      setPosTills([]);
      setPosBranches([]);
      setPosOpenSessions([]);
      setPreferredTillId(null);
      setPendingTillSuggestion(null);
    } finally {
      setPosTillMetaLoading(false);
    }
  }, [organizationId, user?.branch_id, user?.id]);

  const openByTill = useMemo(
    () => indexOpenSessionsByTill(posOpenSessions),
    [posOpenSessions],
  );

  const activeTill = useMemo(
    () => posTills.find((t) => String(t.id) === String(tillId ?? activeSession?.till_id)) ?? null,
    [posTills, tillId, activeSession?.till_id],
  );

  useEffect(() => {
    // Only auto-prompt on standalone POS — backoffice users can declare float from the banner.
    if (!standalone) return;
    if (!requireTillFloat || activeSession || suspendedSession || sessionLoading || zReportOpen || floatModalDismissedRef.current) {
      return;
    }
    setFloatModalOpen(true);
    loadPosTillMeta();
  }, [standalone, requireTillFloat, activeSession, suspendedSession, sessionLoading, zReportOpen, loadPosTillMeta]);

  async function handlePosOpenSession(payload) {
    try {
      let tillId = payload.till_id;
      const branchId = payload.branch_id ?? user?.branch_id;

      if (!tillId && branchId) {
        const created = await createBranchTill({
          branchId,
          existingTills: posTills,
          suggested: pendingTillSuggestion,
          cashierId: user?.id,
        });
        tillId = created.id;
        setPosTills((rows) => [...rows, created]);
        setPreferredTillId(created.id);
        setPendingTillSuggestion(null);
      }

      if (!tillId) {
        throw new Error("No till is available for this branch.");
      }

      await openSession({
        ...payload,
        till_id: tillId,
        branch_id: branchId,
      });
      setFloatModalOpen(false);
    } catch {
      /* sessionError set in context */
    }
  }

  async function handlePosAddFloat(payload) {
    await addFloat(payload);
    setSessionError(null);
  }

  async function handleOpenXReport() {
    if (!activeSession?.id) return;
    setSessionError(null);
    setXReportOpen(true);
    setXReportLoading(true);
    try {
      await refreshReport(activeSession.id);
    } catch {
      /* sessionError from context */
    } finally {
      setXReportLoading(false);
    }
  }

  function promptStandaloneSessionForReports() {
    setSessionError(null);
    setFloatModalOpen(true);
    loadPosTillMeta();
  }

  function handleStandaloneXReport() {
    if (!activeSession?.id) {
      promptStandaloneSessionForReports();
      return;
    }
    void handleOpenXReport();
  }

  function handleStandaloneZReport() {
    if (!activeSession?.id) {
      promptStandaloneSessionForReports();
      return;
    }
    void handleOpenCloseSession();
  }

  async function handleOpenCloseSession() {
    if (!activeSession?.id) return;
    setSessionError(null);
    setCloseSessionOpen(true);
    try {
      await refreshReport(activeSession.id);
    } catch {
      /* sessionError from context */
    }
  }

  function handleSessionClosed(res) {
    const closedTillId = res?.session?.till_id;
    const closedTill = closedTillId
      ? posTills.find((t) => String(t.id) === String(closedTillId))
      : activeTill;
    setZReportTillName(closedTill ? tillDisplayName(closedTill) : null);
    setCloseSessionOpen(false);
    setZReportPayload(res);
    setZReportOpen(true);
  }

  function handleZReportClose() {
    setZReportPayload(null);
    setZReportOpen(false);
    setZReportTillName(null);
    if (requireTillFloat && !suspendedSession) {
      setFloatModalOpen(true);
      loadPosTillMeta();
    }
  }

  async function handleSuspendSession() {
    if (!window.confirm("Suspend this session? You can resume the same shift later — no new float is needed.")) return;
    setSessionError(null);
    try {
      await suspendSession();
      setFloatModalOpen(false);
    } catch {
      /* sessionError from context */
    }
  }

  async function handleResumeSession() {
    setSessionError(null);
    try {
      await resumeSession();
      setFloatModalOpen(false);
    } catch {
      /* sessionError from context */
    }
  }

  const organizationName = capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME;
  const posCashierName = user?.full_name ?? user?.username ?? null;
  const channel = posChannelFromStockSource(sellFromShop, posSalesConfig);
  const channelWorkflow = useMemo(
    () => getChannelWorkflow(capabilities, channel),
    [capabilities, channel],
  );

  useEffect(() => {
    refreshCapabilities().catch(() => {});
  }, [refreshCapabilities]);

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
  const [editingLineRef, setEditingLineRef] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lineBusy, setLineBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saveOrderOpen, setSaveOrderOpen] = useState(false);
  const [heldOrdersOpen, setHeldOrdersOpen] = useState(false);
  const [heldOrdersCount, setHeldOrdersCount] = useState(0);
  const [orderDialogMode, setOrderDialogMode] = useState("save");
  const [saveOrderError, setSaveOrderError] = useState(null);
  const [paymentError, setPaymentError] = useState(null);
  const [completedSale, setCompletedSale] = useState(null);
  const [orderEditError, setOrderEditError] = useState(null);
  const [sessionPosOrders, setSessionPosOrders] = useState([]);
  const [editOrderNo, setEditOrderNo] = useState("");
  const [editBrowseIndex, setEditBrowseIndex] = useState(0);
  const [priceCheckerOpen, setPriceCheckerOpen] = useState(false);
  const [leaveGuardOpen, setLeaveGuardOpen] = useState(false);
  const [leaveGuardBusy, setLeaveGuardBusy] = useState(false);
  const pendingLeaveHrefRef = useRef(null);
  const floatModalDismissedRef = useRef(false);

  const [orderDiscountDraft, setOrderDiscountDraft] = useState("");

  const cartLineCount = cart?.lines?.length ?? 0;
  const cartHasReservedItems = cartLineCount > 0;

  const activeOrderNum = useMemo(() => {
    if (cart?.held_order_num) return cart.held_order_num;
    if (cart?.next_order_num) return cart.next_order_num;
    return null;
  }, [cart?.held_order_num, cart?.next_order_num]);

  const showStandaloneTillActions = standalone;
  const canUseSessionReports = Boolean(activeSession?.id);
  const showCartToolbar =
    !standalone &&
    (heldOrdersCount > 0 || (requireTillFloat && activeSession));

  const canGoPreviousOrder = sessionPosOrders.length > 0 && editBrowseIndex < sessionPosOrders.length - 1;
  const canGoNextOrder = sessionPosOrders.length > 0 && editBrowseIndex > 0;
  const hasSessionOrders = sessionPosOrders.length > 0;

  function rememberCompletedPosOrder(sale) {
    if (!sale?.id || !enablePosOrderEdit) return;
    const status = String(sale.status ?? "").toLowerCase();
    if (!["completed", "paid", "delivered"].includes(status)) return;
    const entry = { id: sale.id, order_num: sale.order_num };
    setSessionPosOrders((prev) => {
      const next = [entry, ...prev.filter((row) => row.id !== entry.id)];
      return next.slice(0, 40);
    });
    setEditBrowseIndex(0);
    setEditOrderNo(String(sale.order_num ?? ""));
  }

  useEffect(() => {
    if (!enablePosOrderEdit || !standalone) return;
    apiRequest("/sales", {
      searchParams: {
        per_page: 40,
        channel: "pos",
        status: "completed",
        sort: "-order_num",
        with_items: 0,
      },
    })
      .then((res) => {
        const orders = (res.data ?? [])
          .filter((row) => row?.id && row?.order_num != null)
          .map((row) => ({ id: row.id, order_num: row.order_num }));
        if (!orders.length) return;
        setSessionPosOrders(orders);
        setEditBrowseIndex(0);
        setEditOrderNo(String(orders[0].order_num));
      })
      .catch(() => {});
  }, [enablePosOrderEdit, standalone]);

  const cartSummary = useMemo(() => {
    const rows = cart?.lines ?? [];
    const lineDiscounts = rows.reduce((sum, line) => sum + Number(line.discount_given ?? 0), 0);
    const net = rows.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    const vat = rows.reduce((sum, line) => sum + Number(line.product_vat ?? 0), 0);
    const orderDiscountRaw =
      enableOrderDiscount || enableVouchers
        ? orderDiscountDraft !== ""
          ? Math.max(0, parseDecimalInput(orderDiscountDraft))
          : Number(cart?.order_discount ?? 0)
        : 0;
    const orderDiscount = Math.min(Math.max(0, orderDiscountRaw), net);
    const grossTotal = Math.max(0, net - orderDiscount);
    const voucherPayment = Math.max(0, Number(cart?.voucher_payment_amount ?? 0));
    const pointsPayment = Math.max(0, Number(cart?.points_payment_amount ?? 0));
    const mpesaPayment = Math.max(0, Number(cart?.mpesa_payment_amount ?? 0));
    const amountDue = Math.max(0, grossTotal - voucherPayment - pointsPayment - mpesaPayment);
    return {
      subtotal: net + lineDiscounts,
      lineDiscounts,
      orderDiscount,
      discounts: lineDiscounts + orderDiscount,
      vat,
      total: grossTotal,
      voucherPayment,
      pointsPayment,
      mpesaPayment,
      amountDue,
    };
  }, [
    cart?.lines,
    cart?.order_discount,
    cart?.voucher_payment_amount,
    cart?.points_payment_amount,
    cart?.mpesa_payment_amount,
    orderDiscountDraft,
    enableOrderDiscount,
  ]);

  useEffect(() => {
    const value = Number(cart?.order_discount ?? 0);
    setOrderDiscountDraft(value > 0 ? String(value) : "");
  }, [cart?.id, cart?.order_discount]);

  const loadHeldOrdersCount = useCallback(async () => {
    try {
      const res = await apiRequest("/sales", {
        searchParams: { per_page: 1, "filter[status]": "held" },
      });
      setHeldOrdersCount(Number(res.total ?? (res.data ?? []).length ?? 0));
    } catch {
      setHeldOrdersCount(0);
    }
  }, []);

  useEffect(() => {
    loadHeldOrdersCount();
  }, [loadHeldOrdersCount]);

  const cartActionPending = busy || lineBusy;

  useEffect(() => {
    if (cartActionPending || !focusSearchAfterAdd.current) return;
    focusSearchAfterAdd.current = false;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cartActionPending]);

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
    mapWithConcurrency(
      missing,
      (code) =>
        apiRequest(`/products/${encodeURIComponent(code)}`, {
          searchParams: productBranchParams,
        }).catch(() => null),
      4,
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
  }, [cart?.lines, uomById, vatById, productByCode, productBranchParams]);

  const loadCashierCart = useCallback(async () => {
    if (!user?.branch_id) return null;
    const body = { channel, order_source: "pos", branch_id: user.branch_id };
    if (tillId) body.till_id = tillId;
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
    tillId,
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
          searchParams: { per_page: 80, q: trimmed, ...productBranchParams },
        });
        if (seq !== searchSeq.current) return;
        const list = (res.data ?? []).map((p) => enrichProductForLpo(p, uomMap, vatMap));
        setSearchResults(list.slice(0, 40));
        setProductByCode((prev) => {
          const next = { ...prev };
          for (const p of list) next[p.product_code] = p;
          return next;
        });
      } catch (err) {
        if (seq !== searchSeq.current) return;
        setSearchResults([]);
        if (err instanceof ApiError && err.status === 403) {
          setStatusMessage("You do not have permission to search products.");
        }
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    },
    [uomById, vatById, productBranchParams],
  );

  useEffect(() => {
    const t = setTimeout(() => searchProducts(searchQuery), 280);
    return () => clearTimeout(t);
  }, [searchQuery, searchProducts]);

  function retailLineFlagFor(product, entryQty, retailLine = null, sellWholesaleOverride = null) {
    if (retailLine != null) return retailLine;
    const sellMode = sellWholesaleOverride ?? sellWholesale;
    const retailPackage = retailByCode[product.product_code] ?? null;
    const resolved = resolvePosQuantity(entryQty, product, retailPackage, sellMode);
    return posLineRetailStockFlag(posSalesConfig, sellMode, resolved.isRetail);
  }

  function applyComputedPrice(
    product,
    entryQty,
    discount,
    overridePrice = null,
    retailLine = null,
    sellWholesaleOverride = null,
  ) {
    const sellMode = sellWholesaleOverride ?? sellWholesale;
    const retailPackage = retailByCode[product.product_code] ?? null;
    const lineRetailFlag = retailLineFlagFor(product, entryQty, retailLine, sellMode);
    const autoProductDiscount =
      allowDiscounts && productHasConfiguredDiscount(product);
    let discountAmount = 0;

    if (allowDiscounts) {
      if (autoProductDiscount) {
        const preDiscount = computePosLine({
          product,
          entryQty,
          sellWholesale: sellMode,
          retailPackage,
          discount: 0,
          unitPriceOverride: overridePrice,
          routeMarkupPerUnit,
          retailLine: lineRetailFlag,
        });
        discountAmount = computeProductLineDiscount(
          product,
          preDiscount.lineAmountBeforeDiscount,
          preDiscount.packQty,
        );
      } else if (allowEditLineDiscount) {
        discountAmount = parseDecimalInput(discount);
      }
    }

    const computed = computePosLine({
      product,
      entryQty,
      sellWholesale: sellMode,
      retailPackage,
      discount: discountAmount,
      unitPriceOverride: overridePrice,
      routeMarkupPerUnit,
      retailLine: lineRetailFlag,
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
      const row = await apiRequest(`/products/${encodeURIComponent(trimmed)}`, {
        searchParams: productBranchParams,
      });
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
    editingRef = null,
    discount = 0,
    override = null,
    successMessage,
    clearEntry = true,
    lineRetailStockFlagOverride = null,
  }) {
    const retailPackage = retailByCode[product.product_code] ?? null;
    let finalComputed = computed;
    let targetLineRef = editingRef ?? cartLineRef(mergeTarget);

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

    const lineRetailStockFlag =
      lineRetailStockFlagOverride != null
        ? lineRetailStockFlagOverride
        : posLineRetailStockFlag(posSalesConfig, sellWholesale, computed.isRetail);

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
      product_vat: lineProductVat(product, finalComputed.lineAmount),
    };

    if (targetLineRef) {
      await apiRequest(`/sales/carts/${activeCart.id}/lines/${targetLineRef}`, {
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

    if (successMessage) setStatusMessage(successMessage);

    if (clearEntry) {
      setLineForm(EMPTY_LINE);
      setSelectedProductCode(null);
      setSelectedProduct(null);
      setSearchQuery("");
      setSearchResults([]);
      setUnitPriceTouched(false);
      setEditingLineId(null);
      setEditingLineRef(null);
      setSelectedLineId(null);
      focusSearchAfterAdd.current = true;
    }

    return true;
  }

  async function quickAddOrIncrementProduct(product) {
    if (busy || lineBusy || !product) return;
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

    setLineBusy(true);
    try {
      await commitCartLine({
        product,
        computed,
        incrementBaseQty: computed.baseQty,
        mergeTarget,
        successMessage: null,
      });
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to add line");
    } finally {
      setLineBusy(false);
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
    if (editingLineId) return;
    setUnitPriceTouched(false);
  }, [sellWholesale, routeMarkupPerUnit, editingLineId]);

  useEffect(() => {
    if (!selectedProduct?.product_code) return;
    const frame = window.requestAnimationFrame(() => {
      qtyInputRef.current?.focus({ preventScroll: true });
      qtyInputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedProduct?.product_code]);

  useEffect(() => {
    if (!selectedProduct || editingLineId) return;
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
          : allowEditLineDiscount
            ? prev.discount
            : "0"
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
    allowEditLineDiscount,
    routeMarkupPerUnit,
    editingLineId,
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
      retailLineFlagFor(selectedProduct, lineForm.quantity),
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

  async function commitOrderDiscount(rawValue = orderDiscountDraft) {
    if (!cart?.id || !enableOrderDiscount) return;
    const parsed = Math.max(0, parseDecimalInput(rawValue));
    const net = (cart.lines ?? []).reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    const next = Math.min(parsed, net);
    if (next === Number(cart.order_discount ?? 0)) {
      setOrderDiscountDraft(next > 0 ? String(next) : "");
      return;
    }
    setBusy(true);
    try {
      const updated = await apiRequest(`/sales/carts/${cart.id}`, {
        method: "PATCH",
        body: { order_discount: next },
      });
      setCart(updated);
      setOrderDiscountDraft(next > 0 ? String(next) : "");
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to update order discount");
      setOrderDiscountDraft(
        Number(cart.order_discount ?? 0) > 0 ? String(cart.order_discount) : "",
      );
    } finally {
      setBusy(false);
    }
  }

  async function repriceCartForRouteMarkup(nextMarkup) {
    if (!cart?.id) {
      appliedRouteMarkupRef.current = nextMarkup;
      return;
    }
    if (!cart.lines?.length) {
      appliedRouteMarkupRef.current = nextMarkup;
      return;
    }

    const repriced = [];
    for (const row of cart.lines) {
      const product =
        productByCode[row.product_code] ?? (await resolveProductByCode(row.product_code));
      if (!product) {
        repriced.push(row);
        continue;
      }
      const retailPackage = retailByCode[row.product_code] ?? null;
      const isRetailLine = cartLineRetailStockFlag(row);
      const entryQty = posEntryQtyFromCartLine(row, product, retailPackage);
      const computed = computePosLine({
        product,
        entryQty,
        sellWholesale: !isRetailLine,
        retailPackage,
        discount: Number(row.discount_given ?? 0),
        routeMarkupPerUnit: nextMarkup,
        retailLine: isRetailLine,
      });
      repriced.push({
        ...row,
        quantity: computed.baseQty,
        unit_price: computed.unitPricePerBase,
        discount_given: computed.discountApplied,
      });
    }

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

    setLineBusy(true);
    const wasEditing = editingLineId;
    const editingLine = cart?.lines?.find((l) => sameLineId(l.id, editingLineId)) ?? null;
    try {
      const ok = await commitCartLine({
        product: selectedProduct,
        computed,
        incrementBaseQty: computed.baseQty,
        mergeTarget,
        editingId: editingLineId,
        editingRef: editingLineRef ?? cartLineRef(editingLine),
        discount,
        override,
        successMessage: null,
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
      setLineBusy(false);
    }
  }

  function canEditManualLineDiscount(product = selectedProduct) {
    return (
      allowDiscounts &&
      allowEditLineDiscount &&
      !productHasConfiguredDiscount(product)
    );
  }

  function focusLineField(ref) {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select?.();
  }

  function handleQuantityEnter() {
    if (!selectedProduct || busy || lineBusy || addLineBlocked) return;
    if (canEditManualLineDiscount()) {
      focusLineField(discountInputRef);
      return;
    }
    if (allowEditUnitPrice) {
      focusLineField(unitPriceRef);
      return;
    }
    void handleAddLine();
  }

  function handleDiscountEnter(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!selectedProduct || busy || lineBusy || addLineBlocked) return;
    if (allowEditUnitPrice) {
      focusLineField(unitPriceRef);
      return;
    }
    void handleAddLine();
  }

  function handleUnitPriceEnter(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!busy && !lineBusy && !addLineBlocked) void handleAddLine();
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

  function cartLineQtyAdjustState(line, product, delta) {
    if (!line || !product) {
      return { canDecrease: false, canIncrease: false };
    }
    const retailPackage = retailByCode[line.product_code] ?? null;
    const currentBase = Number(line.quantity ?? 0);
    const decreaseCheck = canAdjustCartLineQuantity({
      line,
      product,
      retailPackage,
      delta: -1,
      cartLines: cart?.lines,
      sellFromShop,
      posSalesConfig,
      allowNegativeStock,
      productByCode,
    });
    const increaseCheck = canAdjustCartLineQuantity({
      line,
      product,
      retailPackage,
      delta: 1,
      cartLines: cart?.lines,
      sellFromShop,
      posSalesConfig,
      allowNegativeStock,
      productByCode,
    });
    return {
      canDecrease: currentBase > 0 && decreaseCheck.ok,
      canIncrease: increaseCheck.ok,
      increaseCheck,
    };
  }

  async function adjustCartLineQuantity(line, delta) {
    if (!line || !cart?.id || busy || lineBusy || !delta) return;
    setLineBusy(true);
    try {
      const product =
        productByCode[line.product_code] ?? (await resolveProductByCode(line.product_code));
      if (!product) {
        setStatusMessage("Product not found for this cart line.");
        return;
      }

      const retailPackage = retailByCode[line.product_code] ?? null;
      const isRetailLine = cartLineRetailStockFlag(line);
      const adjustCheck = canAdjustCartLineQuantity({
        line,
        product,
        retailPackage,
        delta,
        cartLines: cart?.lines,
        sellFromShop,
        posSalesConfig,
        allowNegativeStock,
        productByCode,
      });

      if (!adjustCheck.ok) {
        setStatusMessage(
          posStockInsufficientMessage(adjustCheck.stockCheck, {
            product,
            sellWholesale: !isRetailLine,
            retailPackage,
            posSalesConfig,
          }),
        );
        return;
      }

      const nextBaseQty = cartLineNextBaseQty(line, product, retailPackage, delta);

      if (adjustCheck.willRemove || nextBaseQty <= 0) {
        const lineRef = cartLineRef(line);
        if (!lineRef) return;
        const updated = await apiRequest(`/sales/carts/${cart.id}/lines/${lineRef}`, {
          method: "DELETE",
        });
        setCart(updated);
        if (sameLineId(editingLineId, line.id)) {
          clearLineEntry();
        }
        if (sameLineId(selectedLineId, line.id)) {
          setSelectedLineId(null);
        }
        return;
      }

      const entryQty = cartLineEntryQtyForBaseQty(line, product, retailPackage, nextBaseQty);
      const computed = applyComputedPrice(
        product,
        entryQty,
        line.discount_given ?? 0,
        null,
        isRetailLine,
        !isRetailLine,
      );

      const ok = await commitCartLine({
        product,
        computed,
        incrementBaseQty: computed.baseQty,
        editingId: line.id,
        editingRef: cartLineRef(line),
        discount: line.discount_given ?? 0,
        clearEntry: false,
        successMessage: null,
        lineRetailStockFlagOverride: isRetailLine,
      });
      if (ok) {
        setSelectedLineId(line.id);
      }
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to update quantity");
    } finally {
      setLineBusy(false);
    }
  }

  async function removeSelectedLine() {
    if (!cart?.id || !cart?.lines?.length || !selectedLineId) return;
    const line = cart.lines.find((l) => sameLineId(l.id, selectedLineId));
    const lineRef = cartLineRef(line);
    if (!lineRef) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const updated = await apiRequest(`/sales/carts/${cart.id}/lines/${lineRef}`, {
        method: "DELETE",
      });
      setCart(updated);
      if (sameLineId(editingLineId, selectedLineId)) {
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
    if (!cart?.id || !cart?.lines?.length) return;
    if (!window.confirm("Clear all items from the cart?")) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      await apiRequest(`/sales/carts/${cart.id}/lines`, { method: "DELETE" });
      await refreshCart(cart.id);
      clearLineEntry();
      setSelectedLineId(null);
      setStatusMessage("Cart cleared.");
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      });
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
    setEditingLineRef(null);
  }

  function completeLeaveNavigation(href) {
    setLeaveGuardOpen(false);
    const target = href ?? pendingLeaveHrefRef.current;
    pendingLeaveHrefRef.current = null;
    if (!target) return;
    router.push(target);
  }

  async function clearCartAndLeave() {
    const href = pendingLeaveHrefRef.current;
    if (!cart?.id || !cart?.lines?.length) {
      completeLeaveNavigation(href);
      return;
    }
    setLeaveGuardBusy(true);
    setStatusMessage(null);
    try {
      await apiRequest(`/sales/carts/${cart.id}/lines`, { method: "DELETE" });
      await refreshCart(cart.id);
      clearLineEntry();
      setSelectedLineId(null);
      completeLeaveNavigation(href);
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to clear cart");
      setLeaveGuardOpen(false);
    } finally {
      setLeaveGuardBusy(false);
    }
  }

  useEffect(() => {
    // Backoffice POS lives inside AppShell — never block sidebar, topbar, or workspace switching.
    if (!standalone) return undefined;
    if (!cartHasReservedItems || leaveGuardOpen) return undefined;

    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);

    function shouldIgnoreLeaveIntercept(target) {
      if (!(target instanceof Element)) return true;
      // AppShell chrome is outside `.pos-workspace`; standalone POS fills the viewport.
      if (!target.closest(".pos-workspace")) return true;
      return Boolean(
        target.closest("[data-app-shell-nav]")
        || target.closest("[data-sidebar-subnav-root]")
        || target.closest("[data-pos-leave-ignore]")
        || target.closest("[data-pos-leave-guard]"),
      );
    }

    function isPosRoute(pathname) {
      return (
        pathname === "/sales/pos"
        || pathname.startsWith("/sales/pos/")
        || pathname === "/pos"
        || pathname.startsWith("/pos/")
      );
    }

    function onDocumentClick(e) {
      if (shouldIgnoreLeaveIntercept(e.target)) return;

      const anchor = e.target.closest("a[href]");
      if (!anchor || anchor.dataset.posLeaveIgnore === "true") return;
      if (shouldIgnoreLeaveIntercept(anchor)) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      let pathname = href;
      try {
        pathname = new URL(href, window.location.href).pathname;
      } catch {
        return;
      }
      if (isPosRoute(pathname)) return;

      e.preventDefault();
      e.stopPropagation();
      pendingLeaveHrefRef.current = href.startsWith("/") ? href : pathname;
      setLeaveGuardOpen(true);
    }

    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [standalone, cartHasReservedItems, leaveGuardOpen]);

  async function handleEditSelectedLine(lineId = selectedLineId) {
    if (!lineId || !cart?.lines?.length || busy) return;
    const line = cart.lines.find((l) => sameLineId(l.id, lineId));
    if (!line) return;

    setBusy(true);
    setStatusMessage(null);
    try {
      const product = await resolveProductByCode(line.product_code);
      if (!product) {
        setStatusMessage("Could not load product for this line.");
        return;
      }

      const retailPackage = retailByCode[line.product_code] ?? null;
      const isRetailLine = Number(line.on_wholesale_retail) === 1;
      setEditingLineId(line.id);
      setEditingLineRef(cartLineRef(line));
      setSelectedLineId(line.id);
      setSellWholesale(!isRetailLine);
      setSelectedProductCode(line.product_code);
      setSelectedProduct(product);
      setSearchQuery(product.product_name ?? line.product_code);
      setUnitPriceTouched(true);
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
    } finally {
      setBusy(false);
    }
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
    const rows = await mapWithConcurrency(
      codes,
      (code) =>
        apiRequest(`/products/${encodeURIComponent(code)}`, {
          searchParams: productBranchParams,
        }).catch(() => null),
      4,
    );
    const next = {};
    for (const row of rows) {
      if (row?.product_code) {
        next[row.product_code] = enrichProductForLpo(row, uomMap, vatMap);
      }
    }
    setProductByCode((prev) => ({ ...prev, ...next }));
  }

  async function handleRefresh() {
    setBusy(true);
    try {
      await refreshCapabilities();
      const { uomMap, vatMap } = await loadPosReferenceData();
      const activeCart = cart?.id ? await refreshCart(cart.id) : await loadCashierCart();
      await reloadCartProductMeta(activeCart?.lines, uomMap, vatMap);
      clearLineEntry();
      setStatusMessage("Refreshed — settings and products reloaded.");
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus({ preventScroll: true });
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

  function promptTillFloatSession(message) {
    setPaymentError(message);
    setSessionError(null);
    setFloatModalOpen(true);
    loadPosTillMeta();
  }

  async function handleCheckout(body) {
    if (!cart?.id) return null;
    if (requireTillFloat && !activeSession) {
      promptTillFloatSession(
        suspendedSession
          ? "Resume your suspended session before completing sales."
          : "Open a till session and declare your operating float before completing sales.",
      );
      return null;
    }
    setBusy(true);
    setPaymentError(null);
    try {
      const sale = await apiRequest(`/sales/carts/${cart.id}/checkout`, {
        method: "POST",
        body: {
          ...body,
          sales_workspace: salesWorkspace,
          submit_kra: shouldSubmitKraOnCheckout(
            capabilities?.module_settings,
            capabilities,
            cartSummary?.total,
          ),
          ...(requireTillFloat && floatSessionId ? { float_session_id: floatSessionId } : {}),
        },
      });
      setCompletedSale(sale);
      rememberCompletedPosOrder(sale);
      setCart(null);
      setSelectedLineId(null);
      try {
        if (posSalesConfig.showCheckoutOnCreate) {
          const copies = Number(posSalesConfig.receiptCopies ?? 1) || 1;
          for (let i = 0; i < copies; i++) {
            printSaleOrder(sale, {
              moduleSettings: capabilities?.module_settings,
              organizationName: capabilities?.profile_label,
              uomById,
            });
          }
        }
      } catch (printErr) {
        // non-fatal; printing failures shouldn't block checkout
        // eslint-disable-next-line no-console
        console.error("Receipt print failed", printErr);
      }
      return sale;
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Checkout failed";
      setPaymentError(message);
      if (
        requireTillFloat &&
        /operating float|till session/i.test(message)
      ) {
        setFloatModalOpen(true);
        loadPosTillMeta();
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleMpesaOrderComplete(updatedCart) {
    const payNow = Number(updatedCart?.mpesa_payment_amount ?? cart?.mpesa_payment_amount ?? 0);
    if (payNow <= 0) return;

    const total = cartSummary.amountDue + payNow;
    const status = resolveCheckoutStatus({
      channel,
      isCredit: false,
      payNow,
      total,
      workflow: channelWorkflow,
      paymentMethodCode: "MPESA",
      allowPartialPayment: posSalesConfig.payment.allowPartialPayment,
    });
    const body = {
      pay_now: payNow,
      payment_method_code: "MPESA",
      payment_reference: updatedCart?.mpesa_transaction_code ?? cart?.mpesa_transaction_code ?? null,
      status,
      is_credit_sale: false,
      deduct_stock: true,
    };

    if (posSalesConfig.enableCheckoutCustomerName) {
      body.customer_name_override = "Walk-in";
    }

    const sale = await handleCheckout(body);
    if (sale) {
      clearLineEntry();
      await loadCashierCart();
      if (!standalone) {
        setStatusMessage(
          `Order #${sale.order_num} completed — M-Pesa ${formatSaleKes(payNow)} received. Ready for next order.`,
        );
      } else {
        setStatusMessage(null);
      }
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }

  async function handleContinueNextOrder() {
    setPaymentOpen(false);
    setPaymentError(null);
    clearLineEntry();
    setBusy(true);
    try {
      await loadCashierCart();
      if (!standalone) {
        setStatusMessage(
          completedSale?.order_num
            ? `Ready for next order — previous order #${completedSale.order_num}.`
            : "Ready for next order.",
        );
      } else {
        setStatusMessage(null);
      }
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to start next order");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOrder({ walkIn, walkInName, customer, hold = false } = {}) {
    if (!cart?.id) return;
    if (!hold && posSalesConfig.showCheckoutOnCreate) {
      setSaveOrderError("Save order is disabled while checkout on create order is enabled.");
      return;
    }
    setBusy(true);
    setSaveOrderError(null);
    setStatusMessage(null);
    try {
      const body = {
        status: hold ? "held" : resolveSaveOrderStatus({ channel, workflow: channelWorkflow }),
        pay_now: 0,
        is_credit_sale: false,
        deduct_stock: true,
        save_only: true,
      };
      if (walkIn) {
        body.customer_name_override = walkInName?.trim() || "Walk-in";
      } else if (customer) {
        body.customer_num = customer.customer_num;
        body.customer_name_override = customer.customer_name;
      }
      const sale = await apiRequest(`/sales/carts/${cart.id}/checkout`, {
        method: "POST",
        body: {
          ...body,
          sales_workspace: salesWorkspace,
          ...(requireTillFloat && floatSessionId ? { float_session_id: floatSessionId } : {}),
        },
      });
      setCompletedSale(sale);
      setSaveOrderOpen(false);
      clearLineEntry();
      setSelectedLineId(null);
      await loadCashierCart();
      const who = walkIn
        ? walkInName?.trim() || "Walk-in"
        : customer?.customer_name;
      const whoSuffix = who ? ` for ${who}` : "";
      setStatusMessage(
        hold
          ? `Order held${whoSuffix} — #${sale.order_num}. Ready for next sale.`
          : `Order saved${whoSuffix} — #${sale.order_num} (${sale.status}). Ready for next sale.`,
      );
      if (hold) {
        await loadHeldOrdersCount();
      }
    } catch (e) {
      setSaveOrderError(
        e instanceof ApiError ? e.message : hold ? "Failed to hold order" : "Failed to save order",
      );
    } finally {
      setBusy(false);
    }
  }

  function openSaveOrderDialog(mode) {
    setSaveOrderError(null);
    setOrderDialogMode(mode);
    if (!posSalesConfig.enableCheckoutCustomerName) {
      void handleSaveOrder({ hold: mode === "hold" });
      return;
    }
    setSaveOrderOpen(true);
  }

  const focusProductSearch = useCallback(() => {
    clearLineEntry();
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select?.();
    });
  }, []);

  async function handleNewOrder() {
    if (busy) return;
    if (cart?.lines?.length) {
      const ok = window.confirm("Start a new order? The current cart will be cleared.");
      if (!ok) return;
      setBusy(true);
      try {
        await apiRequest(`/sales/carts/${cart.id}/lines`, { method: "DELETE" });
        await refreshCart(cart.id);
      } catch (e) {
        setStatusMessage(e instanceof ApiError ? e.message : "Failed to clear cart");
        setBusy(false);
        return;
      }
    }
    setPaymentOpen(false);
    setPaymentError(null);
    setCompletedSale(null);
    clearLineEntry();
    setSelectedLineId(null);
    setBusy(true);
    try {
      await loadCashierCart();
      setStatusMessage("New order started.");
      focusProductSearch();
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to start new order");
    } finally {
      setBusy(false);
    }
  }

  async function handlePrintReceipt() {
    const sale = completedSale;
    if (!sale?.id) {
      setStatusMessage("No completed order to print. Complete payment first (F10).");
      return;
    }
    try {
      const copies = Number(posSalesConfig.receiptCopies ?? 1) || 1;
      for (let i = 0; i < copies; i++) {
        printSaleOrder(sale, {
          moduleSettings: capabilities?.module_settings,
          organizationName: capabilities?.profile_label,
          uomById,
        });
      }
      setStatusMessage(`Reprinting order #${sale.order_num}.`);
    } catch {
      setStatusMessage("Receipt print failed.");
    }
  }

  async function restoreOrderForEdit(saleId, { replace = false } = {}) {
    setBusy(true);
    setOrderEditError(null);
    try {
      const restoredCart = await apiRequest(`/sales/orders/${saleId}/restore-to-cart`, {
        method: "POST",
        body: { replace },
      });
      setCart(restoredCart);
      setSelectedLineId(null);
      setEditingLineId(null);
      setEditingLineRef(null);
      setPaymentOpen(false);
      setCompletedSale(null);
      const orderNum = restoredCart?.held_order_num ?? restoredCart?.next_order_num;
      if (orderNum != null) {
        setEditOrderNo(String(orderNum));
        const saleIdNum = Number(saleId);
        setSessionPosOrders((prev) => {
          const entry = { id: saleIdNum, order_num: orderNum };
          const next = [entry, ...prev.filter((row) => row.id !== entry.id)];
          return next.slice(0, 40);
        });
        setEditBrowseIndex(0);
      }
      const label = restoredCart?.held_order_num ?? saleId;
      setStatusMessage(`Order #${label} loaded for editing — update lines and complete checkout.`);
    } catch (e) {
      const message = dedupeErrorMessage(e instanceof ApiError ? e.message : "Could not load order for editing");
      if (!replace && message.toLowerCase().includes("already has items")) {
        const ok = window.confirm(
          "Your cart already has items. Replace them with this order?",
        );
        if (ok) {
          setBusy(false);
          return restoreOrderForEdit(saleId, { replace: true });
        }
      }
      setOrderEditError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEditByOrderNumber(orderNum) {
    const trimmed = String(orderNum ?? "").trim();
    if (!trimmed) return;

    setOrderEditError(null);
    setBusy(true);
    try {
      const res = await apiRequest("/sales", {
        searchParams: {
          per_page: 25,
          channel: "pos",
          q: trimmed,
          with_items: 0,
        },
      });
      const match = (res.data ?? []).find(
        (row) => String(row.order_num) === trimmed && (row.channel ?? "pos") === "pos",
      );
      if (!match?.id) {
        setOrderEditError(`No POS order found with number ${trimmed}.`);
        return;
      }
      await restoreOrderForEdit(match.id);
    } catch (e) {
      setOrderEditError(e instanceof ApiError ? dedupeErrorMessage(e.message) : "Order lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSelectedOrder() {
    const trimmed = editOrderNo.trim();
    if (!trimmed) return;
    const fromSession = sessionPosOrders.find((row) => String(row.order_num) === trimmed);
    if (fromSession?.id) {
      await restoreOrderForEdit(fromSession.id);
      return;
    }
    await handleEditByOrderNumber(trimmed);
  }

  function goPreviousOrder() {
    if (!canGoPreviousOrder) return;
    const nextIndex = editBrowseIndex + 1;
    const row = sessionPosOrders[nextIndex];
    if (!row) return;
    setEditBrowseIndex(nextIndex);
    setEditOrderNo(String(row.order_num));
    setOrderEditError(null);
  }

  function goNextOrder() {
    if (!canGoNextOrder) return;
    const nextIndex = editBrowseIndex - 1;
    const row = sessionPosOrders[nextIndex];
    if (!row) return;
    setEditBrowseIndex(nextIndex);
    setEditOrderNo(String(row.order_num));
    setOrderEditError(null);
  }

  function openCompletePayment() {
    if (!cart?.lines?.length || cartStockBlocked) return;
    setPaymentError(null);
    setPaymentOpen(true);
  }

  useEffect(() => {
    function isModalOpen() {
      return (
        paymentOpen
        || saveOrderOpen
        || heldOrdersOpen
        || leaveGuardOpen
        || priceCheckerOpen
        || floatModalOpen
        || floatDetailsOpen
        || xReportOpen
        || closeSessionOpen
        || zReportOpen
      );
    }

    function isTypingTarget(el) {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable;
    }

    function onKeyDown(e) {
      if (isModalOpen()) {
        if (e.key === "Escape") {
          if (priceCheckerOpen) setPriceCheckerOpen(false);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        focusProductSearch();
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (e.key === "F8") {
        e.preventDefault();
        void handleNewOrder();
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        setPriceCheckerOpen(true);
        return;
      }
      if (e.key === "F10") {
        e.preventDefault();
        if (posSalesConfig.showCheckoutOnCreate) openCompletePayment();
        return;
      }
      if (e.key === "F12" && posSalesConfig.enableRetailPricing) {
        e.preventDefault();
        setSellWholesale((prev) => !prev);
        return;
      }
      if (e.altKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        if (cart?.lines?.length && !cartStockBlocked) openSaveOrderDialog("hold");
        return;
      }
      if (e.altKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        if (activeSession) setFloatDetailsOpen(true);
        return;
      }
      if (e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        void handlePrintReceipt();
        return;
      }
      if (e.key === "Delete") {
        e.preventDefault();
        if (selectedLineId) void removeSelectedLine();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    paymentOpen,
    saveOrderOpen,
    heldOrdersOpen,
    leaveGuardOpen,
    priceCheckerOpen,
    floatModalOpen,
    floatDetailsOpen,
    xReportOpen,
    closeSessionOpen,
    zReportOpen,
    posSalesConfig.enableRetailPricing,
    posSalesConfig.showCheckoutOnCreate,
    focusProductSearch,
    cart?.lines?.length,
    cartStockBlocked,
    activeSession,
    selectedLineId,
    cart?.id,
    busy,
    completedSale,
    capabilities?.module_settings,
    capabilities?.profile_label,
    uomById,
    posSalesConfig.receiptCopies,
  ]);

  return (
    <div
      className={`pos-workspace relative flex h-full min-h-0 flex-col${
        standalone ? " pos-workspace-standalone" : " pos-workspace-backoffice"
      }`}
    >
      {standalone ? (
        <>
          <div className="pos-header shrink-0 shadow-sm">
            <div className="pos-header-bar flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 lg:px-5">
              <div className="shrink-0">
                <CentrixLogoHeader markSize={28} title={PRODUCT_NAME} />
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto px-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setHeldOrdersOpen(true)}
                  className={posHeaderBtnClassName}
                >
                  Held orders
                  {heldOrdersCount > 0 ? (
                    <span className="pos-header-action-badge">
                      {heldOrdersCount > 99 ? "99+" : heldOrdersCount}
                    </span>
                  ) : null}
                </button>
                {requireTillFloat && activeSession ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSessionError(null);
                        setFloatDetailsOpen(true);
                      }}
                      className={posHeaderBtnClassName}
                    >
                      Float details
                    </button>
                    <button
                      type="button"
                      disabled={busy || sessionBusy}
                      onClick={() => {
                        setSessionError(null);
                        setRecordExpenseOpen(true);
                      }}
                      className={posHeaderBtnClassName}
                    >
                      Record expense
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPriceCheckerOpen(true)}
                  className={posHeaderBtnClassName}
                >
                  Price checker
                </button>
                <button
                  type="button"
                  disabled={busy || !completedSale?.id}
                  title={
                    completedSale?.order_num
                      ? `Reprint order #${completedSale.order_num}`
                      : "Complete an order first"
                  }
                  onClick={() => void handlePrintReceipt()}
                  className={posHeaderBtnClassName}
                >
                  Reprint last receipt
                </button>
                {showStandaloneTillActions && requireTillFloat ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || sessionBusy}
                      title={
                        canUseSessionReports
                          ? "Interim session report (session stays open)"
                          : "Declare your operating float to print an X report"
                      }
                      onClick={handleStandaloneXReport}
                      className={posHeaderBtnClassName}
                    >
                      X report
                    </button>
                    <button
                      type="button"
                      disabled={busy || sessionBusy}
                      onClick={handleStandaloneZReport}
                      title={
                        canUseSessionReports
                          ? "Close session and print Z report"
                          : "Declare your operating float to print a Z report"
                      }
                      className={posHeaderBtnClassName}
                    >
                      Z report
                    </button>
                    <button
                      type="button"
                      disabled={busy || sessionBusy || !canUseSessionReports}
                      onClick={() => void handleSuspendSession()}
                      className={posHeaderBtnClassName}
                    >
                      Suspend
                    </button>
                  </>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <WorkspaceSwitcher />
                <ThemeToggle showLabel className="pos-header-theme-btn hidden sm:inline-flex" />
                <UserAccountMenu
                  showName={false}
                  triggerClassName="pos-header-action-btn inline-flex items-center rounded-md p-1"
                />
              </div>
            </div>
          </div>
        </>
      ) : null}

      {!requireTillFloat || activeSession ? null : suspendedSession ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-900">
            Session #{suspendedSession.id} is suspended — resume to continue selling.
          </p>
          <button
            type="button"
            disabled={sessionBusy}
            onClick={() => void handleResumeSession()}
            className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900 disabled:opacity-50"
          >
            Resume session
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>Declare your operating float to start selling on this till.</span>
          <button
            type="button"
            onClick={() => {
              setFloatModalOpen(true);
              loadPosTillMeta();
            }}
            className="shrink-0 rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900"
          >
            Declare float
          </button>
        </div>
      )}

      <OpenSessionModal
        open={
          canManageTillSession &&
          !activeSession &&
          !suspendedSession &&
          !sessionLoading &&
          !zReportOpen &&
          floatModalOpen &&
          (requireTillFloat || standalone)
        }
        onClose={() => {
          setSessionError(null);
          floatModalDismissedRef.current = true;
          setFloatModalOpen(false);
        }}
        embedded={!standalone}
        tills={posTills}
        branches={posBranches}
        user={user}
        openByTill={openByTill}
        preferredTillId={preferredTillId}
        pendingTillLabel={pendingTillSuggestion?.till_name ?? pendingTillSuggestion?.till_number ?? null}
        autoAssignTill
        requireTillFloat={requireTillFloat}
        onOpen={handlePosOpenSession}
        busy={sessionBusy || posTillMetaLoading}
        error={sessionError}
        title={requireTillFloat ? "Declare operating float" : "Open till session"}
        subtitle={
          requireTillFloat
            ? "Your till is assigned automatically (Till01, Till02, …). Each till belongs to one cashier. Enter the cash you are starting with."
            : "Start a till session without operating float."
        }
      />

      <FloatBreakdownModal
        open={floatDetailsOpen}
        onClose={() => {
          setSessionError(null);
          setFloatDetailsOpen(false);
        }}
        embedded={!standalone}
        session={activeSession}
        tillName={activeTill ? tillDisplayName(activeTill) : null}
        cashierName={user?.full_name ?? user?.username ?? null}
        canAddFloat={requireTillFloat}
        onAddFloat={handlePosAddFloat}
        addFloatBusy={sessionBusy}
        addFloatError={sessionError}
        onCashMovement={recordCashMovement}
        cashMovementBusy={sessionBusy}
        cashMovementError={sessionError}
      />

      <RecordSessionExpenseModal
        open={recordExpenseOpen}
        onClose={() => {
          setSessionError(null);
          setRecordExpenseOpen(false);
        }}
        embedded={!standalone}
        session={activeSession}
        tillName={activeTill ? tillDisplayName(activeTill) : null}
        cashierName={user?.full_name ?? user?.username ?? null}
        onRecordExpense={activeSession ? recordSessionExpense : null}
        busy={sessionBusy}
        error={sessionError}
      />

      <XReportModal
        open={xReportOpen}
        onClose={() => {
          setSessionError(null);
          setXReportOpen(false);
        }}
        session={activeSession}
        report={sessionReport}
        tillName={activeTill ? tillDisplayName(activeTill) : null}
        cashierName={posCashierName}
        showFloatBreakdown={requireTillFloat}
        organizationName={organizationName}
        loading={xReportLoading}
        error={sessionError}
        embedded={!standalone}
      />

      <CloseSessionModal
        open={closeSessionOpen}
        onClose={() => {
          setSessionError(null);
          setCloseSessionOpen(false);
        }}
        session={activeSession}
        sessionReport={sessionReport}
        closeSession={closeSession}
        busy={sessionBusy}
        error={sessionError}
        requireTillFloat={requireTillFloat}
        blindTillClose={blindTillClose}
        onClosed={handleSessionClosed}
        embedded={!standalone}
      />

      <ZReportModal
        open={zReportOpen}
        onClose={handleZReportClose}
        payload={zReportPayload}
        organizationName={organizationName}
        showFloatBreakdown={requireTillFloat}
        fallbackCashierName={posCashierName}
        fallbackTillName={zReportTillName}
        embedded={!standalone}
      />

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row${
          standalone ? " pos-standalone-frame" : " pos-backoffice-frame"
        }`}
      >
        {/* Left — line entry + payment options */}
        <div className="pos-left-panel flex min-h-0 w-full flex-col border-b border-[var(--theme-border)] bg-[var(--theme-page-bg)] lg:w-[min(100%,28rem)] lg:shrink-0 lg:border-b-0 lg:border-r xl:w-[32rem]">
          <div className="pos-search-panel shrink-0 border-b border-[var(--theme-border)] px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-left text-sm font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
                Scan or search items
              </p>
              {activeOrderNum ? (
                <span className="shrink-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-page-bg)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--theme-text)]">
                  Order #{activeOrderNum}
                </span>
              ) : null}
            </div>
            {!standalone && statusMessage ? (
              <p className="theme-subtext mt-2 truncate text-xs">{statusMessage}</p>
            ) : null}
            <div className="mt-3 flex flex-col gap-2 text-sm">
              {posSalesConfig.perLineStockRouting ? (
                <span className="text-[var(--theme-text-muted)]">
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
                <span className="text-[var(--theme-text-muted)]">
                  Stock source: <strong>{posSalesConfig.stockSourceLabel}</strong>
                </span>
              ) : null}
              {posSalesConfig.enableRetailPricing ? (
                <label className="flex cursor-pointer items-center gap-1.5 font-medium text-[var(--theme-accent-text)]">
                  <input
                    type="checkbox"
                    checked={!sellWholesale}
                    onChange={(e) => setSellWholesale(!e.target.checked)}
                  />
                  Sell at retail prices
                  <span className="theme-subtext text-[10px] font-normal">(F12)</span>
                  {retailPricingSession ? (
                    <span className="rounded bg-[var(--theme-primary-subtle)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--theme-text)]">
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
                    <span className="text-xs font-medium text-[var(--theme-accent-text)]">
                      Select Route to Apply Markup
                    </span>
                  ) : null}
                  {lockedToRouteOrder || isRouteOrder ? (
                    <select
                      className={`${SELECT_CLASS} min-w-[10rem] px-2 py-1 text-xs`}
                      value={selectedRouteId}
                      disabled={busy}
                      onChange={(e) => void handleRouteChange(e.target.value)}
                    >
                      <option value="">Select route…</option>
                      {routes.map((route) => (
                        <option key={route.id} value={route.id}>
                          {route.route_name}
                          {Number(route.route_markup_price ?? 0) > 0
                            ? ` (+${Number(route.route_markup_price).toLocaleString()} markup)`
                            : ""}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Line entry form */}
          <div className="pos-line-entry grid shrink-0 grid-cols-2 gap-x-4 gap-y-4 border-b border-[var(--theme-border)] p-4 text-sm">
            {enablePosOrderEdit ? (
              <div className="col-span-2">
                <PosOrderEditBar
                  enabled
                  busy={busy}
                  orderNo={editOrderNo}
                  onOrderNoChange={setEditOrderNo}
                  onSubmit={() => void handleEditSelectedOrder()}
                  onPrevious={goPreviousOrder}
                  onNext={goNextOrder}
                  canGoPrevious={canGoPreviousOrder}
                  canGoNext={canGoNextOrder}
                  hasOrders={hasSessionOrders}
                  error={orderEditError}
                />
              </div>
            ) : null}
            <div className="col-span-2 space-y-4">
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
              <div className="space-y-1">
                <PosLabel>Description</PosLabel>
                <input
                  className={fieldInput}
                  value={lineForm.description}
                  readOnly
                  placeholder="Select from search"
                />
              </div>
            </div>
            <div className="col-span-2 space-y-1">
              <PosLabel>Package</PosLabel>
              <input
                className={`${INPUT_READONLY_CLASS} px-2 py-1.5`}
                value={lineForm.package}
                readOnly
                placeholder="Set from product UOM"
              />
              {selectedProduct && lineForm.package ? (
                <p className="theme-subtext mt-0.5 text-[10px]">
                  Set automatically from UOM and retail package tiers
                </p>
              ) : null}
            </div>
            <div className="col-span-2 space-y-1">
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
                <p className="theme-subtext mt-0.5 text-[10px]">{qtyFieldMeta.hint}</p>
              ) : null}
              {stockDeductionHint ? (
                <p className="mt-0.5 text-[10px] font-medium text-[var(--theme-accent-text)]">
                  {stockDeductionHint}
                </p>
              ) : null}
              {lineStockMessage ? (
                <p className="mt-0.5 text-[10px] font-medium text-red-700">{lineStockMessage}</p>
              ) : null}
            </div>
            {allowDiscounts ? (
              <div className="col-span-2 space-y-1">
                <PosLabel>Discount</PosLabel>
                <input
                  ref={discountInputRef}
                  className={`${fieldInput} font-semibold text-[var(--theme-primary)] disabled:cursor-not-allowed theme-input-readonly`}
                  type="number"
                  min="0"
                  step="any"
                  value={lineForm.discount}
                  readOnly={!canEditManualLineDiscount()}
                  disabled={busy || !selectedProduct || !canEditManualLineDiscount()}
                  onChange={(e) => setLineForm((p) => ({ ...p, discount: e.target.value }))}
                  onKeyDown={canEditManualLineDiscount() ? handleDiscountEnter : undefined}
                />
                {productHasConfiguredDiscount(selectedProduct) ? (
                  <p className="theme-subtext mt-0.5 text-[10px]">
                    From product: {formatProductDiscountLabel(selectedProduct)}
                  </p>
                ) : allowEditLineDiscount ? (
                  <p className="theme-subtext mt-0.5 text-[10px]">
                    Enter a manual discount for this line. Press Enter to continue.
                  </p>
                ) : (
                  <p className="theme-subtext mt-0.5 text-[10px]">
                    Applied automatically from product settings.
                  </p>
                )}
              </div>
            ) : null}
            <div className="col-span-2 space-y-1">
              <PosLabel>{unitPriceLabel}</PosLabel>
              <input
                ref={unitPriceRef}
                className={`${fieldInput} ${!allowEditUnitPrice ? "theme-input-readonly cursor-not-allowed" : ""}`}
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
            <div className="col-span-2 mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || lineBusy || addLineBlocked}
                onClick={handleAddLine}
                className="theme-primary-btn pos-add-line-btn flex min-w-[8rem] flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold uppercase shadow-sm disabled:opacity-50"
              >
                <span className="text-base">{editingLineId ? "✓" : "+"}</span>
                {editingLineId ? "Update" : "Add"}
              </button>
              {editingLineId ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancelEdit}
                  className="theme-secondary-btn flex min-w-[7rem] flex-1 items-center justify-center gap-1 rounded py-2 text-xs font-bold uppercase disabled:opacity-50"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  void handleRefresh();
                }}
                className="theme-secondary-btn pos-refresh-btn flex min-w-[7rem] flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold uppercase shadow-sm disabled:opacity-50"
              >
                <span className="text-base leading-none" aria-hidden>
                  ↻
                </span>{" "}
                Refresh
              </button>
            </div>
          </div>

          {showCartPaymentPrompts ? (
          <div className="pos-payment-panel shrink-0 px-4 pb-4">
          <PosCartPaymentOptions
            cart={cart}
            busy={busy}
            amountDue={cartSummary.amountDue}
            enableVouchers={enableVouchers}
            enablePoints={enableRedeemablePoints}
            enableMpesa={enableMpesaOnPos}
            enableStkPush={enableStkPushOnPos}
            embedded={!standalone}
            onCartUpdated={setCart}
            onMessage={setStatusMessage}
            onPaymentApplied={() => setPaymentOpen(true)}
            onCompleteOrder={(updatedCart) => void handleMpesaOrderComplete(updatedCart)}
          />
          </div>
          ) : null}
          </div>
        </div>

        {/* Right — cart grid */}
        <div className="pos-cart-panel flex min-h-0 flex-1 flex-col bg-[var(--theme-page-bg)]">
          {showCartToolbar ? (
          <div className="pos-cart-toolbar flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--theme-border)] px-4 py-2.5">
            {!standalone ? (
              <>
                {heldOrdersCount > 0 ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setHeldOrdersOpen(true)}
                    className={cartToolbarBtnClassName}
                  >
                    Held orders
                    <span className="inline-flex min-w-[1rem] items-center justify-center rounded-full bg-[var(--theme-primary)] px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                      {heldOrdersCount > 99 ? "99+" : heldOrdersCount}
                    </span>
                  </button>
                ) : null}
                {requireTillFloat && activeSession ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSessionError(null);
                        setFloatDetailsOpen(true);
                      }}
                      className={cartToolbarBtnClassName}
                    >
                      Float details
                    </button>
                    <button
                      type="button"
                      disabled={busy || sessionBusy}
                      onClick={() => {
                        setSessionError(null);
                        setRecordExpenseOpen(true);
                      }}
                      className={cartToolbarBtnClassName}
                    >
                      Record expense
                    </button>
                  </>
                ) : null}
                <Link
                  href={buildExpensesHref()}
                  data-pos-leave-ignore="true"
                  className={cartToolbarBtnClassName}
                >
                  Expenses
                </Link>
              </>
            ) : null}
            {!standalone && requireTillFloat && activeSession && hasPosTill ? (
              <>
                <button
                  type="button"
                  disabled={busy || sessionBusy}
                  onClick={() => void handleOpenXReport()}
                  className={cartToolbarBtnClassName}
                >
                  X report
                </button>
                <button
                  type="button"
                  disabled={busy || sessionBusy}
                  onClick={() => void handleOpenCloseSession()}
                  className={cartToolbarBtnClassName}
                >
                  Close session
                </button>
                <button
                  type="button"
                  disabled={busy || sessionBusy}
                  onClick={() => void handleSuspendSession()}
                  className={cartToolbarBtnClassName}
                >
                  Suspend
                </button>
              </>
            ) : null}
          </div>
          ) : null}
          <div
            className={`pos-cart-table-wrap min-h-0 flex-1 overflow-auto${
              showCartToolbar ? " p-3" : " pos-cart-table-wrap--flush"
            }`}
          >
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--theme-page-bg)]">
                <tr className="theme-table-head-row border-b border-[var(--theme-border)] text-left text-xs font-bold uppercase tracking-wide">
                  <th className="px-3 py-2.5">Scan code</th>
                  <th className="px-3 py-2.5">Description</th>
                  {showCartLineType ? (
                    <th className="px-3 py-2.5">Type</th>
                  ) : null}
                  <th className="px-3 py-2.5">Package</th>
                  <th className="px-3 py-2.5 text-center">Qty</th>
                  <th className="px-3 py-2.5 text-right">Unit price</th>
                  {allowDiscounts ? (
                    <th className="px-3 py-2.5 text-right">Discount</th>
                  ) : null}
                  <th className="px-3 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {!cart?.lines?.length ? (
                  <tr>
                    <td colSpan={cartTableColSpan} className="theme-subtext py-12 text-center">
                      No items in cart
                    </td>
                  </tr>
                ) : (
                  cart.lines.map((line) => {
                    const selected = sameLineId(selectedLineId, line.id);
                    const editing = sameLineId(editingLineId, line.id);
                    const productMeta = productByCode[line.product_code];
                    const uom = productMeta?.uom;
                    const isRetailLine = Number(line.on_wholesale_retail) === 1;
                    const qtyAdjust = productMeta
                      ? cartLineQtyAdjustState(line, productMeta, 0)
                      : { canDecrease: false, canIncrease: false };
                    return (
                      <tr
                        key={line.id}
                        onClick={() => setSelectedLineId(line.id)}
                        onDoubleClick={() => handleEditSelectedLine(line.id)}
                        className={`cursor-pointer border-b border-[var(--theme-border)] ${
                          editing
                            ? "bg-amber-50 ring-1 ring-inset ring-amber-300"
                            : selected
                              ? "bg-[var(--theme-primary-subtle)]"
                              : "hover:bg-[var(--theme-hover)]"
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-xs">
                          {line.product_code}
                          <span className="theme-subtext mt-0.5 block text-[10px] font-normal">
                            #{line.line_no ?? line.id}
                          </span>
                        </td>
                        <td className="px-3 py-2">{line.product_name}</td>
                        {showCartLineType ? (
                          <td className="px-3 py-2 text-xs">
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
                        ) : null}
                        <td className="px-3 py-2 text-xs">
                          {uom
                            ? uomWholesaleConversionExample(uom)
                            : (line.uom ?? productMeta?.packaging_label ?? "—")}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div
                            className="flex items-center justify-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={busy || lineBusy || !qtyAdjust.canDecrease}
                              onClick={() => void adjustCartLineQuantity(line, -1)}
                              className="theme-secondary-btn flex h-6 w-6 items-center justify-center rounded text-sm font-bold disabled:opacity-40"
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="theme-heading min-w-[3.5rem] text-center text-[11px] font-medium">
                              {uom
                                ? formatPosCartQty(line.quantity, uom)
                                : formatMixedStockDisplay(line.quantity, 1).text}
                            </span>
                            <button
                              type="button"
                              disabled={busy || lineBusy || !qtyAdjust.canIncrease}
                              onClick={() => void adjustCartLineQuantity(line, 1)}
                              className="theme-secondary-btn flex h-6 w-6 items-center justify-center rounded text-sm font-bold disabled:opacity-40"
                              aria-label="Increase quantity"
                              title={
                                !qtyAdjust.canIncrease && !allowNegativeStock
                                  ? "Not enough stock"
                                  : undefined
                              }
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {Number(
                            cartLineDisplayUnitPrice(line, uom, isRetailLine),
                          ).toLocaleString()}
                        </td>
                        {allowDiscounts ? (
                          <td className="px-3 py-2 text-right">
                            {Number(line.discount_given ?? 0).toLocaleString()}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-right font-medium">
                          {Number(line.amount).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="pos-cart-summary shrink-0 border-t border-[var(--theme-border)] px-4 py-4">
            <div className="mb-3 border-b border-[var(--theme-border)] pb-3 text-sm">
              {enableOrderDiscount ? (
                <div className="theme-panel mb-2.5 rounded-lg border border-[var(--theme-primary)]/20 px-3 py-2.5">
                  <div className="grid grid-cols-12 items-center gap-3">
                    <label
                      htmlFor="pos-order-discount"
                      className="col-span-8 flex items-center gap-2.5"
                    >
                      <span
                        className="theme-secondary-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--theme-primary)]/20 text-[var(--theme-primary)] shadow-sm"
                        aria-hidden="true"
                      >
                        <svg
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
                          <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
                        </svg>
                      </span>
                      <span className="theme-heading text-sm font-bold leading-tight tracking-tight">
                        Give Full Order Discount
                      </span>
                    </label>
                    <div className="col-span-4">
                      <input
                        id="pos-order-discount"
                        type="number"
                        min="0"
                        step="any"
                        disabled={busy || !cart?.lines?.length}
                        value={orderDiscountDraft}
                        onChange={(e) => setOrderDiscountDraft(e.target.value)}
                        onBlur={() => void commitOrderDiscount()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void commitOrderDiscount();
                          }
                        }}
                        placeholder="0.00"
                        aria-label="Full order discount amount"
                        className={`${compactAmountInput} theme-heading font-bold placeholder:font-medium disabled:cursor-not-allowed theme-input-readonly`}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="space-y-3 pt-1">
                <div className="theme-text-muted flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatSaleKes(cartSummary.subtotal)}</span>
                </div>
                {allowDiscounts || enableOrderDiscount ? (
                  <div className="theme-text-muted flex justify-between">
                    <span>Line discounts</span>
                    <span>
                      {cartSummary.lineDiscounts > 0
                        ? `−${formatSaleKes(cartSummary.lineDiscounts)}`
                        : formatSaleKes(0)}
                    </span>
                  </div>
                ) : null}
                {((enableOrderDiscount || enableVouchers) && cartSummary.orderDiscount > 0) ? (
                  <div className="theme-text-muted flex justify-between">
                    <span>Order discount</span>
                    <span>−{formatSaleKes(cartSummary.orderDiscount)}</span>
                  </div>
                ) : null}
                {cartSummary.voucherPayment > 0 ? (
                  <div className="theme-text-muted flex justify-between">
                    <span>Voucher payment</span>
                    <span>−{formatSaleKes(cartSummary.voucherPayment)}</span>
                  </div>
                ) : null}
                {cartSummary.pointsPayment > 0 ? (
                  <div className="theme-text-muted flex justify-between">
                    <span>Points redeemed</span>
                    <span>−{formatSaleKes(cartSummary.pointsPayment)}</span>
                  </div>
                ) : null}
                {cartSummary.mpesaPayment > 0 ? (
                  <div className="theme-text-muted flex justify-between">
                    <span>M-Pesa payment</span>
                    <span>−{formatSaleKes(cartSummary.mpesaPayment)}</span>
                  </div>
                ) : null}
                <div className="theme-text-muted flex justify-between">
                  <span>VAT</span>
                  <span>{formatSaleKes(cartSummary.vat)}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--theme-border)] pt-3 text-base font-bold text-[var(--theme-accent-text)]">
                  <span>{cartSummary.amountDue < cartSummary.total ? "Amount due" : "Total"}</span>
                  <span>
                    {formatSaleKes(
                      cartSummary.amountDue < cartSummary.total
                        ? cartSummary.amountDue
                        : cartSummary.total,
                    )}
                  </span>
                </div>
              </div>
              {cartSummary.amountDue < cartSummary.total ? (
                <div className="theme-subtext flex justify-between text-xs">
                  <span>Order total</span>
                  <span>{formatSaleKes(cartSummary.total)}</span>
                </div>
              ) : null}
            </div>
            <div className="pos-cart-actions grid grid-cols-3 gap-2 pt-2 sm:grid-cols-6">
              <PosActionButton
                label="Edit"
                title="Edit selected line"
                icon="✎"
                disabled={busy || !selectedLineId}
                onClick={() => handleEditSelectedLine()}
              />
              <PosActionButton
                label="Remove"
                title="Void selected line (Delete)"
                icon="−"
                disabled={busy || !selectedLineId}
                onClick={removeSelectedLine}
              />
              <PosActionButton
                label="Clear all"
                title="Clear all lines from cart"
                icon="⌫"
                iconClass="pos-cart-action-icon--warn"
                disabled={busy || !cart?.lines?.length}
                onClick={clearAllLines}
              />
              <PosActionButton
                label="Hold"
                title="Hold order (Alt+H)"
                icon="⏸"
                iconClass="pos-cart-action-icon--warn"
                disabled={busy || !cart?.lines?.length || cartStockBlocked}
                onClick={() => openSaveOrderDialog("hold")}
              />
              {posSalesConfig.showCheckoutOnCreate ? (
                <PosActionButton
                  label="Complete"
                  title="Complete payment (F10)"
                  icon="🛒"
                  iconClass="pos-cart-action-icon--complete"
                  disabled={busy || !cart?.lines?.length || cartStockBlocked}
                  onClick={() => {
                    setPaymentError(null);
                    setPaymentOpen(true);
                  }}
                />
              ) : (
                <PosActionButton
                  label="Save"
                  title="Save order"
                  icon="💾"
                  disabled={busy || !cart?.lines?.length || cartStockBlocked}
                  onClick={() => openSaveOrderDialog("save")}
                />
              )}
            </div>
            {cartStockBlocked ? (
              <p className="mt-2 text-right text-xs font-medium text-red-700">
                Cart exceeds available stock — reduce quantities or enable negative stock in admin.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <PosPaymentPanel
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        billTotal={cartSummary.amountDue}
        channel={channel}
        workflow={channelWorkflow}
        paymentConfig={checkoutPaymentConfig}
        prefillMpesaAmount={cart?.mpesa_payment_amount}
        prefillMpesaCode={cart?.mpesa_transaction_code}
        lockMpesaFields={Number(cart?.mpesa_payment_amount ?? 0) > 0}
        saving={busy}
        error={paymentError}
        onComplete={handleCheckout}
        onContinueNextOrder={handleContinueNextOrder}
        embedded={!standalone}
      />

      <PosSaveOrderDialog
        open={saveOrderOpen}
        mode={orderDialogMode}
        onClose={() => {
          setSaveOrderOpen(false);
          setSaveOrderError(null);
        }}
        saving={busy}
        error={saveOrderError}
        onSave={handleSaveOrder}
        saveStatusLabel={resolveSaveOrderStatusLabel({
          channel,
          workflow: channelWorkflow,
          hold: orderDialogMode === "hold",
        })}
        workflowPipeline={workflowPipelineSteps(channelWorkflow)}
        embedded={!standalone}
      />

      <PosHeldOrdersOverlay
        open={heldOrdersOpen}
        onClose={() => setHeldOrdersOpen(false)}
        onCountChange={setHeldOrdersCount}
        onRestored={(restoredCart) => {
          setCart(restoredCart);
          setSelectedLineId(null);
          setEditingLineRef(null);
          clearLineEntry();
          setStatusMessage("Held order restored to cart — ready to complete or edit.");
          void loadHeldOrdersCount();
        }}
        embedded={!standalone}
      />

      {standalone ? (
        <PosLeaveGuardDialog
          open={leaveGuardOpen}
          lineCount={cartLineCount}
          busy={leaveGuardBusy}
          onStay={() => {
            pendingLeaveHrefRef.current = null;
            setLeaveGuardOpen(false);
          }}
          onLeaveKeepReservation={() => completeLeaveNavigation()}
          onClearAndLeave={() => void clearCartAndLeave()}
        />
      ) : null}

      <PosPriceCheckerModal
        open={priceCheckerOpen}
        onClose={() => setPriceCheckerOpen(false)}
        sellWholesale={sellWholesale}
        retailByCode={retailByCode}
        uomById={uomById}
        vatById={vatById}
        branchId={user?.branch_id}
        embedded={!standalone}
      />

      {standalone ? (
        <PosStatusFooter
          user={user}
          organization={organization ?? capabilities?.organization}
        />
      ) : null}
    </div>
  );
}

export default PosScreen;
