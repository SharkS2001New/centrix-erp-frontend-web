"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/api-concurrency";
import { buildPageParams } from "@/lib/paginated-api";
import { CentrixLogoHeader } from "@/components/branding/centrix-logo";
import { PRODUCT_NAME } from "@/lib/branding";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
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
import {
  cartLineEnteredDiscountPerUnit,
  cartLinePackQtyForDiscount,
} from "@/lib/sale-line-items";
import { uomWholesaleConversionExample } from "@/lib/uom-packaging";
import {
  cartLineDisplayUnitPrice,
  computePosLine,
  defaultPosEntryQty,
  isPosRetailSession,
  lineDiscountPerUnit,
  lineDiscountTotal,
  posCartLineTypeLabel,
  posEntryQtyFromCartLine,
  posEntryQtyFromBaseQty,
  posCartLineEntryUnitLabel,
  posQuantityFieldMeta,
  resolvePosQuantity,
  posStockDeductionHint,
  posUnitPriceFieldLabel,
  usesPosRetailPricing,
} from "@/lib/pos-line";
import { formatMixedStockDisplay, formatPosCartQty } from "@/lib/stock-uom";
import {
  computeProductLineDiscount,
  formatProductDiscountLabel,
  productHasConfiguredDiscount,
} from "@/lib/product-discount";
import { lineProductVat } from "@/lib/sales-vat";
import { formatOrderNumber, formatSaleKes } from "@/lib/sales";
import { getChannelWorkflow, workflowPipelineSteps, checkoutCompleteStatuses, isCheckoutCompleteStatus, saleNeedsPaymentCollection } from "@/lib/order-workflow";
import {
  getPosSalesConfig,
  areSalesDiscountFeaturesEnabled,
  isDiscountApprovalEnabledForChannel,
  lineDiscountInputLabel,
  isWorkspaceTillFloatRequired,
  salesCartChannelForWorkspace,
  resolveCheckoutStatus,
  resolveSaveOrderStatus,
  resolveSaveOrderStatusLabel,
  existingOrderDiscountApprovalReason,
  cartNeedsDiscountApprovalAtCheckout,
  canGiveDiscountDirectly,
  showPosLineDiscountField,
  showPosOrderDiscountInput,
  resolveOrderPrintDocumentType,
} from "@/lib/sales-settings";
import {
  buildAdvisedDiscountMap,
  draftLinesMatchAdvisedDiscounts,
} from "@/lib/advised-discount-lines";
import { PosAdvisedDiscountPanel } from "./pos-advised-discount-panel";
import {
  DiscountApprovalReasonDialog,
} from "@/components/sales/discount-approval-reason-dialog";
import {
  isPlatformMpesaStkEnabled,
  isStkPushEnabled,
  shouldSubmitKraOnCheckout,
} from "@/lib/finance-settings";
import { useBlockingWait } from "@/lib/use-blocking-wait";
import { usePageNavigationReady } from "@/lib/use-page-navigation-ready";
import {
  fetchRetailPackagesForProductCodes,
  fetchUomsCached,
  fetchVatsCached,
} from "@/lib/reference-data-cache";
import { printSaleOrder } from "@/components/sales/sale-order-print";
import { LOCAL_PRINTING_ADMIN_LABEL } from "@/lib/local-printing";
import {
  canAdjustCartLineQuantity,
  cartLineEntryQtyForBaseQty,
  cartLineNextBaseQty,
  cartLineRetailStockFlag,
  cartLineStockAsRetail,
  posCartHasInsufficientStock,
  posLineRetailStockFlag,
  posLineStockLocation,
  posStockAvailability,
  posStockDisplayMode,
  posStockInsufficientMessage,
  posStockLocationLabel,
  productCartStockLabel,
} from "@/lib/pos-stock";
import {
  applyCartMutationResponse,
  applyOptimisticCartMutation,
  buildOptimisticCartLine,
  cartHasOptimisticLines,
  findMergeableCartLine,
  looksLikeProductCodeQuery,
  revertOptimisticCartMutation,
} from "@/lib/pos-cart-merge";
import { PosPaymentPanel } from "./pos-payment-panel";
import { PosProductSearch } from "./pos-product-search";
import { ClassicPosStatusFooter } from "./classic-pos-status-footer";
import { ClassicPosCartTable } from "./classic-pos-cart-table";
import { ClassicPosAutoHeldDialog } from "./classic-pos-auto-held-dialog";
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
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserAccountMenu } from "@/components/layout/user-account-menu";
import { PosStatusFooter } from "./pos-status-footer";
import { isClassicExternalPosLayout } from "@/lib/external-pos-layout";
import { usePosOfflineSupport } from "@/hooks/use-pos-offline-support";
import {
  abandonOfflineSaleEdit,
  adoptOnlineCartForOffline,
  beginOfflineSaleEdit,
  clearLocalPosCart,
  completeOfflineCashSale,
  getPosOfflineProduct,
  listOfflinePendingSalesForEdit,
  loadOrCreateLocalPosCart,
  parseOfflineSaleUuid,
  saveLocalPosCart,
  summarizeLocalPosCart,
  upsertLocalPosCartLine,
} from "@/lib/pos-offline";
import { newClientSaleUuid } from "@/lib/pos-offline-db";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { applyTheme, getTheme } from "@/lib/theme";
import {
  PosPriceCheckerModal,
} from "./pos-utility-modals";
import { filterByOrganization, orgListParams } from "@/lib/admin";
import { P } from "@/lib/permission-codes";
import { formDraftKey } from "@/stores/form-drafts";
import { useFormDraft } from "@/hooks/use-form-draft";
import {
  createBranchTill,
  indexOpenSessionsByTill,
  pickBranchTillForCashier,
  tillDisplayName,
} from "@/lib/pos-till";
import {
  extractSaleCustomerMemory,
  getPosOrderCustomer,
  getPosOrderCustomerName,
  rememberPosOrderCustomer,
  rememberPosOrderCustomerName,
} from "@/lib/pos-customer-name-memory";
import { roundLightStoresAmount } from "@/lib/pos-cash-round";
import {
  clearAutoHeldOrder,
  peekAutoHeldOrder,
  rememberAutoHeldOrder,
} from "@/lib/pos-auto-held";

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

function isEmptyPosLineForm(lineForm) {
  if (!lineForm) return true;
  return (
    !lineForm.product_code &&
    !lineForm.description &&
    !lineForm.package &&
    String(lineForm.quantity ?? "1") === "1" &&
    String(lineForm.discount ?? "0") === "0" &&
    !lineForm.unit_price
  );
}

function cartLineRef(line) {
  return line?.update_code ?? line?.id ?? null;
}

function sameLineId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

const POS_CART_REQUEST = { loading: false, reportIssues: false };
const POS_CHECKOUT_TIMEOUT_MS = 90_000;

function presentLocalOfflineCart(local) {
  if (!local) return null;
  return {
    ...local,
    id: local.id || "active",
    offline: true,
    channel: "pos",
    held_order_num: local.held_order_num ?? null,
    offline_client_sale_uuid: local.offline_client_sale_uuid ?? null,
    offline_edit_snapshot: local.offline_edit_snapshot ?? null,
    lines: (local.lines ?? []).map((line) => {
      const qty = Number(line.quantity ?? 0);
      const price = Number(line.unit_price ?? 0);
      return {
        ...line,
        id: line.client_line_id,
        update_code: line.client_line_id,
        amount: Math.round(qty * price * 100) / 100,
      };
    }),
  };
}

function isOfflinePendingSaleId(saleId) {
  return String(saleId ?? "").startsWith("offline:");
}

function offlinePrintOptions(sale, base = {}) {
  const offline =
    Boolean(sale?.offline_pending_sync) || isOfflinePendingSaleId(sale?.id);
  if (!offline) return base;
  return {
    ...base,
    skipSaleRefresh: true,
    skipSettingsRefresh: true,
    skipOrganizationRefresh: true,
    skipLogoFetch: true,
    skipNetworkLookups: true,
  };
}

function withPosCheckoutTimeout(promise, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), POS_CHECKOUT_TIMEOUT_MS);
    }),
  ]);
}

export function PosScreen({ standalone = false }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { user, capabilities, organization, hasPermission } = useAuth();
  const classicLayout = standalone && isClassicExternalPosLayout(capabilities);
  const {
    offlineMode,
    networkStatus,
    pendingSync,
    orderNumbersLeft,
    syncing: offlineSyncing,
    lastSyncMessage,
    searchOffline,
    refreshCounts: refreshOfflineCounts,
  } = usePosOfflineSupport({ enabled: standalone });
  const classicCurrencySettings = useMemo(
    () => mergeGeneralSettings(capabilities?.module_settings),
    [capabilities?.module_settings],
  );
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
  const { runBlockingTask, overlayNode: checkoutWaitOverlay } = useBlockingWait(
    "Completing sale…",
  );
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
        standalone,
        canAutoApprove: canGiveDiscountDirectly({ hasPermission }),
      }),
    [capabilities?.module_settings, capabilities?.allow_negative_stock, capabilities, standalone, hasPermission, user],
  );
  const allowDiscounts = posSalesConfig.allowDiscounts;
  const allowEditLineDiscount = posSalesConfig.allowEditLineDiscount;
  const showCartLineType = posSalesConfig.enableRetailPricing;
  const enableOrderDiscount = posSalesConfig.enableOrderDiscount;
  const discountApprovalActive = isDiscountApprovalEnabledForChannel(
    capabilities?.module_settings,
    "backoffice",
  );
  const discountFeaturesEnabled = areSalesDiscountFeaturesEnabled(capabilities?.module_settings);
  const canAutoApproveDiscount = canGiveDiscountDirectly({ hasPermission });
  const showLineDiscountField = showPosLineDiscountField(capabilities?.module_settings, {
    standalone,
  });
  const showOrderDiscountInput = showPosOrderDiscountInput(capabilities?.module_settings, {
    canAutoApprove: canAutoApproveDiscount,
  });
  const cartTableColSpan =
    6 + (showCartLineType ? 1 : 0) + (showLineDiscountField ? 1 : 0);
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
  const enablePosCashRounding = standalone && posSalesConfig.enablePosCashRounding;
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
  const [discountReasonDialogOpen, setDiscountReasonDialogOpen] = useState(false);
  const discountReasonResolverRef = useRef(null);

  const requestDiscountApprovalReason = useCallback(async (cart) => {
    const existing = existingOrderDiscountApprovalReason(cart);
    if (existing) return existing;
    return new Promise((resolve) => {
      discountReasonResolverRef.current = resolve;
      setDiscountReasonDialogOpen(true);
    });
  }, []);

  const closeDiscountReasonDialog = useCallback((result = null) => {
    setDiscountReasonDialogOpen(false);
    const resolve = discountReasonResolverRef.current;
    discountReasonResolverRef.current = null;
    resolve?.(result);
  }, []);

  const loadPosTillMeta = useCallback(async () => {
    if (!organizationId || !requireTillFloat) return;
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
  }, [organizationId, requireTillFloat, user?.branch_id, user?.id]);

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
    if (
      !(await confirm({
        title: "Suspend session",
        message: "Suspend this session? You can resume the same shift later — no new float is needed.",
        confirmLabel: "Suspend",
      }))
    ) {
      return;
    }
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
  const channel = salesCartChannelForWorkspace({
    standalone,
    sellFromShop,
    config: posSalesConfig,
  });
  const channelWorkflow = useMemo(
    () => getChannelWorkflow(capabilities, channel),
    [capabilities, channel],
  );

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

  const posUiDraftValue = useMemo(
    () => ({
      lineForm,
      sellFromShop,
      sellWholesale,
      isRouteOrder,
      selectedRouteId,
    }),
    [lineForm, sellFromShop, sellWholesale, isRouteOrder, selectedRouteId],
  );
  const posUiDraftValueRef = useRef(posUiDraftValue);
  useEffect(() => {
    posUiDraftValueRef.current = posUiDraftValue;
  }, [posUiDraftValue]);

  const applyPosUiDraft = useCallback((next) => {
    const value = typeof next === "function" ? next(posUiDraftValueRef.current) : next;
    if (!value || typeof value !== "object") return;
    if (value.lineForm && typeof value.lineForm === "object") {
      setLineForm({ ...EMPTY_LINE, ...value.lineForm });
      const code = value.lineForm.product_code?.trim?.() || value.lineForm.product_code;
      if (code) {
        setSelectedProductCode(code);
        setSelectedProduct((prev) =>
          prev?.product_code === code
            ? prev
            : {
                product_code: code,
                product_name: value.lineForm.description || code,
              },
        );
      }
    }
    if (typeof value.sellFromShop === "boolean") setSellFromShop(value.sellFromShop);
    if (typeof value.sellWholesale === "boolean") setSellWholesale(value.sellWholesale);
    if (typeof value.isRouteOrder === "boolean") setIsRouteOrder(value.isRouteOrder);
    if (value.selectedRouteId != null) setSelectedRouteId(String(value.selectedRouteId));
  }, []);

  const isPosUiDraftBaseline = useCallback(
    (value) => {
      if (!value) return true;
      return (
        isEmptyPosLineForm(value.lineForm) &&
        value.sellFromShop === true &&
        value.sellWholesale === true &&
        Boolean(value.isRouteOrder) === Boolean(lockedToRouteOrder) &&
        !value.selectedRouteId
      );
    },
    [lockedToRouteOrder],
  );

  const { clearDraft: clearPosUiDraft } = useFormDraft({
    draftKey: formDraftKey("pos-order", standalone ? "pos" : "backoffice"),
    value: posUiDraftValue,
    setValue: applyPosUiDraft,
    isBaseline: isPosUiDraftBaseline,
  });

  const [cart, setCart] = useState(null);
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [editingLineId, setEditingLineId] = useState(null);
  const [editingLineRef, setEditingLineRef] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lineBusy, setLineBusy] = useState(false);
  const [cartLineSaveFailed, setCartLineSaveFailed] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saveOrderOpen, setSaveOrderOpen] = useState(false);
  const [heldOrdersOpen, setHeldOrdersOpen] = useState(false);
  const [heldOrdersCount, setHeldOrdersCount] = useState(0);
  const [autoHeldPrompt, setAutoHeldPrompt] = useState(null);
  const [autoHeldBusy, setAutoHeldBusy] = useState(false);
  const [orderDialogMode, setOrderDialogMode] = useState("save");
  const [saveOrderError, setSaveOrderError] = useState(null);
  const [paymentError, setPaymentError] = useState(null);
  const [completedSale, setCompletedSale] = useState(null);
  /** Sale loaded for POS order edit — used for Reprint last receipt while revising. */
  const [editSourceSale, setEditSourceSale] = useState(null);
  const [receiptPrintStatus, setReceiptPrintStatus] = useState(null);
  const [orderEditError, setOrderEditError] = useState(null);
  const [sessionPosOrders, setSessionPosOrders] = useState([]);
  const [editOrderNo, setEditOrderNo] = useState("");
  const [editBrowseIndex, setEditBrowseIndex] = useState(0);
  const orderNoUserEditedRef = useRef(false);
  const [replacingLineId, setReplacingLineId] = useState(null);
  const [priceCheckerOpen, setPriceCheckerOpen] = useState(false);
  const [leaveGuardOpen, setLeaveGuardOpen] = useState(false);
  const [leaveGuardBusy, setLeaveGuardBusy] = useState(false);
  const pendingLeaveHrefRef = useRef(null);
  const floatModalDismissedRef = useRef(false);
  const cartRef = useRef(null);
  const cartSummaryRef = useRef(null);
  const productByCodeRef = useRef({});
  const retailByCodeRef = useRef({});
  function getRetailPackage(code) {
    if (!code) return null;
    const cached = retailByCodeRef.current[code];
    return cached !== undefined ? cached : null;
  }
  const cartCommitChainRef = useRef(Promise.resolve());
  const editAutosaveTimerRef = useRef(null);
  const editAutosaveInFlightRef = useRef(false);
  const skipEditAutosaveRef = useRef(false);

  const [orderDiscountDraft, setOrderDiscountDraft] = useState("");
  const [applyingAdvisedDiscounts, setApplyingAdvisedDiscounts] = useState(false);

  const attachDiscountApprovalReasonToCheckoutBody = useCallback(
    async (body) => {
      if (!cart || !discountFeaturesEnabled) return body;

      const savedReason = existingOrderDiscountApprovalReason(cart);
      const needsReason =
        cartNeedsDiscountApprovalAtCheckout(cart, {
          discountApprovalActive,
          canAutoApproveDiscount,
          moduleSettings: capabilities?.module_settings,
        }) || (cart.discount_approval_pending && !savedReason);

      if (needsReason) {
        const reason = await requestDiscountApprovalReason(cart);
        if (!reason) return null;
        return { ...body, discount_approval_reason: reason };
      }

      if (savedReason) {
        return { ...body, discount_approval_reason: savedReason };
      }

      return body;
    },
    [
      cart,
      capabilities?.module_settings,
      canAutoApproveDiscount,
      discountApprovalActive,
      discountFeaturesEnabled,
      requestDiscountApprovalReason,
    ],
  );

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

  const prefilledEditCustomerName = useMemo(() => {
    const orderNum = cart?.held_order_num;
    if (!orderNum) return "";
    return getPosOrderCustomerName(orderNum);
  }, [cart?.held_order_num]);

  const prefilledEditCustomerNum = useMemo(() => {
    const orderNum = cart?.held_order_num;
    if (!orderNum) return "";
    const { customerNum } = getPosOrderCustomer(orderNum);
    return customerNum != null ? String(customerNum) : "";
  }, [cart?.held_order_num]);

  const isCartEditSession = Boolean(cart?.held_order_num);
  const isEditableResubmit = Boolean(cart?.discount_resubmit && isCartEditSession);
  /** Modern POS: revising a completed order (hold disabled; Complete saves + prints). */
  const modernOrderEditLocked = Boolean(
    standalone && !classicLayout && isCartEditSession && !isEditableResubmit,
  );

  /** New-order mode: keep the # box on the next order number until the user edits or opens a receipt. */
  useEffect(() => {
    if (!classicLayout && !(standalone && enablePosOrderEdit)) return;
    if (orderNoUserEditedRef.current) return;
    if (isCartEditSession) {
      const held = cart?.held_order_num;
      if (held != null) setEditOrderNo(String(held));
      return;
    }
    if (cart?.next_order_num != null) {
      setEditOrderNo(String(cart.next_order_num));
    }
  }, [
    classicLayout,
    standalone,
    enablePosOrderEdit,
    isCartEditSession,
    cart?.held_order_num,
    cart?.next_order_num,
  ]);

  const advisedDiscountLines = useMemo(
    () => (Array.isArray(cart?.advised_discount_lines) ? cart.advised_discount_lines : []),
    [cart?.advised_discount_lines],
  );
  const advisedDiscountReady = Boolean(cart?.advised_discount_ready);
  const matchesAdvisedDiscounts = useMemo(
    () =>
      draftLinesMatchAdvisedDiscounts(cart?.lines ?? [], advisedDiscountLines, {
        getProductCode: (line) => line?.product_code,
        getDraftDiscount: (line) => {
          const product = productByCode[line?.product_code];
          const retailPackage = getRetailPackage(line?.product_code);
          if (product) {
            return cartLineEnteredDiscountPerUnit(line, product, retailPackage);
          }
          return lineDiscountPerUnit(line?.discount_given, line?.quantity);
        },
      }),
    [cart?.lines, advisedDiscountLines],
  );
  const cartResubmitMessage = useMemo(() => {
    if (!isEditableResubmit || !discountFeaturesEnabled) return null;
    if (advisedDiscountReady) {
      return isCartEditSession
        ? `Revising order #${cart.held_order_num}. Approver-advised discounts are applied — complete checkout to book.`
        : "Approver-advised discounts are applied. Complete checkout to book this order.";
    }
    if (advisedDiscountLines.length > 0) {
      return isCartEditSession
        ? `Revising order #${cart.held_order_num}. Apply advised discounts on each line, then complete checkout to resubmit.`
        : "Manager advised discounts per item. Apply them, then complete checkout to resubmit.";
    }
    return isCartEditSession
      ? `Revising order #${cart.held_order_num}. Update line discounts, then complete checkout to resubmit for approval.`
      : "Update line discounts, then complete checkout to resubmit for approval.";
  }, [
    advisedDiscountLines.length,
    advisedDiscountReady,
    cart?.held_order_num,
    discountFeaturesEnabled,
    isCartEditSession,
    isEditableResubmit,
  ]);

  function rememberCompletedPosOrder(sale) {
    if (!sale?.id || !enablePosOrderEdit) return;
    if (!isCheckoutCompleteStatus(sale.status, channelWorkflow, "pos") && !sale.offline_pending_sync) {
      return;
    }
    const entry = { id: sale.id, order_num: sale.order_num };
    setSessionPosOrders((prev) => {
      // Same order # after edit replaces the previous sale id so ← opens the live receipt.
      const next = [
        entry,
        ...prev.filter(
          (row) =>
            String(row.id) !== String(entry.id) &&
            String(row.order_num) !== String(entry.order_num),
        ),
      ];
      return next.slice(0, 40);
    });
    setEditBrowseIndex(0);
    setEditOrderNo(String(sale.order_num ?? ""));
  }

  const loadCompletedPosOrders = useCallback(async () => {
    if (!enablePosOrderEdit || !standalone) return [];

    const TOMBSTONE_MIN = 9_000_000;
    const statusIn = Array.from(
      new Set([
        ...checkoutCompleteStatuses(channelWorkflow, "pos"),
        "paid",
        "completed",
        "delivered",
        "processed",
      ]),
    ).join(",");

    const fromDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return d.toISOString().slice(0, 10);
    })();

    async function fetchRows(searchParams) {
      const res = await apiRequest("/sales", { searchParams });
      return Array.isArray(res?.data) ? res.data : [];
    }

    try {
      let rows = [];
      try {
        rows = await fetchRows(
          buildPageParams({
            page: 1,
            perPage: 40,
            extra: {
              for_pos_order_edit: 1,
              channel: "pos",
              order_source: "pos",
              with_items: 0,
              status_in: statusIn,
              exclude_statuses: "held,draft,cancelled,expired",
              sort: "order_num",
              sort_dir: "desc",
              from_date: fromDate,
              date_field: "placed",
            },
          }),
        );

        if (!rows.length) {
          rows = await fetchRows(
            buildPageParams({
              page: 1,
              perPage: 40,
              extra: {
                for_pos_order_edit: 1,
                channel: "pos",
                order_source: "pos",
                with_items: 0,
                sort: "order_num",
                sort_dir: "desc",
                from_date: fromDate,
                date_field: "placed",
              },
            }),
          );
        }
      } catch {
        // Offline / slow: still show queued local sales for edit.
        rows = [];
      }

      const serverOrders = rows
        .filter((row) => row?.id != null && row?.order_num != null)
        .filter((row) => Number(row.order_num) < TOMBSTONE_MIN)
        .filter((row) => !row?.fulfillment_meta?.superseded_by_edit)
        .filter((row) => {
          const source = String(row.order_source ?? row.channel ?? "pos").toLowerCase();
          if (source && source !== "pos") return false;
          const status = String(row.status ?? "").toLowerCase();
          if (["held", "draft", "cancelled", "expired"].includes(status)) return false;
          return true;
        })
        .map((row) => ({ id: row.id, order_num: row.order_num, status: row.status }));

      let offlineOrders = [];
      try {
        offlineOrders = await listOfflinePendingSalesForEdit();
      } catch {
        offlineOrders = [];
      }

      const offlineNums = new Set(offlineOrders.map((row) => String(row.order_num)));
      const orders = [
        ...offlineOrders.map((row) => ({
          id: row.id,
          order_num: row.order_num,
          status: row.status,
          offline_pending_sync: true,
        })),
        ...serverOrders.filter((row) => !offlineNums.has(String(row.order_num))),
      ];

      setSessionPosOrders(orders);
      setEditOrderNo((current) => {
        if (String(current ?? "").trim()) return current;
        return orders.length ? String(orders[0].order_num) : current;
      });
      return orders;
    } catch (e) {
      const message =
        e instanceof ApiError ? dedupeErrorMessage(e.message) : "Could not load completed POS orders";
      setOrderEditError(message);
      setStatusMessage(message);
      return [];
    }
  }, [enablePosOrderEdit, standalone, channelWorkflow]);

  useEffect(() => {
    if (!enablePosOrderEdit || !standalone) return;
    void loadCompletedPosOrders();
  }, [enablePosOrderEdit, standalone, loadCompletedPosOrders]);

  useEffect(() => {
    if (!standalone || !enablePosOrderEdit) return;
    if (offlineSyncing) return;
    if (!lastSyncMessage) return;
    // After offline sync, refresh ← browse list with real server sale ids.
    void loadCompletedPosOrders();
  }, [
    standalone,
    enablePosOrderEdit,
    offlineSyncing,
    lastSyncMessage,
    loadCompletedPosOrders,
  ]);

  const cartSummary = useMemo(() => {
    const rows = cart?.lines ?? [];
    const lineDiscounts = rows.reduce((sum, line) => sum + Number(line.discount_given ?? 0), 0);
    const net = enablePosCashRounding
      ? rows.reduce((sum, line) => sum + roundLightStoresAmount(line.amount ?? 0), 0)
      : rows.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    const vat = rows.reduce((sum, line) => sum + Number(line.product_vat ?? 0), 0);
    const orderDiscountRaw =
      showOrderDiscountInput || enableVouchers
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
      total: enablePosCashRounding ? roundLightStoresAmount(grossTotal) : grossTotal,
      voucherPayment,
      pointsPayment,
      mpesaPayment,
      amountDue: enablePosCashRounding ? roundLightStoresAmount(amountDue) : amountDue,
    };
  }, [
    cart?.lines,
    cart?.order_discount,
    cart?.voucher_payment_amount,
    cart?.points_payment_amount,
    cart?.mpesa_payment_amount,
    orderDiscountDraft,
    showOrderDiscountInput,
    enablePosCashRounding,
    enableVouchers,
  ]);

  cartRef.current = cart;
  cartSummaryRef.current = cartSummary;
  productByCodeRef.current = productByCode;

  // Classic External POS stays light — no dark theme toggle on this layout.
  useEffect(() => {
    if (!classicLayout) return undefined;
    const previous = getTheme();
    applyTheme("light");
    return () => {
      applyTheme(previous);
    };
  }, [classicLayout]);

  useEffect(() => {
    if (cart?.discount_approval_pending && cart?.discount_approval_request?.discount_amount != null) {
      const pending = Number(cart.discount_approval_request.discount_amount);
      setOrderDiscountDraft(pending > 0 ? String(pending) : "");
      return;
    }
    const value = Number(cart?.order_discount ?? 0);
    setOrderDiscountDraft(value > 0 ? String(value) : "");
  }, [cart?.id, cart?.order_discount, cart?.discount_approval_pending, cart?.discount_approval_request]);

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

  // Classic: after leave auto-hold, prompt restore/delete on next POS open.
  useEffect(() => {
    if (!classicLayout || !standalone) return undefined;
    const pending = peekAutoHeldOrder();
    if (!pending?.saleId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const sale = await apiRequest(`/sales/${pending.saleId}`);
        if (cancelled) return;
        if (String(sale?.status ?? "").toLowerCase() !== "held") {
          clearAutoHeldOrder();
          return;
        }
        setAutoHeldPrompt({
          saleId: pending.saleId,
          orderNum: sale.order_num ?? pending.orderNum,
        });
      } catch {
        if (!cancelled) clearAutoHeldOrder();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classicLayout, standalone]);

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

  const posShellReady = !sessionLoading && uomById.size > 0;
  usePageNavigationReady(posShellReady);

  const loadPosReferenceData = useCallback(async () => {
    // Do not warm the full retail-package catalog — hydrate packages for cart/search codes only.
    const [uoms, vats] = await Promise.all([
      fetchUomsCached(),
      fetchVatsCached().catch(() => []),
    ]);
    const uomMap = new Map();
    for (const u of uoms) uomMap.set(String(u.id), u);
    const vatMap = new Map();
    for (const v of vats) vatMap.set(String(v.id), v);
    setUomById(uomMap);
    setVatById(vatMap);
    return { uomMap, vatMap };
  }, []);

  const ensureRetailPackages = useCallback(async (productCodes) => {
    const codes = [
      ...new Set(
        (productCodes ?? [])
          .map((c) => String(c ?? "").trim())
          .filter((code) => code && retailByCodeRef.current[code] === undefined),
      ),
    ];
    if (!codes.length) return;
    // Sync ref first so add-to-cart right after await sees placeholders / results.
    for (const code of codes) {
      retailByCodeRef.current[code] = null;
    }
    setRetailByCode({ ...retailByCodeRef.current });
    try {
      const rows = await fetchRetailPackagesForProductCodes(codes);
      for (const row of rows ?? []) {
        if (row?.product_code) retailByCodeRef.current[row.product_code] = row;
      }
      setRetailByCode({ ...retailByCodeRef.current });
    } catch {
      // Leave null placeholders — wholesale pricing still works without packages.
    }
  }, []);

  useEffect(() => {
    loadPosReferenceData().catch(() => {});
  }, [loadPosReferenceData]);

  useEffect(() => {
    if (!cart?.lines?.length || uomById.size === 0) return;
    const missing = [
      ...new Set(
        cart.lines
          .map((l) => l.product_code)
          .filter((code) => code && !productByCodeRef.current[code]),
      ),
    ];
    const cartCodes = cart.lines.map((l) => l.product_code).filter(Boolean);
    void ensureRetailPackages(cartCodes);
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
  }, [cart?.lines, uomById, vatById, productBranchParams, ensureRetailPackages]);

  const loadCashierCart = useCallback(async () => {
    if (!user?.branch_id) return null;
    if (standalone && offlineMode) {
      const local = await loadOrCreateLocalPosCart({
        branch_id: user.branch_id,
        till_id: tillId,
        float_session_id: floatSessionId,
      });
      const presented = presentLocalOfflineCart(local);
      setCart(presented);
      return presented;
    }
    const body = { channel, order_source: standalone ? "pos" : "backoffice", branch_id: user.branch_id };
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
    standalone,
    offlineMode,
    user?.branch_id,
    tillId,
    floatSessionId,
    showRouteOrderUi,
    usesRouteMarkup,
    selectedRouteId,
    routes,
  ]);

  const refreshCart = useCallback(async (cartId) => {
    const updated = await apiRequest(`/sales/carts/${cartId}`, POS_CART_REQUEST);
    setCart(updated);
    return updated;
  }, []);

  const applyAdvisedDiscountsToCart = useCallback(async () => {
    if (!cart?.id || !advisedDiscountLines.length || applyingAdvisedDiscounts) return;

    setApplyingAdvisedDiscounts(true);
    try {
      const advisedByCode = buildAdvisedDiscountMap(advisedDiscountLines);
      let latestCart = cart;

      for (const line of cart.lines ?? []) {
        const code = String(line.product_code ?? "").trim();
        if (!code || !advisedByCode.has(code)) continue;

        const lineRef = cartLineRef(line);
        const advisedPerUnit = advisedByCode.get(code);
        const product = productByCode?.[code] ?? null;
        const retailPackage = getRetailPackage(code);
        const packQty = Number(
          cartLinePackQtyForDiscount(line, product, retailPackage),
        );
        const qtyForDiscount = packQty > 0 ? packQty : Number(line.quantity ?? 0);
        const updated = await apiRequest(`/sales/carts/${cart.id}/lines/${lineRef}`, {
          method: "PATCH",
          body: {
            discount_given: lineDiscountTotal(advisedPerUnit, qtyForDiscount),
            quantity: line.quantity,
            on_wholesale_retail: line.on_wholesale_retail,
            update_no: latestCart.update_no,
          },
          ...POS_CART_REQUEST,
        });
        latestCart = applyCartMutationResponse(latestCart, updated, { targetLineRef: lineRef });
      }

      await refreshCart(cart.id);
      notifySuccess("Advised discounts applied to each line.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not apply advised discounts.");
    } finally {
      setApplyingAdvisedDiscounts(false);
    }
  }, [advisedDiscountLines, applyingAdvisedDiscounts, cart, productByCode, refreshCart, retailByCode]);

  const ensureCart = useCallback(async () => {
    const current = cartRef.current;
    if (standalone && offlineMode) {
      if (current?.offline && Array.isArray(current.lines)) return current;
      return loadCashierCart();
    }
    if (current?.id && current.channel === channel && Array.isArray(current.lines)) {
      return current;
    }
    if (current?.id && current.channel === channel) {
      return refreshCart(current.id);
    }
    return loadCashierCart();
  }, [channel, loadCashierCart, refreshCart, standalone, offlineMode]);

  function enqueueCartCommit(task) {
    const run = cartCommitChainRef.current.then(task, task);
    cartCommitChainRef.current = run.catch(() => {});
    return run;
  }

  function clearClassicEntryFields() {
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
    window.requestAnimationFrame(() => {
      if (!focusSearchAfterAdd.current) return;
      focusSearchAfterAdd.current = false;
      searchInputRef.current?.focus({ preventScroll: true });
    });
  }

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
        if (standalone && offlineMode) {
          const list = (await searchOffline(trimmed, 40)).map((p) =>
            enrichProductForLpo(p, uomMap, vatMap),
          );
          if (seq !== searchSeq.current) return;
          setSearchResults(list);
          setProductByCode((prev) => {
            const next = { ...prev };
            for (const p of list) next[p.product_code] = p;
            return next;
          });
          return;
        }

        // Classic: paint warmed IndexedDB catalog immediately, then refresh from API.
        if (standalone && classicLayout) {
          try {
            const local = await searchOffline(trimmed, 40);
            if (seq === searchSeq.current && local.length) {
              const list = local.map((p) => enrichProductForLpo(p, uomMap, vatMap));
              setSearchResults(list);
              setSearching(false);
              setProductByCode((prev) => {
                const next = { ...prev };
                for (const p of list) next[p.product_code] = p;
                return next;
              });
            }
          } catch {
            /* fall through to API */
          }
        }

        const res = await apiRequest("/products", {
          searchParams: { per_page: 80, q: trimmed, fields: "lean", ...productBranchParams },
        });
        if (seq !== searchSeq.current) return;
        const list = (res.data ?? []).map((p) => enrichProductForLpo(p, uomMap, vatMap));
        setSearchResults(list.slice(0, 40));
        setProductByCode((prev) => {
          const next = { ...prev };
          for (const p of list) next[p.product_code] = p;
          return next;
        });
        // Classic defers package hydrate to keep search snappy; modern warms the list.
        if (!classicLayout) {
          void ensureRetailPackages(list.map((p) => p.product_code));
        } else if (list.length) {
          void ensureRetailPackages(list.slice(0, 5).map((p) => p.product_code));
        }
      } catch (err) {
        if (seq !== searchSeq.current) return;
        // Network drop mid-search: fall back to offline catalog when available.
        if (standalone) {
          try {
            const list = (await searchOffline(trimmed, 40)).map((p) =>
              enrichProductForLpo(p, uomMap, vatMap),
            );
            if (seq !== searchSeq.current) return;
            setSearchResults(list);
            setProductByCode((prev) => {
              const next = { ...prev };
              for (const p of list) next[p.product_code] = p;
              return next;
            });
            if (list.length) {
              setStatusMessage("Offline catalog — prices from last sync.");
              return;
            }
          } catch {
            /* ignore */
          }
        }
        setSearchResults([]);
        if (err instanceof ApiError && err.status === 403) {
          setStatusMessage("You do not have permission to search products.");
        } else if (standalone) {
          setStatusMessage("Cannot reach server and no offline catalog match.");
        }
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    },
    [
      uomById,
      vatById,
      productBranchParams,
      ensureRetailPackages,
      standalone,
      classicLayout,
      offlineMode,
      searchOffline,
    ],
  );

  useEffect(() => {
    const trimmed = searchQuery.trim();
    const delay = !trimmed
      ? 0
      : classicLayout
        ? looksLikeProductCodeQuery(searchQuery)
          ? 0
          : 40
        : looksLikeProductCodeQuery(searchQuery)
          ? 0
          : 280;
    const t = setTimeout(() => searchProducts(searchQuery), delay);
    return () => clearTimeout(t);
  }, [searchQuery, searchProducts, classicLayout]);

  function retailLineFlagFor(product, entryQty, retailLine = null, sellWholesaleOverride = null) {
    if (retailLine != null) return retailLine;
    const sellMode = sellWholesaleOverride ?? sellWholesale;
    const retailPackage = getRetailPackage(product.product_code);
    const resolved = resolvePosQuantity(entryQty, product, retailPackage, sellMode);
    return posLineRetailStockFlag(posSalesConfig, sellMode, resolved.isRetail, product);
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
    const retailPackage = getRetailPackage(product.product_code);
    const lineRetailFlag = retailLineFlagFor(product, entryQty, retailLine, sellMode);
    const autoProductDiscount =
      allowDiscounts && productHasConfiguredDiscount(product);
    const cashRound = enablePosCashRounding;
    let discountAmount = 0;

    if (allowDiscounts && autoProductDiscount) {
      const preDiscount = computePosLine({
        product,
        entryQty,
        sellWholesale: sellMode,
        retailPackage,
        discount: 0,
        unitPriceOverride: overridePrice,
        routeMarkupPerUnit,
        retailLine: lineRetailFlag,
        cashRound,
      });
      discountAmount = computeProductLineDiscount(
        product,
        preDiscount.lineAmountBeforeDiscount,
        preDiscount.packQty,
      );
    } else if (allowEditLineDiscount || discountApprovalActive) {
      const perUnitDiscount = parseDecimalInput(discount);
      const qtyForDiscount = Math.max(1, Number(computePosLine({
        product,
        entryQty,
        sellWholesale: sellMode,
        retailPackage,
        discount: 0,
        unitPriceOverride: overridePrice,
        routeMarkupPerUnit,
        retailLine: lineRetailFlag,
        cashRound,
      }).packQty ?? 0));
      // Cashier input is per sold pack/unit; convert to line-total discount.
      discountAmount = perUnitDiscount * qtyForDiscount;
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
      cashRound,
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

  const selectedProductStockLabel = useMemo(
    () =>
      selectedProduct
        ? productCartStockLabel(selectedProduct, posSalesConfig, { sellWholesale })
        : "",
    [selectedProduct, posSalesConfig, sellWholesale],
  );

  async function resolveProductByCode(code) {
    const trimmed = String(code ?? "").trim();
    if (!trimmed) return null;
    await ensureRetailPackages([trimmed]);
    if (productByCodeRef.current[trimmed]) return productByCodeRef.current[trimmed];
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
    unlockUiEarly = false,
    lineRetailStockFlagOverride = null,
  }) {
    const liveCart = cartRef.current ?? cart;
    const retailPackage = getRetailPackage(product.product_code);
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

    const stockAsRetail =
      lineRetailStockFlagOverride != null
        ? lineRetailStockFlagOverride
        : posLineRetailStockFlag(posSalesConfig, sellWholesale, computed.isRetail, product);
    const onWholesaleRetailFlag =
      lineRetailStockFlagOverride != null
        ? Boolean(lineRetailStockFlagOverride)
        : posSalesConfig.perLineStockRouting
          ? sellWholesale === false
          : Boolean(computed.isRetail);

    const stockBaseQty =
      mergeTarget && !editingId
        ? Number(mergeTarget.quantity) + incrementBaseQty
        : computed.baseQty;

    const stockCheck = posStockAvailability({
      product,
      baseQty: stockBaseQty,
      cartLines: liveCart?.lines,
      sellFromShop,
      posSalesConfig,
      allowNegativeStock,
      stockAsRetail,
      productByCode: productByCodeRef.current,
      excludeLineId: editingId ?? mergeTarget?.id ?? mergeTarget?.update_code,
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

    if (standalone && offlineMode) {
      const activeCart = await ensureCart();
      const localLine = {
        client_line_id:
          editingId != null
            ? String(editingRef ?? editingId)
            : mergeTarget?.client_line_id ?? newClientSaleUuid(),
        product_code: product.product_code,
        product_name: product.product_name ?? product.description ?? product.product_code,
        quantity: finalComputed.baseQty,
        unit_price: finalComputed.unitPricePerBase,
        display_unit_price: finalComputed.displayUnitPrice,
        uom: finalComputed.uomLabel || product.package_name,
        on_wholesale_retail: onWholesaleRetailFlag,
        discount_given:
          allowDiscounts || discountApprovalActive ? finalComputed.discountApplied : 0,
        vat_rate: Number(product.vat_rate ?? product.tax_rate ?? 0),
      };
      const nextLocal = await upsertLocalPosCartLine(
        {
          id: "active",
          lines: (activeCart?.lines ?? []).map((l) => ({
            ...l,
            client_line_id: l.client_line_id ?? l.id,
          })),
          branch_id: activeCart?.branch_id ?? user?.branch_id,
          till_id: activeCart?.till_id ?? tillId,
          float_session_id: activeCart?.float_session_id ?? floatSessionId,
          held_order_num: activeCart?.held_order_num ?? null,
          offline_client_sale_uuid: activeCart?.offline_client_sale_uuid ?? null,
          offline_edit_snapshot: activeCart?.offline_edit_snapshot ?? null,
          customer_num: activeCart?.customer_num ?? null,
          customer_name_override: activeCart?.customer_name_override ?? null,
        },
        localLine,
      );
      setCart(presentLocalOfflineCart(nextLocal));
      setStatusMessage(
        successMessage ??
          (offlineMode
            ? `Added offline (will sync when online). ${orderNumbersLeft} order # left.`
            : "Line added."),
      );
      if (clearEntry) clearClassicEntryFields();
      void refreshOfflineCounts();
      return true;
    }

    // Classic unlock: clear entry before any network so the next-row never shows this SKU.
    if (unlockUiEarly && clearEntry) {
      clearClassicEntryFields();
    }

    const activeCart = await ensureCart();
    const lineBody = {
      product_code: product.product_code,
      quantity: finalComputed.baseQty,
      unit_price: finalComputed.unitPricePerBase,
      display_unit_price: finalComputed.displayUnitPrice,
      uom: finalComputed.uomLabel || product.package_name,
      on_wholesale_retail: onWholesaleRetailFlag ? 1 : 0,
      discount_given:
        allowDiscounts || discountApprovalActive ? finalComputed.discountApplied : 0,
      product_vat: lineProductVat(product, finalComputed.lineAmount),
    };

    const discountAmount = Number(lineBody.discount_given ?? 0);
    const needsLineDiscountApproval =
      discountApprovalActive &&
      !canAutoApproveDiscount &&
      !finalComputed.autoProductDiscount &&
      discountAmount > 0;

    if (needsLineDiscountApproval) {
      try {
        let lineRef = targetLineRef;
        let cartState = activeCart;
        const grossPerBase =
          finalComputed.baseQty > 0
            ? finalComputed.lineAmountBeforeDiscount / finalComputed.baseQty
            : finalComputed.unitPricePerBase;
        const deferredLineBody = {
          ...lineBody,
          discount_given: 0,
          unit_price: grossPerBase,
          display_unit_price: finalComputed.displayUnitPrice,
          product_vat: lineProductVat(product, finalComputed.lineAmountBeforeDiscount),
        };

        if (!lineRef) {
          const added = await apiRequest(`/sales/carts/${activeCart.id}/lines`, {
            method: "POST",
            body: deferredLineBody,
            ...POS_CART_REQUEST,
          });
          cartState = applyCartMutationResponse(activeCart, added);
          const newLine = [...(added.lines ?? [])]
            .reverse()
            .find((line) => line.product_code === product.product_code);
          lineRef = newLine ? cartLineRef(newLine) : null;
        } else {
          const updated = await apiRequest(`/sales/carts/${activeCart.id}/lines/${lineRef}`, {
            method: "PATCH",
            body: {
              ...deferredLineBody,
              update_no: activeCart.update_no,
            },
            ...POS_CART_REQUEST,
          });
          cartState = applyCartMutationResponse(activeCart, updated, { targetLineRef: lineRef });
        }
        if (!lineRef) {
          setStatusMessage("Could not resolve cart line for discount request.");
          return false;
        }
        const res = await apiRequest(`/sales/carts/${cartState.id}/discount-requests`, {
          method: "POST",
          body: {
            scope: "line",
            line_ref: String(lineRef),
            discount_amount: discountAmount,
            defer_approval: true,
          },
          ...POS_CART_REQUEST,
        });
        if (res.cart) setCart(res.cart);
        setStatusMessage(
          "Discount saved on this line. Manager approval is requested when you save the order.",
        );
        if (clearEntry) {
          clearClassicEntryFields();
        }
        return true;
      } catch (error) {
        setStatusMessage(error instanceof ApiError ? error.message : "Discount request failed.");
        throw error;
      }
    }

    const previousLineSnapshot =
      targetLineRef != null
        ? {
            ...(mergeTarget ??
              activeCart.lines?.find(
                (line) => String(cartLineRef(line)) === String(targetLineRef),
              ) ??
              {}),
          }
        : null;

    const optimisticLine = buildOptimisticCartLine(product, lineBody, finalComputed);
    const optimisticCart = applyOptimisticCartMutation(activeCart, optimisticLine, {
      mergeTarget,
      editingRef: targetLineRef,
    });

    // Previous-order edit: keep line add/update local until Complete saves + prints.
    if (activeCart.held_order_num) {
      const draftLines = (optimisticCart.lines ?? []).map((line) => {
        const { _optimistic, ...rest } = line;
        return { ...rest, _draftEdit: true };
      });
      // Preserve real server line ids when updating/merging an existing restored line.
      if (targetLineRef || mergeTarget) {
        const base =
          mergeTarget ??
          activeCart.lines?.find((line) => String(cartLineRef(line)) === String(targetLineRef));
        if (base && !String(base.id ?? "").startsWith("pending-")) {
          const idx = draftLines.findIndex(
            (line) =>
              String(line.product_code) === String(product.product_code) &&
              Number(line.on_wholesale_retail ?? 0) === Number(lineBody.on_wholesale_retail ?? 0),
          );
          if (idx >= 0) {
            draftLines[idx] = {
              ...draftLines[idx],
              id: base.id,
              update_code: base.update_code ?? base.id,
            };
          }
        }
      }
      const draftCart = { ...optimisticCart, lines: draftLines };
      cartRef.current = draftCart;
      setCart(draftCart);
      setCartLineSaveFailed(false);
      if (successMessage) setStatusMessage(successMessage);
      if (clearEntry && !unlockUiEarly) {
        clearClassicEntryFields();
      }
      return true;
    }

    cartRef.current = optimisticCart;
    setCart(optimisticCart);

    // Already cleared above when unlockUiEarly; keep a second clear for safety if flags change.
    if (unlockUiEarly && clearEntry) {
      clearClassicEntryFields();
    }

    try {
      if (targetLineRef) {
        const updated = await apiRequest(`/sales/carts/${activeCart.id}/lines/${targetLineRef}`, {
          method: "PATCH",
          body: {
            ...lineBody,
            update_no: activeCart.update_no,
          },
          ...POS_CART_REQUEST,
        });
        const nextCart = applyCartMutationResponse(activeCart, updated, { targetLineRef });
        cartRef.current = nextCart;
        setCart(nextCart);
      } else {
        const updated = await apiRequest(`/sales/carts/${activeCart.id}/lines`, {
          method: "POST",
          body: lineBody,
          ...POS_CART_REQUEST,
        });
        const nextCart = applyCartMutationResponse(activeCart, updated);
        cartRef.current = nextCart;
        setCart(nextCart);
      }
      setCartLineSaveFailed(false);
    } catch (error) {
      setCart((current) => {
        const reverted = revertOptimisticCartMutation(current, {
          previousLineSnapshot:
            previousLineSnapshot?.product_code != null ? previousLineSnapshot : null,
          optimisticLine,
        });
        cartRef.current = reverted;
        return reverted;
      });
      setCartLineSaveFailed(true);
      throw error;
    }

    if (successMessage) setStatusMessage(successMessage);

    if (clearEntry && !unlockUiEarly) {
      clearClassicEntryFields();
    }

    return true;
  }

  async function quickAddOrIncrementProduct(product) {
    if (busy || !product) return;
    if (!classicLayout && lineBusy) return;
    if (!assertRouteReadyForAdd()) return;

    setProductByCode((prev) =>
      prev[product.product_code] ? prev : { ...prev, [product.product_code]: product },
    );

    const computed = applyComputedPrice(product, "1", 0);
    if (computed.baseQty <= 0) return;

    if (classicLayout) {
      // Clear scan + entry row immediately so the next-row never parks this product.
      clearClassicEntryFields();
      void ensureRetailPackages([product.product_code]);
      void enqueueCartCommit(async () => {
        const mergeTarget = findMergeableCartLine(
          cartRef.current?.lines,
          product.product_code,
          computed,
          posSalesConfig,
          sellWholesale,
        );
        try {
          await commitCartLine({
            product,
            computed,
            incrementBaseQty: computed.baseQty,
            mergeTarget,
            successMessage: null,
            unlockUiEarly: true,
          });
        } catch (e) {
          setStatusMessage(e instanceof ApiError ? e.message : "Failed to add line");
        }
      });
      return;
    }

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
    const trimmed = String(code ?? "").trim();
    if (!trimmed) return false;

    let product = null;
    if (classicLayout || offlineMode) {
      try {
        const local = await getPosOfflineProduct(trimmed);
        if (local) {
          product = enrichProductForLpo(local, uomById, vatById);
        }
      } catch {
        /* fall through to API */
      }
    }
    if (!product) {
      product = await resolveProductByCode(trimmed);
    }
    if (!product) {
      setStatusMessage("Barcode not found — search by name or code.");
      return false;
    }
    if (replacingLineId) {
      pickProduct(product);
      return true;
    }
    await quickAddOrIncrementProduct(product);
    return true;
  }

  function pickProduct(product) {
    if (!product) return;
    setProductByCode((prev) =>
      prev[product.product_code] ? prev : { ...prev, [product.product_code]: product },
    );

    // Classic: add qty 1 immediately — do not park the product in the entry "next row".
    if (classicLayout && !replacingLineId) {
      void quickAddOrIncrementProduct(product);
      return;
    }

    setSelectedProductCode(product.product_code);
    setSelectedProduct(product);
    setUnitPriceTouched(false);
    const retailPackage = getRetailPackage(product.product_code);
    const replaceLine = replacingLineId
      ? (cart?.lines ?? []).find((line) => sameLineId(line.id, replacingLineId))
      : null;
    const replaceRetail = replaceLine ? cartLineRetailStockFlag(replaceLine) : null;
    const quantity = replaceLine
      ? posEntryQtyFromBaseQty(
          Number(replaceLine.quantity ?? 0),
          product,
          retailPackage,
          Boolean(replaceRetail),
        )
      : defaultPosEntryQty(product, sellWholesale, retailPackage);
    const computed = applyComputedPrice(
      product,
      quantity,
      0,
      null,
      replaceRetail,
      replaceRetail == null ? null : !replaceRetail,
    );
    setLineForm({
      product_code: product.product_code,
      description: product.product_name ?? "",
      package: computed.packagingLabel,
      quantity,
      discount: String(computed.discountAmount ?? 0),
      unit_price: String(computed.displayUnitPrice),
    });
    if (replaceLine) {
      if (String(replaceLine.product_code) === String(product.product_code)) {
        setStatusMessage("Choose a different product to replace this line.");
        return;
      }
      setStatusMessage(`Replacing ${replaceLine.product_code} → ${product.product_code}…`);
      void (async () => {
        setLineBusy(true);
        try {
          const ok = await replaceCartLineWithProduct(
            replaceLine,
            product,
            quantity,
            0,
            null,
          );
          if (ok) {
            setReplacingLineId(null);
            setStatusMessage(
              `Replaced ${replaceLine.product_code} with ${product.product_code}.`,
            );
          }
        } catch (e) {
          setStatusMessage(e instanceof ApiError ? e.message : "Failed to replace line");
        } finally {
          setLineBusy(false);
        }
      })();
    }
  }

  function beginReplaceCartLine(lineId) {
    const line = (cart?.lines ?? []).find((row) => sameLineId(row.id, lineId));
    if (!line || busy || lineBusy) return;
    setReplacingLineId(line.id);
    setSelectedLineId(line.id);
    setEditingLineId(null);
    setEditingLineRef(null);
    setSelectedProduct(null);
    setSelectedProductCode(null);
    setSearchQuery("");
    setLineForm({
      product_code: "",
      description: "",
      package: "",
      quantity: posEntryQtyFromCartLine(
        line,
        productByCode[line.product_code] ?? null,
        getRetailPackage(line.product_code),
      ),
      discount: "0",
      unit_price: "",
    });
    setStatusMessage(
      `Replace ${line.product_code}: search or scan the new product (Enter selects & replaces). Esc cancels.`,
    );
    focusProductSearch();
  }

  function cancelReplaceCartLine() {
    if (!replacingLineId) return;
    setReplacingLineId(null);
    setSelectedProduct(null);
    setSelectedProductCode(null);
    setSearchQuery("");
    setSearchResults([]);
    setLineForm(EMPTY_LINE);
    setStatusMessage("Replace cancelled.");
    focusProductSearch();
  }

  async function replaceCartLineWithProduct(line, product, entryQty, discount = 0, override = null) {
    if (!line || !product || !cart?.id) return false;
    const isRetailLine = cartLineRetailStockFlag(line);
    const computed = applyComputedPrice(
      product,
      entryQty,
      discount,
      override,
      isRetailLine,
      !isRetailLine,
    );
    if (computed.baseQty <= 0) {
      setStatusMessage("Enter a valid quantity.");
      return false;
    }

    const lineRef = cartLineRef(line);
    if (!lineRef) {
      setStatusMessage("Could not resolve the line to replace.");
      return false;
    }

    const removed = await apiRequest(`/sales/carts/${cart.id}/lines/${lineRef}`, {
      method: "DELETE",
    });
    setCart(removed);

    const ok = await commitCartLine({
      product,
      computed,
      incrementBaseQty: computed.baseQty,
      discount,
      override,
      clearEntry: true,
      successMessage: null,
      lineRetailStockFlagOverride: isRetailLine,
    });
    return ok;
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
    const retailPackage = getRetailPackage(selectedProduct.product_code);
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
      const nextDiscount =
        allowDiscounts && computed.autoProductDiscount
          ? String(computed.discountAmount ?? 0)
          : allowEditLineDiscount || discountApprovalActive
            ? prev.discount
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
    discountApprovalActive,
    routeMarkupPerUnit,
    editingLineId,
  ]);

  const retailPricingSession = isPosRetailSession(sellWholesale);

  const unitPriceLabel = useMemo(() => {
    if (!selectedProduct) return "Unit price";
    const retailPackage = getRetailPackage(selectedProduct.product_code);
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
    const retailPackage = getRetailPackage(selectedProduct.product_code);
    return posQuantityFieldMeta(
      selectedProduct,
      sellWholesale,
      retailPackage,
      lineForm.quantity,
    );
  }, [selectedProduct, sellWholesale, retailByCode, lineForm.quantity]);

  const stockDeductionHint = useMemo(() => {
    if (!selectedProduct) return null;
    const retailPackage = getRetailPackage(selectedProduct.product_code);
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
      selectedProduct,
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
    const product = productByCode[selectedProduct.product_code] ?? selectedProduct;
    const retailPackage = getRetailPackage(product.product_code);
    const computed = computePosLine({
      product,
      entryQty: lineForm.quantity,
      sellWholesale,
      retailPackage,
      discount: 0,
      routeMarkupPerUnit,
    });
    const mergeTarget = editingLineId
      ? null
      : findMergeableCartLine(
          cart?.lines,
          product.product_code,
          computed,
          posSalesConfig,
          sellWholesale,
        );
    const stockBaseQty =
      mergeTarget && !editingLineId
        ? Number(mergeTarget.quantity) + computed.baseQty
        : computed.baseQty;
    return posStockAvailability({
      product,
      baseQty: stockBaseQty,
      cartLines: cart?.lines,
      sellFromShop,
      posSalesConfig,
      allowNegativeStock,
      stockAsRetail: posLineRetailStockFlag(
        posSalesConfig,
        sellWholesale,
        computed.isRetail,
        product,
      ),
      productByCode,
      excludeLineId: editingLineId ?? mergeTarget?.id ?? mergeTarget?.update_code,
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
    const product = productByCode[selectedProduct.product_code] ?? selectedProduct;
    const retailPackage = getRetailPackage(product.product_code);
    return posStockInsufficientMessage(lineStockCheck, {
      product,
      sellWholesale,
      retailPackage,
      posSalesConfig,
    });
  }, [lineStockCheck, selectedProduct, productByCode, sellWholesale, retailByCode, posSalesConfig]);

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

  const checkoutBlocked = lineBusy || cartHasOptimisticLines(cart);

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
    if (!cart?.id || !showOrderDiscountInput) return;
    const parsed = Math.max(0, parseDecimalInput(rawValue));
    const net = (cart.lines ?? []).reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    const next = Math.min(parsed, net);
    if (
      !cart.discount_approval_pending &&
      next === Number(cart.order_discount ?? 0)
    ) {
      setOrderDiscountDraft(next > 0 ? String(next) : "");
      return;
    }
    setBusy(true);
    try {
      if (discountApprovalActive && !canAutoApproveDiscount && next > 0) {
        const res = await apiRequest(`/sales/carts/${cart.id}/discount-requests`, {
          method: "POST",
          body: { scope: "order", discount_amount: next, defer_approval: true },
          ...POS_CART_REQUEST,
        });
        if (res.cart) setCart(res.cart);
        setStatusMessage(
          "Order discount saved. Manager approval is requested when you save the order.",
        );
        setOrderDiscountDraft(next > 0 ? String(next) : "");
        return;
      }

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
      const retailPackage = getRetailPackage(row.product_code);
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
      const ok = await confirm({
        title: "Change order type",
        message: "Changing order type will reprice cart lines. Continue?",
        confirmLabel: "Continue",
      });
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
      const ok = await confirm({
        title: "Change route",
        message: "Changing route will reprice cart lines. Continue?",
        confirmLabel: "Continue",
      });
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

    const replaceLine = replacingLineId
      ? (cart?.lines ?? []).find((line) => sameLineId(line.id, replacingLineId))
      : null;

    if (replaceLine) {
      if (String(replaceLine.product_code) === String(selectedProduct.product_code)) {
        setStatusMessage("Choose a different product to replace this line.");
        return;
      }
      setLineBusy(true);
      try {
        const ok = await replaceCartLineWithProduct(
          replaceLine,
          selectedProduct,
          lineForm.quantity,
          discount,
          override,
        );
        if (ok) {
          setReplacingLineId(null);
          setStatusMessage(
            `Replaced ${replaceLine.product_code} with ${selectedProduct.product_code}.`,
          );
        }
      } catch (e) {
        setStatusMessage(e instanceof ApiError ? e.message : "Failed to replace line");
      } finally {
        setLineBusy(false);
      }
      return;
    }

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
        unlockUiEarly: classicLayout,
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
    if (!discountFeaturesEnabled) return false;
    if (discountApprovalActive) {
      return true;
    }

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
    if (!selectedProduct || busy || lineBusy) return;
    if (addLineBlocked) {
      if (classicLayout && lineStockMessage) setStatusMessage(lineStockMessage);
      return;
    }
    // Qty Enter → discount (when editable) → unit price (when allowed) → add to cart.
    if (showLineDiscountField && canEditManualLineDiscount()) {
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
    const retailPackage = getRetailPackage(line.product_code);
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

      const retailPackage = getRetailPackage(line.product_code);
      // Keep each line's original wholesale/retail flag — F2 only affects new lines.
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
      const packQty = cartLinePackQtyForDiscount(
        { ...line, quantity: nextBaseQty },
        product,
        retailPackage,
      );
      const perUnitDiscount = lineDiscountPerUnit(line.discount_given, packQty);
      const computed = applyComputedPrice(
        product,
        entryQty,
        perUnitDiscount,
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
        discount: perUnitDiscount,
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

  /** Classic: type an absolute entry qty — keeps this line's wholesale/retail price mode. */
  async function setCartLineEntryQuantity(line, entryQtyRaw) {
    if (!line || !cart?.id || busy || lineBusy) return;
    const entryQty = parseDecimalInput(entryQtyRaw);
    if (!(entryQty > 0)) {
      setStatusMessage("Enter a quantity greater than zero, or use − to remove the line.");
      return;
    }
    setLineBusy(true);
    try {
      const product =
        productByCode[line.product_code] ?? (await resolveProductByCode(line.product_code));
      if (!product) {
        setStatusMessage("Product not found for this cart line.");
        return;
      }

      const retailPackage = getRetailPackage(line.product_code);
      const isRetailLine = cartLineRetailStockFlag(line);
      const computedPreview = applyComputedPrice(
        product,
        entryQty,
        0,
        null,
        isRetailLine,
        !isRetailLine,
      );
      const packQty = cartLinePackQtyForDiscount(
        { ...line, quantity: computedPreview.baseQty },
        product,
        retailPackage,
      );
      const perUnitDiscount = lineDiscountPerUnit(line.discount_given, packQty);
      const computed = applyComputedPrice(
        product,
        entryQty,
        perUnitDiscount,
        null,
        isRetailLine,
        !isRetailLine,
      );

      if (!allowNegativeStock) {
        const stockCheck = posStockAvailability({
          product,
          baseQty: computed.baseQty,
          cartLines: cart?.lines,
          sellFromShop,
          posSalesConfig,
          allowNegativeStock,
          stockAsRetail: cartLineStockAsRetail(line, product),
          productByCode,
          excludeLineId: line?.id ?? line?.update_code,
        });
        if (!stockCheck.ok) {
          setStatusMessage(
            posStockInsufficientMessage(stockCheck, {
              product,
              sellWholesale: !isRetailLine,
              retailPackage,
              posSalesConfig,
            }),
          );
          return;
        }
      }

      const ok = await commitCartLine({
        product,
        computed,
        incrementBaseQty: computed.baseQty,
        editingId: line.id,
        editingRef: cartLineRef(line),
        discount: perUnitDiscount,
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
      // Previous-order edit / offline cart: remove locally until Complete flushes + saves.
      if (cart.held_order_num || cart.offline) {
        const nextLines = (cart.lines ?? []).filter((l) => !sameLineId(l.id, selectedLineId));
        let nextCart = { ...cart, lines: nextLines };
        if (cart.offline) {
          const saved = await saveLocalPosCart({
            ...nextCart,
            lines: nextLines.map((l) => ({
              ...l,
              client_line_id: l.client_line_id ?? l.id,
            })),
          });
          nextCart = presentLocalOfflineCart(saved);
        }
        cartRef.current = nextCart;
        setCart(nextCart);
        if (sameLineId(editingLineId, selectedLineId)) {
          clearLineEntry();
        }
        setSelectedLineId(null);
        return;
      }

      const updated = await apiRequest(`/sales/carts/${cart.id}/lines/${lineRef}`, {
        method: "DELETE",
      });
      cartRef.current = updated;
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
    if (
      !(await confirm({
        title: "Clear cart",
        message: cart.held_order_num
          ? "Clear all items from this edited order? Complete is required to save — clearing here only updates the screen until you complete or abandon the edit."
          : "Clear all items from the cart?",
        confirmLabel: "Clear",
        destructive: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    setStatusMessage(null);
    try {
      if (cart.held_order_num || cart.offline) {
        let nextCart = { ...cart, lines: [] };
        if (cart.offline) {
          const saved = await saveLocalPosCart({
            ...nextCart,
            lines: [],
          });
          nextCart = presentLocalOfflineCart(saved);
        }
        cartRef.current = nextCart;
        setCart(nextCart);
        clearLineEntry();
        setSelectedLineId(null);
        setStatusMessage(
          cart.held_order_num
            ? "Lines cleared — complete the order to save, or start a new order to abandon."
            : "Cart cleared.",
        );
        window.requestAnimationFrame(() => {
          searchInputRef.current?.focus({ preventScroll: true });
        });
        return;
      }

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
    setReplacingLineId(null);
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

  /** Classic: hold open sale automatically when leaving POS (Light Stores AutomaticHold). */
  async function holdCartAndLeave() {
    const href = pendingLeaveHrefRef.current;
    if (!cart?.id || !cart?.lines?.length) {
      completeLeaveNavigation(href);
      return;
    }
    setLeaveGuardBusy(true);
    setStatusMessage(null);
    try {
      const body = {
        status: "held",
        pay_now: 0,
        is_credit_sale: false,
        deduct_stock: true,
        save_only: true,
        customer_name_override:
          prefilledEditCustomerName.trim() || "Walk-in (auto-held)",
        sales_workspace: salesWorkspace,
        ...(cart?.held_order_num ? { order_num: cart.held_order_num } : {}),
        ...(requireTillFloat && floatSessionId ? { float_session_id: floatSessionId } : {}),
      };
      const checkoutBody = await attachDiscountApprovalReasonToCheckoutBody(body);
      if (!checkoutBody) {
        setStatusMessage("Enter a discount reason before leaving, or clear the sale.");
        setLeaveGuardOpen(false);
        return;
      }
      const sale = await apiRequest(`/sales/carts/${cart.id}/checkout`, {
        method: "POST",
        body: checkoutBody,
      });
      rememberAutoHeldOrder({ saleId: sale.id, orderNum: sale.order_num });
      clearPosUiDraft();
      clearLineEntry();
      setSelectedLineId(null);
      setCart(null);
      await loadHeldOrdersCount();
      completeLeaveNavigation(href);
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to hold sale before leaving");
      setLeaveGuardOpen(false);
    } finally {
      setLeaveGuardBusy(false);
    }
  }

  async function handleAutoHeldRestore() {
    if (!autoHeldPrompt?.saleId) return;
    setAutoHeldBusy(true);
    try {
      await restoreOrderForEdit(autoHeldPrompt.saleId);
      clearAutoHeldOrder();
      setAutoHeldPrompt(null);
      notifySuccess("Held sale restored.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not restore held sale");
    } finally {
      setAutoHeldBusy(false);
    }
  }

  async function handleAutoHeldDelete() {
    if (!autoHeldPrompt?.saleId) return;
    setAutoHeldBusy(true);
    try {
      await apiRequest(`/sales/orders/${autoHeldPrompt.saleId}/cancel-held`, {
        method: "POST",
      });
      clearAutoHeldOrder();
      setAutoHeldPrompt(null);
      await loadHeldOrdersCount();
      notifySuccess("Held sale deleted.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not delete held sale");
    } finally {
      setAutoHeldBusy(false);
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

      const retailPackage = getRetailPackage(line.product_code);
      const isRetailLine = Number(line.on_wholesale_retail) === 1;
      setEditingLineId(line.id);
      setEditingLineRef(cartLineRef(line));
      setSelectedLineId(line.id);
      setSellWholesale(!isRetailLine);
      setSelectedProductCode(line.product_code);
      setSelectedProduct(product);
      setSearchQuery(product.product_name ?? line.product_code);
      setUnitPriceTouched(true);
      const baseQty = Number(line.quantity ?? 0);
      const perUnitDiscount = cartLineEnteredDiscountPerUnit(line, product, retailPackage);
      setLineForm({
        product_code: line.product_code,
        description: line.product_name ?? product.product_name ?? "",
        package: line.uom ?? "",
        quantity: posEntryQtyFromCartLine(line, product, retailPackage),
        discount: String(perUnitDiscount),
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
      // Refresh only clears the in-progress search/line entry and reloads product prices.
      clearLineEntry();
      const codes = [
        ...new Set((cart?.lines ?? []).map((l) => l.product_code).filter(Boolean)),
      ];
      for (const code of codes) {
        delete retailByCodeRef.current[code];
      }
      setRetailByCode({ ...retailByCodeRef.current });

      if (codes.length) {
        const { uomMap, vatMap } = await loadPosReferenceData();
        await reloadCartProductMeta(
          codes.map((product_code) => ({ product_code })),
          uomMap,
          vatMap,
        );
        await ensureRetailPackages(codes);
      }

      setStatusMessage("Refreshed — search cleared and prices updated.");
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
      const ok = await confirm({
        title: "Change stock source",
        message: "Changing stock source will clear the current cart. Continue?",
        confirmLabel: "Continue",
        destructive: true,
      });
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

  const schedulePosReceiptPrint = useCallback(
    (sale) => {
      if (!sale?.id || !posSalesConfig.showCheckoutOnCreate) {
        setReceiptPrintStatus(null);
        return;
      }
      setReceiptPrintStatus("pending");
      const documentType =
        resolveOrderPrintDocumentType(capabilities?.module_settings) ?? "receipt";
      void printSaleOrder(
        sale,
        offlinePrintOptions(sale, {
          capabilities,
          organization,
          organizationName: capabilities?.profile_label,
          uomById,
          user,
          preparedBy: user?.full_name ?? user?.username ?? null,
          documentType,
          // Checkout already returned the sale — skip redundant print setup round-trips.
          skipSaleRefresh: true,
          skipSettingsRefresh: true,
          skipOrganizationRefresh: Boolean(organization?.name || capabilities?.profile_label),
        }),
      )
        .then((result) => {
          if (!result) {
            setReceiptPrintStatus("failed");
            notifyError(
              `Order ${sale.order_num ? `#${sale.order_num}` : ""} saved. Print was cancelled or no format was selected.`,
            );
            return;
          }
          setReceiptPrintStatus("printed");
        })
        .catch((printErr) => {
          console.error("Receipt print failed", printErr);
          setReceiptPrintStatus("failed");
          const label = sale.order_num ? `#${sale.order_num}` : "";
          notifyError(
            `Order ${label} saved. Receipt did not print — use Reprint on the confirmation screen or Administration → ${LOCAL_PRINTING_ADMIN_LABEL}.`,
          );
        });
    },
    [posSalesConfig.showCheckoutOnCreate, capabilities, organization, uomById, user],
  );

  async function handleCheckout(body, options = {}) {
    const activeCart = cartRef.current ?? cart;
    const summary = cartSummaryRef.current ?? cartSummary;
    if (!activeCart?.id) return null;
    if (requireTillFloat && !activeSession) {
      promptTillFloatSession(
        suspendedSession
          ? "Resume your suspended session before completing sales."
          : "Open a till session and declare your operating float before completing sales.",
      );
      return null;
    }

    if (
      standalone &&
      activeCart.held_order_num &&
      offlineMode &&
      !activeCart.offline_client_sale_uuid
    ) {
      setPaymentError(
        "Reconnect to finish editing this previous order. Offline checkout cannot reuse a server order number.",
      );
      return null;
    }

    // Offline External POS: cash-only, real reserved order numbers, print, queue sync.
    // Also used when revising a pending offline sale (same order # / client uuid).
    if (
      standalone &&
      (offlineMode || activeCart.offline) &&
      (!activeCart.held_order_num || activeCart.offline_client_sale_uuid)
    ) {
      const method = String(body?.payment_method_code ?? "").toUpperCase();
      const cashPay = Number(body?.pay_now ?? summary?.amountDue ?? 0);
      if (method && method !== "CASH") {
        setPaymentError(
          "Offline mode supports cash payments only. Reconnect for M-Pesa or other methods.",
        );
        return null;
      }
      if (body?.is_credit_sale) {
        setPaymentError("Credit sales are not available offline.");
        return null;
      }
      setBusy(true);
      setPaymentError(null);
      setReceiptPrintStatus(null);
      try {
        const local = {
          id: "active",
          lines: (activeCart.lines ?? []).map((l) => ({
            ...l,
            client_line_id: l.client_line_id ?? l.id,
          })),
          branch_id: activeCart.branch_id ?? user?.branch_id,
          till_id: activeCart.till_id ?? tillId,
          float_session_id: floatSessionId ?? activeCart.float_session_id,
          customer_num: body?.customer_num ?? activeCart.customer_num,
          customer_name_override:
            body?.customer_name_override ?? activeCart.customer_name_override,
          held_order_num: activeCart.held_order_num ?? null,
          offline_client_sale_uuid: activeCart.offline_client_sale_uuid ?? null,
          offline_edit_snapshot: activeCart.offline_edit_snapshot ?? null,
        };
        const { sale } = await completeOfflineCashSale({
          cart: local,
          user,
          organization,
          cashAmount: cashPay > 0 ? cashPay : summarizeLocalPosCart(local).amountDue,
          floatSessionId,
        });
        setCompletedSale(sale);
        rememberCompletedPosOrder(sale);
        setCart(null);
        setSelectedLineId(null);
        clearPosUiDraft();
        clearLineEntry();
        setStatusMessage(
          activeCart.held_order_num
            ? `Offline sale #${sale.order_num} updated — will sync when internet returns.`
            : `Offline sale #${sale.order_num} saved — will sync when internet returns.`,
        );
        if (!options.skipPrint) {
          schedulePosReceiptPrint(sale);
        }
        void refreshOfflineCounts();
        return sale;
      } catch (e) {
        setPaymentError(e?.message ?? "Offline checkout failed.");
        return null;
      } finally {
        setBusy(false);
      }
    }

    setBusy(true);
    setPaymentError(null);
    setReceiptPrintStatus(null);
    try {
      const submitKra =
        options.forceSubmitKra != null
          ? Boolean(options.forceSubmitKra)
          : shouldSubmitKraOnCheckout(
              capabilities?.module_settings,
              capabilities,
              summary?.total,
            );
      if (activeCart?.held_order_num) {
        if (body.customer_num) {
          rememberPosOrderCustomer(activeCart.held_order_num, {
            name: body.customer_name_override,
            customerNum: body.customer_num,
          });
        } else if (body.customer_name_override) {
          rememberPosOrderCustomerName(activeCart.held_order_num, body.customer_name_override);
        }
      }

      const { __force_submit_kra: _ignoredForceKra, ...checkoutInput } = body ?? {};
      const checkoutBody = await attachDiscountApprovalReasonToCheckoutBody({
        ...checkoutInput,
        sales_workspace: salesWorkspace,
        submit_kra: submitKra,
        ...(activeCart?.held_order_num ? { order_num: activeCart.held_order_num } : {}),
        ...(requireTillFloat && floatSessionId ? { float_session_id: floatSessionId } : {}),
      });
      if (!checkoutBody) {
        setPaymentError("Enter a discount reason to save this order for manager approval.");
        return null;
      }
      const checkoutRequest = () =>
        apiRequest(`/sales/carts/${activeCart.id}/checkout`, {
          method: "POST",
          body: checkoutBody,
        });
      const sale = submitKra
        ? await runBlockingTask(checkoutRequest, {
            message: "Completing sale…",
            detail: "Submitting receipt to the KRA device. Please wait.",
          })
        : await withPosCheckoutTimeout(
            checkoutRequest(),
            "Checkout timed out. Check that the API is running and try again.",
          );
      setCompletedSale(sale);
      rememberCompletedPosOrder(sale);
      setCart(null);
      setSelectedLineId(null);
      clearPosUiDraft();
      clearLineEntry();
      if (!options.skipPrint) {
        schedulePosReceiptPrint(sale);
      }
      return sale;
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof TypeError && /fetch/i.test(e.message)
            ? "Cannot reach the server. Check your connection and that the API is running."
            : "Checkout failed";
      setPaymentError(message);
      if (standalone) {
        notifyError(message);
      }
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

  /** Line edits while restoring a previous order stay local until Complete. */
  function scheduleEditedOrderAutosave() {
    // Intentionally no-op — do not checkout until the cashier completes again.
  }

  /**
   * Push draft cart lines to the open edit cart on the server (clear, then POST draft lines).
   * Returns the refreshed cart, or null on failure.
   */
  async function flushEditedOrderDraftToServer() {
    const activeCart = cartRef.current;
    if (!activeCart?.id || !activeCart?.held_order_num) return null;
    const draftLines = (activeCart.lines ?? []).filter(
      (line) => Number(line.quantity ?? 0) > 0 && line.product_code,
    );
    if (!draftLines.length) {
      flashPosShortcutMessage("Add items before completing this order.");
      return null;
    }

    const isServerLineId = (id) => {
      const s = String(id ?? "");
      return s !== "" && !s.startsWith("pending-") && !s.startsWith("opt-");
    };

    setLineBusy(true);
    try {
      // Read live server lines first — local deletes are not on the API yet.
      // Delete line-by-line (bulk DELETE clears held_order_num and reinstates the old sale).
      const liveCart =
        (await apiRequest(`/sales/carts/${activeCart.id}`, POS_CART_REQUEST)) ?? activeCart;
      const serverLineRefs = [
        ...new Set(
          (liveCart.lines ?? [])
            .filter((line) => isServerLineId(line?.id) || isServerLineId(line?.update_code))
            .map((line) => String(line.update_code ?? line.id)),
        ),
      ];
      let nextCart = {
        ...liveCart,
        held_order_num: activeCart.held_order_num,
        superseded_sale_id: activeCart.superseded_sale_id,
      };
      for (const lineRef of serverLineRefs) {
        const updated = await apiRequest(`/sales/carts/${activeCart.id}/lines/${lineRef}`, {
          method: "DELETE",
          ...POS_CART_REQUEST,
        });
        const normalized = applyCartMutationResponse(nextCart, updated);
        nextCart = {
          ...(normalized ?? {
            ...nextCart,
            lines: (nextCart.lines ?? []).filter(
              (line) => String(line.update_code ?? line.id) !== lineRef,
            ),
          }),
          held_order_num: activeCart.held_order_num,
          superseded_sale_id: activeCart.superseded_sale_id,
        };
      }

      nextCart = {
        ...nextCart,
        lines: [],
        held_order_num: activeCart.held_order_num,
        superseded_sale_id: activeCart.superseded_sale_id,
      };
      cartRef.current = nextCart;
      setCart(nextCart);

      for (const line of draftLines) {
        const qty = Math.max(0.0001, Number(line.quantity) || 0);
        const unitPrice = Number(line.unit_price ?? line.price ?? 0);
        const body = {
          product_code: line.product_code,
          quantity: qty,
          unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
          display_unit_price:
            line.display_unit_price != null
              ? Number(line.display_unit_price)
              : undefined,
          uom: line.uom ?? undefined,
          on_wholesale_retail: Number(line.on_wholesale_retail ?? 0) ? 1 : 0,
          discount_given: Number(line.discount_given ?? 0) || 0,
          product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
        };
        const updated = await apiRequest(`/sales/carts/${activeCart.id}/lines`, {
          method: "POST",
          body,
          ...POS_CART_REQUEST,
        });
        nextCart = {
          ...applyCartMutationResponse(nextCart, updated),
          held_order_num: activeCart.held_order_num,
          superseded_sale_id: activeCart.superseded_sale_id,
        };
        cartRef.current = nextCart;
        setCart(nextCart);
      }
      return cartRef.current ?? nextCart;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Could not save order changes");
      return null;
    } finally {
      setLineBusy(false);
    }
  }

  /**
   * Complete a previous-order edit: flush draft lines, checkout same order_num, optional print.
   * Call only from Complete / F10 / Save & new — not on every line change.
   */
  async function finalizeEditedOrder({
    quiet = false,
    submitKra = true,
    promptReprint = true,
  } = {}) {
    const activeCart = cartRef.current;
    if (!activeCart?.id || !activeCart?.held_order_num) return null;
    if (!activeCart?.lines?.length) {
      flashPosShortcutMessage("Add items before completing this order.");
      return null;
    }
    if (cartStockBlocked || busy || lineBusy) {
      flashPosShortcutMessage(
        lineBusy || busy
          ? "Wait a moment, then try Complete again."
          : "Fix stock issues before completing this order.",
      );
      return null;
    }
    if (editAutosaveInFlightRef.current) return null;
    editAutosaveInFlightRef.current = true;
    skipEditAutosaveRef.current = true;
    try {
      // Offline pending sale edit: rewrite the outbox under the same order #.
      if (activeCart.offline || activeCart.offline_client_sale_uuid) {
        const summary = cartSummaryRef.current ?? summarizeLocalPosCart(activeCart);
        const total = Number(summary?.amountDue ?? summary?.total ?? 0);
        const payNow = Math.max(0, total);
        const orderNum = activeCart.held_order_num;
        const customerMemory = getPosOrderCustomer(orderNum);
        const body = {
          pay_now: payNow,
          payment_method_code: "CASH",
          payment_reference: null,
          payment_date: new Date().toISOString().slice(0, 10),
          status: "completed",
          is_credit_sale: false,
          deduct_stock: true,
          order_num: orderNum,
        };
        if (customerMemory.customerNum != null) {
          body.customer_num = customerMemory.customerNum;
        }
        if (customerMemory.name) {
          body.customer_name_override = customerMemory.name;
        } else if (posSalesConfig.enableCheckoutCustomerName) {
          body.customer_name_override = "Walk-in";
        }
        const sale = await handleCheckout(body, { skipPrint: true, forceSubmitKra: false });
        if (!sale?.id) return null;

        const orderLabel = sale.order_num ?? orderNum;
        setStatusMessage(`Order #${orderLabel} updated (offline). Will sync when internet returns.`);
        if (!quiet && standalone) {
          notifySuccess(`Order #${orderLabel} saved offline.`);
        }

        skipEditAutosaveRef.current = true;
        await loadCashierCart();
        setEditOrderNo("");
        setCompletedSale(sale);
        setEditSourceSale(null);
        void refreshOfflineCounts();
        void loadCompletedPosOrders();

        if (promptReprint) {
          const reprint = await confirm({
            title: "Print receipt?",
            message: `Order #${orderLabel} was saved. Print the receipt now?`,
            confirmLabel: "Yes, print",
            cancelLabel: "No",
          });
          if (reprint) {
            setReceiptPrintStatus("pending");
            try {
              const result = await printSaleOrder(
                sale,
                offlinePrintOptions(sale, {
                  capabilities,
                  organization,
                  organizationName: capabilities?.profile_label,
                  uomById,
                  user,
                  preparedBy: user?.full_name ?? user?.username ?? null,
                  documentType:
                    resolveOrderPrintDocumentType(capabilities?.module_settings) ?? "receipt",
                }),
              );
              if (!result) {
                setReceiptPrintStatus("failed");
                notifyError("Print cancelled or no format was selected.");
              } else {
                setReceiptPrintStatus("printed");
                if (standalone) notifySuccess(`Receipt printed for order #${orderLabel}.`);
                else setStatusMessage(`Receipt printed for order #${orderLabel}.`);
              }
            } catch (printErr) {
              setReceiptPrintStatus("failed");
              notifyError(printErr instanceof Error ? printErr.message : "Receipt print failed");
            }
          }
        }
        return sale;
      }

      const flushed = await flushEditedOrderDraftToServer();
      if (!flushed?.id) return null;

      const summary = cartSummaryRef.current;
      const lines = flushed.lines ?? cartRef.current?.lines ?? [];
      const lineTotal = lines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
      const total = Number(summary?.amountDue ?? summary?.total ?? lineTotal);
      const payNow = Math.max(0, total);
      const orderNum = flushed.held_order_num ?? activeCart.held_order_num;
      const customerMemory = getPosOrderCustomer(orderNum);
      const status = resolveCheckoutStatus({
        channel,
        isCredit: false,
        payNow,
        total,
        workflow: channelWorkflow,
        paymentMethodCode: "CASH",
        allowPartialPayment: posSalesConfig.payment?.allowPartialPayment,
      });
      const body = {
        pay_now: payNow,
        payment_method_code: "CASH",
        payment_reference: null,
        payment_date: new Date().toISOString().slice(0, 10),
        status,
        is_credit_sale: false,
        deduct_stock: true,
        order_num: orderNum,
      };
      if (customerMemory.customerNum != null) {
        body.customer_num = customerMemory.customerNum;
      }
      if (customerMemory.name) {
        body.customer_name_override = customerMemory.name;
      } else if (posSalesConfig.enableCheckoutCustomerName) {
        body.customer_name_override = "Walk-in";
      }

      const kra =
        submitKra &&
        shouldSubmitKraOnCheckout(
          capabilities?.module_settings,
          capabilities,
          total,
        );
      const sale = await handleCheckout(body, { skipPrint: true, forceSubmitKra: kra });
      if (!sale?.id) return null;

      const orderLabel = sale.order_num ?? orderNum;
      setStatusMessage(`Order #${orderLabel} updated. Complete again after any further edits.`);
      if (!quiet && standalone) {
        notifySuccess(`Order #${orderLabel} saved.`);
      }

      skipEditAutosaveRef.current = true;
      await loadCashierCart();
      setEditOrderNo("");
      setCompletedSale(sale);

      if (promptReprint) {
        const reprint = await confirm({
          title: "Print receipt?",
          message: `Order #${orderLabel} was saved. Print the receipt now?`,
          confirmLabel: "Yes, print",
          cancelLabel: "No",
        });
        if (reprint) {
          setReceiptPrintStatus("pending");
          try {
            const result = await printSaleOrder(sale, {
              capabilities,
              organization,
              organizationName: capabilities?.profile_label,
              uomById,
              user,
              preparedBy: user?.full_name ?? user?.username ?? null,
            });
            if (!result) {
              setReceiptPrintStatus("failed");
              notifyError("Print cancelled or no format was selected.");
            } else {
              setReceiptPrintStatus("printed");
              if (standalone) notifySuccess(`Receipt printed for order #${orderLabel}.`);
              else setStatusMessage(`Receipt printed for order #${orderLabel}.`);
            }
          } catch (e) {
            setReceiptPrintStatus("failed");
            notifyError(e instanceof Error ? e.message : "Receipt print failed");
          }
        }
      }
      return sale;
    } finally {
      editAutosaveInFlightRef.current = false;
      window.setTimeout(() => {
        skipEditAutosaveRef.current = false;
      }, 400);
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
    setReceiptPrintStatus(null);
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
      if (cart?.held_order_num) {
        if (walkIn) {
          rememberPosOrderCustomerName(cart.held_order_num, body.customer_name_override);
        } else if (customer) {
          rememberPosOrderCustomer(cart.held_order_num, {
            name: customer.customer_name,
            customerNum: customer.customer_num,
          });
        }
      }
      const checkoutBody = await attachDiscountApprovalReasonToCheckoutBody({
        ...body,
        sales_workspace: salesWorkspace,
        ...(cart?.held_order_num ? { order_num: cart.held_order_num } : {}),
        ...(requireTillFloat && floatSessionId ? { float_session_id: floatSessionId } : {}),
      });
      if (!checkoutBody) {
        setSaveOrderError("Enter a discount reason to save this order for manager approval.");
        return;
      }
      const sale = await apiRequest(`/sales/carts/${cart.id}/checkout`, {
        method: "POST",
        body: checkoutBody,
      });
      setCompletedSale(sale);
      setSaveOrderOpen(false);
      clearPosUiDraft();
      clearLineEntry();
      setSelectedLineId(null);
      await loadCashierCart();
      const who = walkIn
        ? walkInName?.trim() || "Walk-in"
        : customer?.customer_name;
      const whoSuffix = who ? ` for ${who}` : "";
      const successText = hold
        ? `Order held${whoSuffix} — #${sale.order_num}. Ready for next sale.`
        : `Order saved${whoSuffix} — #${sale.order_num} (${sale.status}). Ready for next sale.`;
      if (standalone) {
        notifySuccess(successText);
      } else {
        setStatusMessage(successText);
      }
      if (hold) {
        await loadHeldOrdersCount();
      }
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof TypeError && /fetch/i.test(e.message)
            ? "Cannot reach the server. Check your connection and that the API is running."
            : hold
              ? "Failed to hold order"
              : "Failed to save order";
      setSaveOrderError(message);
      if (standalone || !saveOrderOpen) {
        notifyError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  function openSaveOrderDialog(mode) {
    if (mode === "hold" && (modernOrderEditLocked || isCartEditSession)) {
      flashPosShortcutMessage("Cannot hold while editing a previous order.");
      return;
    }
    setSaveOrderError(null);
    // Org setting off → hold/save immediately as Walk-in (no customer prompt).
    if (!posSalesConfig.enableCheckoutCustomerName) {
      void handleSaveOrder({
        walkIn: true,
        walkInName: "Walk-in",
        hold: mode === "hold",
      });
      return;
    }
    setOrderDialogMode(mode);
    setSaveOrderOpen(true);
  }

  const focusProductSearch = useCallback(() => {
    clearLineEntry();
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select?.();
    });
  }, []);

  /** F8 / empty-space double-click: clear workspace and focus scan for a new order. */
  async function startFreshWorkspace() {
    if (busy || lineBusy) return;
    if (editAutosaveTimerRef.current) {
      window.clearTimeout(editAutosaveTimerRef.current);
      editAutosaveTimerRef.current = null;
    }
    skipEditAutosaveRef.current = true;

    const hasLines = (cartRef.current?.lines?.length ?? cart?.lines?.length ?? 0) > 0;
    const activeCart = cartRef.current ?? cart;
    const editingPrevious = Boolean(activeCart?.held_order_num);

    if (hasLines || editingPrevious) {
      const ok = await confirm({
        title: "New order",
        message: editingPrevious
          ? "Save changes to this order and start a new order?"
          : "Clear this workspace and start a new order?",
        confirmLabel: editingPrevious ? "Save & new order" : "Start new order",
        destructive: !editingPrevious,
      });
      if (!ok) {
        skipEditAutosaveRef.current = false;
        return;
      }
    }

    setPaymentOpen(false);
    setPaymentError(null);
    setCompletedSale(null);
    setEditSourceSale(null);
    setCartLineSaveFailed(false);
    setReplacingLineId(null);
    setSelectedLineId(null);
    setEditingLineId(null);
    setEditingLineRef(null);
    orderNoUserEditedRef.current = false;
    setOrderEditError(null);
    setEditBrowseIndex(0);
    clearLineEntry();
    setStatusMessage(null);
    try {
      // Mid-edit: checkout under the same order # so ← can open it again, then start fresh.
      // Do this before setBusy — finalizeEditedOrder bails when busy is already true.
      if (editingPrevious && (activeCart?.lines?.length ?? 0) > 0) {
        const saved = await finalizeEditedOrder({
          quiet: false,
          submitKra: false,
          promptReprint: false,
        });
        if (saved?.id) {
          const next = cartRef.current ?? (await loadCashierCart());
          cartRef.current = next;
          orderNoUserEditedRef.current = false;
          if (next?.next_order_num != null) {
            setEditOrderNo(String(next.next_order_num));
          } else {
            setEditOrderNo("");
          }
          setStatusMessage("New order — scan or search a product.");
          if (standalone) notifySuccess("Order saved — ready for a new order.");
          focusProductSearch();
          return;
        }
        // Fall through to clear/reinstate if save failed.
      }

      setBusy(true);
      if (activeCart?.offline || activeCart?.offline_client_sale_uuid) {
        // Abandon offline edit without saving line changes — reinstate queued sale.
        if (activeCart.held_order_num) {
          await abandonOfflineSaleEdit(activeCart);
        } else {
          await clearLocalPosCart();
        }
      } else if (activeCart?.id && (hasLines || activeCart.held_order_num)) {
        await apiRequest(`/sales/carts/${activeCart.id}/lines`, { method: "DELETE" });
      }
      const next = await loadCashierCart();
      cartRef.current = next;
      orderNoUserEditedRef.current = false;
      if (next?.next_order_num != null) {
        setEditOrderNo(String(next.next_order_num));
      } else {
        setEditOrderNo("");
      }
      // Refresh ← list so reinstated receipts are openable again.
      if (enablePosOrderEdit && standalone) {
        void loadCompletedPosOrders();
      }
      setStatusMessage("New order — scan or search a product.");
      if (standalone) notifySuccess("Workspace cleared — ready for a new order.");
      focusProductSearch();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Failed to start new order";
      setStatusMessage(message);
      if (standalone) notifyError(message);
    } finally {
      setBusy(false);
      window.setTimeout(() => {
        skipEditAutosaveRef.current = false;
      }, 400);
    }
  }

  async function handleNewOrder() {
    await startFreshWorkspace();
  }

  async function handlePrintReceipt() {
    const sale =
      modernOrderEditLocked && editSourceSale?.id ? editSourceSale : completedSale;
    if (!sale?.id) {
      const message = modernOrderEditLocked
        ? "No receipt available for this order yet."
        : "No completed order to print. Complete payment first (F10).";
      if (standalone) notifyError(message);
      else setStatusMessage(message);
      return;
    }
    setReceiptPrintStatus("pending");
    try {
      const result = await printSaleOrder(
        sale,
        offlinePrintOptions(sale, {
          capabilities,
          organization,
          organizationName: capabilities?.profile_label,
          uomById,
          user,
          preparedBy: user?.full_name ?? user?.username ?? null,
          documentType:
            resolveOrderPrintDocumentType(capabilities?.module_settings) ?? "receipt",
          skipSaleRefresh: true,
          skipSettingsRefresh: true,
          skipOrganizationRefresh: Boolean(organization?.name || capabilities?.profile_label),
        }),
      );
      if (!result) {
        setReceiptPrintStatus("failed");
        notifyError("Print cancelled or no format was selected.");
        if (!standalone) setStatusMessage("Print cancelled.");
        return;
      }
      setReceiptPrintStatus("printed");
      const message = `Reprinting order #${sale.order_num}.`;
      if (standalone) notifySuccess(message);
      else setStatusMessage(message);
    } catch (e) {
      setReceiptPrintStatus("failed");
      const message = e instanceof Error ? e.message : "Receipt print failed";
      notifyError(message);
      if (!standalone) setStatusMessage("Receipt print failed.");
    }
  }

  async function restoreOrderForEdit(saleId, { replace = false, saleSnapshot = null, keepEditing = false } = {}) {
    if (saleId == null || saleId === "") {
      const message = "No order selected to edit.";
      setOrderEditError(message);
      setStatusMessage(message);
      return;
    }

    if (isOfflinePendingSaleId(saleId)) {
      const hasOpenLines = (cart?.lines?.length ?? 0) > 0;
      if (hasOpenLines && !replace) {
        const ok = await confirm({
          title: "Load previous order",
          message:
            "Your workspace has an open order. Clear it and load the previous order?",
          confirmLabel: "Continue",
          cancelLabel: "Cancel",
          destructive: true,
        });
        if (!ok) return;
        replace = true;
      }

      setBusy(true);
      setOrderEditError(null);
      try {
        if (replace && cart?.offline_client_sale_uuid && cart.offline_client_sale_uuid !== parseOfflineSaleUuid(saleId)) {
          await abandonOfflineSaleEdit(cart);
        }
        const { cart: localCart, sale } = await beginOfflineSaleEdit(saleId, {
          seed: {
            branch_id: user?.branch_id,
            till_id: tillId,
            float_session_id: floatSessionId,
          },
        });
        const restoredCart = presentLocalOfflineCart(localCart);
        cartRef.current = restoredCart;
        setCart(restoredCart);
        setSelectedLineId(null);
        setEditingLineId(null);
        setEditingLineRef(null);
        setReplacingLineId(null);
        setPaymentOpen(false);
        setCompletedSale(null);
        setEditSourceSale(saleSnapshot?.id ? saleSnapshot : sale);
        orderNoUserEditedRef.current = false;
        const orderNum = restoredCart?.held_order_num;
        if (orderNum != null) {
          setEditOrderNo(String(orderNum));
          setSessionPosOrders((prev) => {
            const next = prev.filter((row) => String(row.id) !== String(saleId));
            const idx = next.findIndex((row) => String(row.order_num) === String(orderNum));
            setEditBrowseIndex(idx >= 0 ? idx : 0);
            return next;
          });
          const customerMemory = extractSaleCustomerMemory(saleSnapshot ?? sale);
          if (customerMemory.name || customerMemory.customerNum != null) {
            rememberPosOrderCustomer(orderNum, customerMemory);
          }
        }
        setStatusMessage(
          keepEditing
            ? `Editing offline order #${orderNum}. Changes stay local until you complete.`
            : `Loaded offline order #${orderNum} for edit. Complete to update the queued sale.`,
        );
        if (standalone) {
          notifySuccess(`Editing offline order #${orderNum}.`);
        }
        void refreshOfflineCounts();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load offline order";
        setOrderEditError(message);
        setStatusMessage(message);
        if (standalone) notifyError(message);
      } finally {
        setBusy(false);
      }
      return;
    }

    const hasOpenLines = (cart?.lines?.length ?? 0) > 0;
    if (hasOpenLines && !replace) {
      const ok = await confirm({
        title: "Load previous order",
        message:
          "Your workspace has an open order. Clear it and load the previous order?",
        confirmLabel: "Continue",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!ok) return;
      replace = true;
    }

    setBusy(true);
    setOrderEditError(null);
    try {
      const restoredCart = await apiRequest(`/sales/orders/${saleId}/restore-to-cart`, {
        method: "POST",
        body: { replace },
      });
      cartRef.current = restoredCart;
      setCart(restoredCart);
      setSelectedLineId(null);
      setEditingLineId(null);
      setEditingLineRef(null);
      setReplacingLineId(null);
      setPaymentOpen(false);
      setCompletedSale(null);
      setEditSourceSale(
        saleSnapshot?.id
          ? saleSnapshot
          : { id: saleId, order_num: restoredCart?.held_order_num ?? null },
      );
      orderNoUserEditedRef.current = false;
      const orderNum = restoredCart?.held_order_num ?? restoredCart?.next_order_num;
      if (orderNum != null) {
        setEditOrderNo(String(orderNum));
        // Sale is tombstoned while editing — drop it from ← list until checkout recreates it.
        setSessionPosOrders((prev) => {
          const next = prev.filter((row) => String(row.id) !== String(saleId));
          // Keep browse index aligned with the loaded order # (or clamp).
          const idx = next.findIndex((row) => String(row.order_num) === String(orderNum));
          setEditBrowseIndex(idx >= 0 ? idx : 0);
          return next;
        });

        let customerMemory = extractSaleCustomerMemory(saleSnapshot);
        if (!customerMemory.name && customerMemory.customerNum == null) {
          try {
            const sale = await apiRequest(`/sales/${saleId}`);
            customerMemory = extractSaleCustomerMemory(sale);
          } catch {
            customerMemory = { name: "", customerNum: null };
          }
        }
        if (customerMemory.name || customerMemory.customerNum != null) {
          rememberPosOrderCustomer(orderNum, customerMemory);
        }
      }
      const label = restoredCart?.held_order_num ?? saleId;
      setPaymentOpen(false);
      setStatusMessage(
        keepEditing
          ? `Order #${label} updated — keep editing lines; changes save to this order.`
          : `Order #${label} loaded — line changes save to this order automatically (no payment).`,
      );
    } catch (e) {
      const message = dedupeErrorMessage(e instanceof ApiError ? e.message : "Could not load order for editing");
      if (
        !replace &&
        (message.toLowerCase().includes("already has items") ||
          message.toLowerCase().includes("clear it first") ||
          message.toLowerCase().includes("confirm replace"))
      ) {
        const ok = await confirm({
          title: "Load previous order",
          message:
            "Your workspace has an open order. Clear it and load the previous order?",
          confirmLabel: "Continue",
          cancelLabel: "Cancel",
          destructive: true,
        });
        if (ok) {
          setBusy(false);
          return restoreOrderForEdit(saleId, { replace: true, saleSnapshot });
        }
        return;
      }
      setOrderEditError(message);
      setStatusMessage(message);
      if (standalone) notifyError(message);
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
      try {
        const offlineOrders = await listOfflinePendingSalesForEdit();
        const offlineMatch = offlineOrders.find((row) => String(row.order_num) === trimmed);
        if (offlineMatch?.id) {
          await restoreOrderForEdit(offlineMatch.id, { saleSnapshot: offlineMatch });
          return;
        }
      } catch {
        /* fall through to server lookup */
      }

      const res = await apiRequest("/sales", {
        searchParams: buildPageParams({
          page: 1,
          perPage: 25,
          q: trimmed,
          extra: {
            for_pos_order_edit: 1,
            channel: "pos",
            order_source: "pos",
            with_items: 0,
          },
        }),
      });
      const rows = Array.isArray(res?.data) ? res.data : [];
      const match =
        rows.find(
          (row) =>
            String(row.order_num) === trimmed &&
            Number(row.order_num) < 9_000_000 &&
            !row?.fulfillment_meta?.superseded_by_edit,
        ) ?? rows.find((row) => String(row.order_num) === trimmed);
      if (!match?.id) {
        const message = `No POS order found with number ${trimmed}.`;
        setOrderEditError(message);
        setStatusMessage(message);
        return;
      }
      await restoreOrderForEdit(match.id, { saleSnapshot: match });
    } catch (e) {
      const message = e instanceof ApiError ? dedupeErrorMessage(e.message) : "Order lookup failed";
      setOrderEditError(message);
      setStatusMessage(message);
      if (standalone) notifyError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSelectedOrder() {
    const trimmed = editOrderNo.trim();
    if (!trimmed) {
      const message = "Enter an order number to load.";
      setOrderEditError(message);
      setStatusMessage(message);
      return;
    }
    // On a new order the box shows the next # — Enter/click opens the current (latest) receipt.
    if (
      !isCartEditSession &&
      cart?.next_order_num != null &&
      String(cart.next_order_num) === trimmed
    ) {
      await classicOpenCurrentOrder();
      return;
    }
    const fromSession = sessionPosOrders.find((row) => String(row.order_num) === trimmed);
    // Always resolve the live sale by order # (session ids can be stale after edits).
    // Offline pending rows are restored from IndexedDB via restoreOrderForEdit.
    if (fromSession?.id != null && isOfflinePendingSaleId(fromSession.id)) {
      orderNoUserEditedRef.current = false;
      await restoreOrderForEdit(fromSession.id, { saleSnapshot: fromSession });
      return;
    }
    orderNoUserEditedRef.current = false;
    await handleEditByOrderNumber(trimmed);
  }

  /** Click the order # (while it shows the next number) → load the latest completed (“current”) order. */
  async function classicOpenCurrentOrder() {
    if (!enablePosOrderEdit || busy) return;
    if (isCartEditSession) return;

    setStatusMessage("Loading completed POS orders…");
    const orders = await loadCompletedPosOrders();
    if (!orders.length) {
      const message =
        "No completed POS order to open yet. Complete a sale first, then click the order # to reopen it.";
      setOrderEditError(message);
      setStatusMessage(message);
      return;
    }

    const row = orders[0];
    orderNoUserEditedRef.current = false;
    setEditBrowseIndex(0);
    setEditOrderNo(String(row.order_num));
    setOrderEditError(null);
    await restoreOrderForEdit(row.id, { saleSnapshot: row });
  }

  async function goPreviousOrder() {
    if (!canGoPreviousOrder || busy) return;
    const nextIndex = editBrowseIndex + 1;
    const row = sessionPosOrders[nextIndex];
    if (!row?.id) return;
    orderNoUserEditedRef.current = false;
    setEditBrowseIndex(nextIndex);
    setEditOrderNo(String(row.order_num));
    setOrderEditError(null);
    await restoreOrderForEdit(row.id, { replace: true, saleSnapshot: row });
  }

  async function goNextOrder() {
    if (!canGoNextOrder || busy) return;
    const nextIndex = editBrowseIndex - 1;
    const row = sessionPosOrders[nextIndex];
    if (!row?.id) return;
    orderNoUserEditedRef.current = false;
    setEditBrowseIndex(nextIndex);
    setEditOrderNo(String(row.order_num));
    setOrderEditError(null);
    await restoreOrderForEdit(row.id, { replace: true, saleSnapshot: row });
  }

  /** Classic caption arrows: load previous completed receipt / return toward new order. */
  const classicCanGoPrevious = Boolean(enablePosOrderEdit);
  const classicCanGoNext = enablePosOrderEdit && isCartEditSession;

  async function classicGoPreviousOrder() {
    if (!enablePosOrderEdit || busy) return;

    if (!isCartEditSession) {
      // ← from new order (next #) opens the current completed receipt.
      await classicOpenCurrentOrder();
      return;
    }

    setStatusMessage("Loading completed POS orders…");
    const orders = await loadCompletedPosOrders();
    const heldNum = cartRef.current?.held_order_num ?? cart?.held_order_num;
    // Walk older than the order currently being edited (list is newest-first).
    let startIndex = 0;
    if (heldNum != null) {
      const heldIdx = orders.findIndex((row) => String(row.order_num) === String(heldNum));
      startIndex = heldIdx >= 0 ? heldIdx + 1 : editBrowseIndex + 1;
    } else {
      startIndex = editBrowseIndex + 1;
    }
    const row = orders[startIndex];
    if (!row) {
      const message =
        "No older completed POS orders found. Save or finish this edit, then use ←.";
      setOrderEditError(message);
      setStatusMessage(message);
      return;
    }

    orderNoUserEditedRef.current = false;
    setSessionPosOrders(orders);
    setEditBrowseIndex(startIndex);
    setEditOrderNo(String(row.order_num));
    await restoreOrderForEdit(row.id, { replace: true, saleSnapshot: row });
  }

  async function classicGoNextOrder() {
    if (!classicCanGoNext || busy) return;
    if (editBrowseIndex > 0) {
      const nextIndex = editBrowseIndex - 1;
      const orders =
        sessionPosOrders.length > 0 ? sessionPosOrders : await loadCompletedPosOrders();
      const row = orders[nextIndex];
      if (!row) return;
      setEditBrowseIndex(nextIndex);
      setEditOrderNo(String(row.order_num));
      await restoreOrderForEdit(row.id, { replace: true, saleSnapshot: row });
      return;
    }
    await handleNewOrder();
    orderNoUserEditedRef.current = false;
  }

  const classicOrderCaption = useMemo(() => {
    if (isCartEditSession) {
      const orderLabel = formatOrderNumber(cart.held_order_num);
      const customer = prefilledEditCustomerName.trim();
      return customer
        ? `Previous Order, ${orderLabel} - ${customer}`
        : `Previous Order, ${orderLabel}`;
    }
    const rawNum = activeOrderNum ?? (editOrderNo.trim() ? editOrderNo.trim() : null);
    const orderLabel = rawNum != null ? formatOrderNumber(rawNum) : "—";
    return `New Order - ${orderLabel}`;
  }, [
    isCartEditSession,
    cart?.held_order_num,
    prefilledEditCustomerName,
    activeOrderNum,
    editOrderNo,
  ]);

  function flashPosShortcutMessage(message, { error = true } = {}) {
    setStatusMessage(message);
    if (standalone) {
      if (error) notifyError(message);
      else notifySuccess(message);
    }
  }

  function openCompletePayment() {
    if (!cart?.lines?.length) {
      flashPosShortcutMessage("Add items before completing payment (F10).");
      return;
    }
    if (cartStockBlocked) {
      flashPosShortcutMessage("Fix stock issues before completing payment.");
      return;
    }
    if (checkoutBlocked) {
      flashPosShortcutMessage("Wait for cart lines to finish saving, then press F10.");
      return;
    }
    // Previous-order edit: flush draft lines, save under the same order #, then print.
    if (cart?.held_order_num) {
      void finalizeEditedOrder({ quiet: false, submitKra: true, promptReprint: true });
      return;
    }
    setPaymentError(null);
    setPaymentOpen(true);
  }

  /** Latest POS shortcut state/actions — single capture listener, no stale closures. */
  const posShortcutStateRef = useRef({});
  const posShortcutActionsRef = useRef({});
  posShortcutStateRef.current = {
    classicLayout,
    standalone,
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
    autoHeldPrompt: Boolean(autoHeldPrompt),
    discountReasonDialogOpen,
    replacingLineId,
    selectedLineId,
    enableRetailPricing: posSalesConfig.enableRetailPricing,
    showCheckoutOnCreate: posSalesConfig.showCheckoutOnCreate,
    isCartEditSession: Boolean(cart?.held_order_num),
    modernOrderEditLocked,
    lineCount: cart?.lines?.length ?? 0,
    cartStockBlocked,
    checkoutBlocked,
    activeSession: Boolean(activeSession),
  };
  posShortcutActionsRef.current = {
    flashPosShortcutMessage,
    cancelReplaceCartLine,
    focusProductSearch,
    handleNewOrder,
    startFreshWorkspace,
    handleRefresh,
    openSaveOrderDialog,
    handlePrintReceipt,
    removeSelectedLine,
    finalizeEditedOrder,
    confirm,
  };

  useEffect(() => {
    function isModalOpen(state) {
      return (
        state.paymentOpen
        || state.saveOrderOpen
        || state.heldOrdersOpen
        || state.leaveGuardOpen
        || state.priceCheckerOpen
        || state.floatModalOpen
        || state.floatDetailsOpen
        || state.xReportOpen
        || state.closeSessionOpen
        || state.zReportOpen
        || state.autoHeldPrompt
        || state.discountReasonDialogOpen
      );
    }

    function isTypingTarget(el) {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable;
    }

    /** Normalize F-keys across browsers/OS (Mac often needs Fn; keyCode still fires). */
    function shortcutKey(e) {
      const key = String(e.key || "");
      const code = String(e.code || "");
      const keyCode = Number(e.keyCode || e.which || 0);
      if (key === "F2" || code === "F2" || keyCode === 113) return "F2";
      if (key === "F8" || code === "F8" || keyCode === 119) return "F8";
      if (key === "F9" || code === "F9" || keyCode === 120) return "F9";
      if (key === "F10" || code === "F10" || keyCode === 121) return "F10";
      if (key === "F12" || code === "F12" || keyCode === 123) return "F12";
      // Ctrl/Cmd+Enter = payment when OS/browser swallows F10 (common on Mac).
      if ((e.ctrlKey || e.metaKey) && (key === "Enter" || code === "Enter" || keyCode === 13)) {
        return "F10";
      }
      return key;
    }

    function onKeyDown(e) {
      const state = posShortcutStateRef.current;
      const actions = posShortcutActionsRef.current;
      if (isModalOpen(state)) {
        if (e.key === "Escape" && state.priceCheckerOpen) {
          setPriceCheckerOpen(false);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (state.replacingLineId) {
          actions.cancelReplaceCartLine();
          return;
        }
        actions.focusProductSearch();
        return;
      }

      const key = shortcutKey(e);
      const isFn =
        key === "F2" || key === "F8" || key === "F9" || key === "F10" || key === "F12";
      const classicShortcut =
        state.classicLayout &&
        (isFn ||
          (e.altKey && ["h", "H", "f", "F", "p", "P"].includes(e.key)) ||
          (e.key === "Delete" && state.selectedLineId));
      const standaloneFn = state.standalone && isFn;

      if (!classicShortcut && !standaloneFn && isTypingTarget(e.target)) return;

      if (key === "F2" && (state.classicLayout || state.standalone)) {
        e.preventDefault();
        e.stopPropagation();
        if (state.enableRetailPricing) {
          setSellWholesale((prev) => !prev);
        } else {
          actions.focusProductSearch();
        }
        return;
      }
      if (key === "F8" && (state.classicLayout || state.standalone)) {
        e.preventDefault();
        e.stopPropagation();
        void (async () => {
          await actions.startFreshWorkspace();
          if (state.classicLayout) await actions.handleRefresh();
          actions.focusProductSearch();
        })();
        return;
      }
      if (key === "F9" && (state.classicLayout || state.standalone)) {
        e.preventDefault();
        e.stopPropagation();
        setPriceCheckerOpen(true);
        return;
      }
      if (key === "F10" && (state.classicLayout || state.standalone)) {
        e.preventDefault();
        e.stopPropagation();
        if (!state.lineCount) {
          actions.flashPosShortcutMessage("Add items before completing payment (F10).");
          return;
        }
        if (state.cartStockBlocked) {
          actions.flashPosShortcutMessage("Fix stock issues before completing payment.");
          return;
        }
        if (state.checkoutBlocked) {
          actions.flashPosShortcutMessage("Wait for cart lines to finish saving, then press F10.");
          return;
        }
        if (state.isCartEditSession || state.modernOrderEditLocked) {
          void actions.finalizeEditedOrder({ quiet: false, submitKra: true, promptReprint: true });
        } else if (state.showCheckoutOnCreate) {
          setPaymentError(null);
          setPaymentOpen(true);
        } else {
          actions.openSaveOrderDialog("save");
        }
        return;
      }
      if (key === "F12" && state.enableRetailPricing && (state.classicLayout || state.standalone)) {
        e.preventDefault();
        e.stopPropagation();
        setSellWholesale((prev) => !prev);
        return;
      }
      if (state.classicLayout && e.altKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        e.stopPropagation();
        if (!state.lineCount || state.cartStockBlocked) return;
        void (async () => {
          const ok = await actions.confirm({
            title: "HOLD ORDERS",
            message: "Are you sure you want to hold this order?",
            confirmLabel: "Hold",
          });
          if (ok) actions.openSaveOrderDialog("hold");
        })();
        return;
      }
      if (state.classicLayout && e.altKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        e.stopPropagation();
        if (state.activeSession) setFloatDetailsOpen(true);
        return;
      }
      if (state.classicLayout && e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        e.stopPropagation();
        void actions.handlePrintReceipt();
        return;
      }
      if (state.classicLayout && e.key === "Delete" && state.selectedLineId) {
        e.preventDefault();
        e.stopPropagation();
        void actions.removeSelectedLine();
      }
    }

    // Prefer window capture so we see F-keys before React root / inputs.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div
      className={`pos-workspace relative flex min-h-0 flex-1 flex-col${
        standalone ? " h-full pos-workspace-standalone" : " h-full pos-workspace-backoffice p-4 md:p-6 lg:p-8"
      }${classicLayout ? " pos-workspace-classic" : ""}`}
      data-pos-layout={classicLayout ? "classic" : "modern"}
    >
      {standalone ? (
        <>
          <div className="pos-header shrink-0 shadow-sm">
            <div className="pos-header-bar flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 lg:px-5">
              <div className="shrink-0">
                <CentrixLogoHeader
                  markSize={28}
                  title={PRODUCT_NAME}
                  orgSubtitle={organization?.org_name ?? organizationName}
                />
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
                  disabled={
                    busy ||
                    !(modernOrderEditLocked ? editSourceSale?.id : completedSale?.id)
                  }
                  title={
                    modernOrderEditLocked
                      ? editSourceSale?.order_num
                        ? `Reprint order #${editSourceSale.order_num}`
                        : "Reprint this order"
                      : completedSale?.order_num
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
                <NotificationBell />
                <WorkspaceSwitcher />
                {classicLayout ? null : (
                  <ThemeToggle showLabel className="pos-header-theme-btn hidden sm:inline-flex" />
                )}
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
        className={`flex min-h-0 flex-1 flex-col lg:flex-row${
          classicLayout ? " overflow-visible" : " overflow-hidden"
        }${standalone ? " pos-standalone-frame" : " pos-backoffice-frame"}`}
      >
        {/* Left — line entry + payment options */}
        <div className="pos-left-panel flex min-h-0 w-full flex-col self-stretch border-b border-[var(--theme-border)] bg-[var(--theme-page-bg)] lg:w-[min(100%,28rem)] lg:shrink-0 lg:border-b-0 lg:border-r xl:w-[32rem]">
          <div className="pos-search-panel shrink-0 border-b border-[var(--theme-border)] px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-left text-sm font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
                Scan or search items
              </p>
              {activeOrderNum ? (
                <span className="shrink-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-page-bg)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--theme-text)]">
                  Order #{formatOrderNumber(activeOrderNum)}
                </span>
              ) : null}
            </div>
            {standalone && (offlineMode || pendingSync > 0 || offlineSyncing) ? (
              <p
                className={`mt-2 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                  offlineMode
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-sky-200 bg-sky-50 text-sky-950"
                }`}
              >
                {offlineMode
                  ? `${
                      networkStatus === "slow"
                        ? "Slow connection — selling from local cache (cash only)."
                        : "Connection dropped — selling from local cache (cash only)."
                    } Order # left: ${orderNumbersLeft}. Pending sync: ${pendingSync}.`
                  : offlineSyncing
                    ? "Syncing offline sales…"
                    : lastSyncMessage ||
                      `${pendingSync} offline sale(s) waiting to sync. Prices refreshing…`}
              </p>
            ) : null}
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
              {posSalesConfig.enableRetailPricing && !classicLayout ? (
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

          <div className="pos-left-body min-h-0 flex-1 overflow-y-auto">
          {/* Line entry form */}
          <div className="pos-line-entry grid shrink-0 grid-cols-2 gap-x-4 gap-y-4 p-4 text-sm">
            {enablePosOrderEdit ? (
              <div className="col-span-2">
                <PosOrderEditBar
                  enabled
                  busy={busy}
                  orderNo={editOrderNo}
                  onOrderNoChange={(value) => {
                    orderNoUserEditedRef.current = true;
                    setEditOrderNo(value);
                  }}
                  onSubmit={() => void handleEditSelectedOrder()}
                  onPrevious={() => void goPreviousOrder()}
                  onNext={() => void goNextOrder()}
                  canGoPrevious={canGoPreviousOrder}
                  canGoNext={canGoNextOrder}
                  hasOrders={hasSessionOrders}
                  error={orderEditError}
                />
              </div>
            ) : null}
            <div className="col-span-2 space-y-4">
              {classicLayout ? null : (
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
                  posSalesConfig={posSalesConfig}
                  disabled={busy}
                />
              )}
              <div className="space-y-1">
                <PosLabel>Description</PosLabel>
                <input
                  className={fieldInput}
                  value={lineForm.description}
                  readOnly
                  placeholder="Select from search"
                />
                {selectedProductStockLabel ? (
                  <p className="mt-0.5 text-[10px] font-medium text-[var(--theme-accent-text)]">
                    {selectedProductStockLabel}
                  </p>
                ) : null}
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
            {showLineDiscountField ? (
              <div className="col-span-2 space-y-1">
                <PosLabel>{lineDiscountInputLabel(capabilities?.module_settings, { canAutoApprove: canAutoApproveDiscount })}</PosLabel>
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
                ) : discountApprovalActive || allowEditLineDiscount ? (
                  <p className="theme-subtext mt-0.5 text-[10px]">
                    Discount is saved on this line; manager approval is requested when you save the order.
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
            <div className="col-span-2 flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={busy || lineBusy || addLineBlocked}
                onClick={handleAddLine}
                className="theme-primary-btn pos-add-line-btn flex min-w-[8rem] flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold uppercase shadow-sm disabled:opacity-50"
              >
                <span className="text-base">{editingLineId ? "✓" : "+"}</span>
                {lineBusy ? (editingLineId ? "Updating…" : "Adding…") : editingLineId ? "Update" : "Add"}
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
            {showCartPaymentPrompts ? (
              <div className="col-span-2 -mx-4">
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
        </div>

        {/* Right — cart grid */}
        <div className="pos-cart-panel flex min-h-0 flex-1 flex-col self-stretch bg-[var(--theme-page-bg)]">
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
          {isCartEditSession || isEditableResubmit ? (
            <div className={showCartToolbar ? "px-3 pt-3" : "px-3 pt-2"}>
              {isCartEditSession && !isEditableResubmit ? (
                <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950">
                  <p className="text-xs leading-relaxed">
                    Editing order #{cart.held_order_num}. Add, change, or remove items freely —
                    nothing is saved until you Complete (F10). Hold is disabled while editing.
                  </p>
                </div>
              ) : null}
              {cartResubmitMessage ? (
                <div
                  className={`mb-3 rounded-lg border px-3 py-2.5 text-sm ${
                    advisedDiscountReady && matchesAdvisedDiscounts
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                      : "border-amber-300 bg-amber-50 text-amber-950"
                  }`}
                >
                  <p className="text-xs leading-relaxed">{cartResubmitMessage}</p>
                </div>
              ) : null}
              {isEditableResubmit && advisedDiscountLines.length > 0 && !advisedDiscountReady ? (
                <PosAdvisedDiscountPanel
                  lines={advisedDiscountLines}
                  applying={applyingAdvisedDiscounts}
                  onApply={() => void applyAdvisedDiscountsToCart()}
                />
              ) : null}
            </div>
          ) : null}
          <div
            className={`pos-cart-table-wrap min-h-0 flex-1${
              classicLayout
                ? " overflow-visible"
                : " overflow-auto"
            }${
              showCartToolbar ? " p-3" : " pos-cart-table-wrap--flush"
            }`}
            onDoubleClick={
              standalone && !classicLayout
                ? (e) => {
                    const t = e.target;
                    if (!(t instanceof Element)) return;
                    if (t.closest("button, input, a, select, textarea, label, table")) return;
                    void startFreshWorkspace();
                  }
                : undefined
            }
          >
            {classicLayout ? (
              <ClassicPosCartTable
                lines={cart?.lines ?? []}
                selectedLineId={selectedLineId}
                onSelectLine={setSelectedLineId}
                orderCaption={classicOrderCaption}
                showOrderNav
                orderNavLocked={!enablePosOrderEdit}
                orderNavHint={
                  enablePosOrderEdit
                    ? null
                    : "← previous orders require Platform → Sales behaviour → Allow editing completed POS orders"
                }
                canGoPrevious={classicCanGoPrevious}
                canGoNext={classicCanGoNext}
                onPreviousOrder={() => void classicGoPreviousOrder()}
                onNextOrder={() => void classicGoNextOrder()}
                orderNo={editOrderNo}
                onOrderNoChange={(value) => {
                  orderNoUserEditedRef.current = true;
                  setEditOrderNo(value);
                  setOrderEditError(null);
                }}
                onOrderNoClick={() => {
                  if (!enablePosOrderEdit) return;
                  if (isCartEditSession) return;
                  void classicOpenCurrentOrder();
                }}
                onOrderNoSubmit={() => {
                  if (!enablePosOrderEdit) {
                    setStatusMessage(
                      "Enable “Allow editing completed POS orders” under Platform → Sales behaviour. Loading a previous receipt restores stock and issues a KRA credit note when the original sale was fiscalized.",
                    );
                    return;
                  }
                  void handleEditSelectedOrder();
                }}
                orderNavError={orderEditError}
                showRetailModeHint={posSalesConfig.enableRetailPricing}
                sellAtRetail={retailPricingSession}
                replacingLineId={replacingLineId}
                onScanCodeClick={(lineId) => beginReplaceCartLine(lineId)}
                busy={busy}
                lineBusy={lineBusy}
                showLineDiscount={showLineDiscountField}
                formatQty={(line) => {
                  const productMeta = productByCode[line.product_code];
                  const uom = productMeta?.uom;
                  return uom
                    ? formatPosCartQty(line.quantity, uom)
                    : formatMixedStockDisplay(line.quantity, 1).text;
                }}
                lineEntryQty={(line) => {
                  const productMeta = productByCode[line.product_code];
                  if (!productMeta) return String(line.quantity ?? "");
                  return posEntryQtyFromCartLine(
                    line,
                    productMeta,
                    getRetailPackage(line.product_code),
                  );
                }}
                lineQtyUnit={(line) => {
                  const productMeta = productByCode[line.product_code];
                  return (
                    posCartLineEntryUnitLabel(
                      line,
                      productMeta ?? null,
                      getRetailPackage(line.product_code),
                    ) || "pcs"
                  );
                }}
                lineQtyAdjust={(line) => {
                  const productMeta = productByCode[line.product_code];
                  return productMeta
                    ? cartLineQtyAdjustState(line, productMeta, 0)
                    : { canDecrease: false, canIncrease: false };
                }}
                onAdjustQty={(line, delta) => void adjustCartLineQuantity(line, delta)}
                onSetQty={(line, value) => void setCartLineEntryQuantity(line, value)}
                linePackage={(line) => {
                  const productMeta = productByCode[line.product_code];
                  const uom = productMeta?.uom;
                  return uom
                    ? uomWholesaleConversionExample(uom)
                    : (line.uom ?? productMeta?.packaging_label ?? "—");
                }}
                formatMoney={(value) =>
                  Number(value || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                }
                lineUnitPrice={(line) => {
                  const productMeta = productByCode[line.product_code];
                  const uom = productMeta?.uom;
                  const isRetailLine = Number(line.on_wholesale_retail) === 1;
                  return Number(
                    cartLineDisplayUnitPrice(line, uom, isRetailLine),
                  ).toLocaleString();
                }}
                lineDiscount={(line) => {
                  const productMeta = productByCode[line.product_code];
                  return (
                    productMeta
                      ? cartLineEnteredDiscountPerUnit(
                          line,
                          productMeta,
                          getRetailPackage(line.product_code),
                        )
                      : lineDiscountPerUnit(line.discount_given, line.quantity)
                  ).toLocaleString();
                }}
                lineVat={(line) =>
                  Number(line.product_vat ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                }
                lineAmount={(line) =>
                  (enablePosCashRounding
                    ? roundLightStoresAmount(line.amount)
                    : Number(line.amount ?? 0)
                  ).toLocaleString()
                }
                scanSearch={
                  <PosProductSearch
                    variant="classic"
                    inputRef={searchInputRef}
                    query={searchQuery}
                    onQueryChange={(value) => {
                      if (selectedProduct) {
                        setSelectedProduct(null);
                        setSelectedProductCode(null);
                        setLineForm((p) => ({
                          ...p,
                          product_code: "",
                          description: "",
                          package: "",
                          unit_price: "",
                        }));
                      }
                      setSearchQuery(value);
                    }}
                    results={searchResults}
                    searching={searching}
                    selectedCode={selectedProductCode}
                    sellWholesale={sellWholesale}
                    retailByCode={retailByCode}
                    sellFromShop={sellFromShop}
                    onSelect={pickProduct}
                    onBarcodeEnter={handleBarcodeEnter}
                    barcodeEnabled={enableBarcodeScanner}
                    stockDisplayMode={stockDisplayMode}
                    posSalesConfig={posSalesConfig}
                    disabled={busy}
                  />
                }
                qtyRef={qtyInputRef}
                entryDescription={lineForm.description}
                entryPackage={lineForm.package}
                entryQty={lineForm.quantity}
                entryQtyUnit={qtyFieldMeta?.unit ?? ""}
                entryUnitPrice={lineForm.unit_price}
                entryAmount={
                  enablePosCashRounding
                    ? roundLightStoresAmount(
                        Number(lineForm.quantity || 0) * Number(lineForm.unit_price || 0),
                      )
                    : Math.round(
                        Number(lineForm.quantity || 0) * Number(lineForm.unit_price || 0) * 100,
                      ) / 100
                }
                entryVat={
                  selectedProduct
                    ? lineProductVat(
                        selectedProduct,
                        enablePosCashRounding
                          ? roundLightStoresAmount(
                              Number(lineForm.quantity || 0) *
                                Number(lineForm.unit_price || 0),
                            )
                          : Math.round(
                              Number(lineForm.quantity || 0) *
                                Number(lineForm.unit_price || 0) *
                                100,
                            ) / 100,
                      )
                    : 0
                }
                entryReady={Boolean(selectedProduct && lineForm.product_code)}
                onEntryQtyChange={(value) =>
                  setLineForm((p) => ({ ...p, quantity: value }))
                }
                onEntryQtyKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleQuantityEnter();
                  }
                }}
                onEmptyDoubleClick={
                  standalone ? () => void startFreshWorkspace() : null
                }
              />
            ) : (
            <table
              className="w-full border-collapse text-sm"
              onDoubleClick={(e) => {
                if (!standalone) return;
                const t = e.target;
                if (!(t instanceof Element)) return;
                if (t.closest("button, input, a, select, textarea, label")) return;
                const row = t.closest("tbody tr");
                if (row && !row.querySelector("td[colspan]")) return;
                void startFreshWorkspace();
              }}
            >              <thead className="sticky top-0 z-10 bg-[var(--theme-page-bg)]">
                <tr className="theme-table-head-row border-b border-[var(--theme-border)] text-left text-xs font-bold uppercase tracking-wide">
                  <th className="px-3 py-2.5">Scan code</th>
                  <th className="px-3 py-2.5">Description</th>
                  {showCartLineType ? (
                    <th className="px-3 py-2.5">Type</th>
                  ) : null}
                  <th className="px-3 py-2.5">Package</th>
                  <th className="px-3 py-2.5 text-center">Qty</th>
                  <th className="px-3 py-2.5 text-right">Unit price</th>
                  {showLineDiscountField ? (
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
                        {showLineDiscountField ? (
                          <td className="px-3 py-2 text-right">
                            {(
                              productMeta
                                ? cartLineEnteredDiscountPerUnit(
                                    line,
                                    productMeta,
                                    getRetailPackage(line.product_code),
                                  )
                                : lineDiscountPerUnit(line.discount_given, line.quantity)
                            ).toLocaleString()}
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
            )}
          </div>

          {classicLayout ? null : (
          <div className="pos-cart-footer mt-auto shrink-0">
          <div className="pos-cart-summary shrink-0 border-t border-[var(--theme-border)] px-4 py-4">
            {discountFeaturesEnabled && cart?.discount_approval_pending ? (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                <p className="font-semibold">Discount pending manager approval</p>
                <p className="mt-1 text-xs text-amber-900">
                  {cart.discount_approval_request?.scope === "line"
                    ? "A line discount request is awaiting approval."
                    : `Order discount of ${formatSaleKes(cart.discount_approval_request?.discount_amount ?? 0)} is awaiting approval.`}
                  {" "}You can still save this order — it will be listed under Pending approval orders until approved.
                  If rejected, edit the order from Editable orders.
                </p>
              </div>
            ) : discountFeaturesEnabled &&
              cartNeedsDiscountApprovalAtCheckout(cart, {
                discountApprovalActive,
                canAutoApproveDiscount,
                moduleSettings: capabilities?.module_settings,
              }) ? (
              <div className="mb-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
                <p className="font-semibold">Discount on this order</p>
                <p className="mt-1 text-xs text-sky-900">
                  This order has discounts that need manager approval when you save or complete it.
                </p>
              </div>
            ) : null}
            <div className="mb-3 border-b border-[var(--theme-border)] pb-3 text-sm">
              {showOrderDiscountInput ? (
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
                {showLineDiscountField || showOrderDiscountInput ? (
                  <div className="theme-text-muted flex justify-between">
                    <span>Line discounts</span>
                    <span>
                      {cartSummary.lineDiscounts > 0
                        ? `−${formatSaleKes(cartSummary.lineDiscounts)}`
                        : formatSaleKes(0)}
                    </span>
                  </div>
                ) : null}
                {((showOrderDiscountInput || enableVouchers) && cartSummary.orderDiscount > 0) ? (
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
                title={
                  modernOrderEditLocked || isCartEditSession
                    ? "Cannot hold while editing a previous order"
                    : "Hold order (Alt+H)"
                }
                icon="⏸"
                iconClass="pos-cart-action-icon--warn"
                disabled={
                  busy
                  || !cart?.lines?.length
                  || cartStockBlocked
                  || modernOrderEditLocked
                  || isCartEditSession
                }
                onClick={() => openSaveOrderDialog("hold")}
              />
              {posSalesConfig.showCheckoutOnCreate || modernOrderEditLocked ? (
                <PosActionButton
                  label="Complete"
                  title={
                    modernOrderEditLocked
                      ? "Save this order under the same number and print (F10)"
                      : checkoutBlocked
                        ? "Wait for the line to finish saving"
                        : "Complete payment (F10)"
                  }
                  icon="🛒"
                  iconClass="pos-cart-action-icon--complete"
                  disabled={
                    busy
                    || lineBusy
                    || !cart?.lines?.length
                    || cartStockBlocked
                    || (!modernOrderEditLocked && checkoutBlocked)
                  }
                  onClick={() => openCompletePayment()}
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
            {cartLineSaveFailed ? (
              <p className="mt-2 text-right text-xs font-medium text-amber-800">
                That line did not save and was removed. Other lines are unchanged — you can retry
                Add or complete payment (F10) with the rest of the cart.
              </p>
            ) : null}
            {cartStockBlocked ? (
              <p className="mt-2 text-right text-xs font-medium text-red-700">
                Cart exceeds available stock — reduce quantities or enable negative stock in admin.
              </p>
            ) : null}
          </div>
          </div>
          )}
        </div>
      </div>

      <PosPaymentPanel
        open={paymentOpen}
        onClose={() => {
          setPaymentOpen(false);
          setReceiptPrintStatus(null);
        }}
        billTotal={cartSummary.amountDue}
        channel={channel}
        workflow={channelWorkflow}
        paymentConfig={checkoutPaymentConfig}
        prefillMpesaAmount={cart?.mpesa_payment_amount}
        prefillMpesaCode={cart?.mpesa_transaction_code}
        prefillWalkInCustomerName={prefilledEditCustomerName}
        lockMpesaFields={Number(cart?.mpesa_payment_amount ?? 0) > 0}
        saving={busy}
        error={paymentError}
        onComplete={handleCheckout}
        onContinueNextOrder={handleContinueNextOrder}
        receiptPrintStatus={receiptPrintStatus}
        onReprintReceipt={() => void handlePrintReceipt()}
        embedded={!standalone}
        cashOnlyOffline={standalone && (offlineMode || Boolean(cart?.offline))}
      />

      <PosSaveOrderDialog
        open={saveOrderOpen}
        mode={orderDialogMode}
        onClose={() => {
          setSaveOrderOpen(false);
          setSaveOrderError(null);
        }}
        prefillWalkInName={prefilledEditCustomerName}
        prefillCustomerNum={prefilledEditCustomerNum}
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
        onRestored={(restoredCart, sourceSale) => {
          setCart(restoredCart);
          setSelectedLineId(null);
          setEditingLineRef(null);
          clearLineEntry();
          const orderNum = restoredCart?.held_order_num;
          const customerMemory = extractSaleCustomerMemory(sourceSale);
          if (orderNum && (customerMemory.name || customerMemory.customerNum != null)) {
            rememberPosOrderCustomer(orderNum, customerMemory);
          }
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
          classicAutoHold={classicLayout}
          onStay={() => {
            pendingLeaveHrefRef.current = null;
            setLeaveGuardOpen(false);
          }}
          onLeaveKeepReservation={() => completeLeaveNavigation()}
          onClearAndLeave={() => void clearCartAndLeave()}
          onHoldAndLeave={() => void holdCartAndLeave()}
        />
      ) : null}

      <ClassicPosAutoHeldDialog
        open={Boolean(classicLayout && autoHeldPrompt)}
        orderNum={autoHeldPrompt?.orderNum}
        busy={autoHeldBusy}
        onRestore={() => void handleAutoHeldRestore()}
        onDelete={() => void handleAutoHeldDelete()}
        onDismiss={() => {
          // Keep the marker so the next POS open asks again.
          setAutoHeldPrompt(null);
        }}
      />

      <DiscountApprovalReasonDialog
        open={discountReasonDialogOpen}
        onSubmit={closeDiscountReasonDialog}
        onCancel={() => closeDiscountReasonDialog(null)}
      />

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
        classicLayout ? (
          <ClassicPosStatusFooter
            user={user}
            totals={cartSummary?.total ?? 0}
            vat={cartSummary?.vat ?? 0}
            heldCount={heldOrdersCount}
            version="1.0.0"
            currencySettings={classicCurrencySettings}
            statusMessage={statusMessage}
            connectionStatus={networkStatus}
            onPayClick={() => openCompletePayment()}
            payDisabled={
              busy
              || lineBusy
              || !cart?.lines?.length
              || cartStockBlocked
              || checkoutBlocked
              || editAutosaveInFlightRef.current
            }
          />
        ) : (
          <PosStatusFooter
            user={user}
            organization={organization ?? capabilities?.organization}
          />
        )
      ) : null}

      {checkoutWaitOverlay}
    </div>
  );
}

export default PosScreen;
