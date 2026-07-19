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
  fetchRetailPackagesCached,
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
import { mergeGeneralSettings } from "@/lib/general-settings";
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
  const { user, capabilities, refreshCapabilities, organization, hasPermission } = useAuth();
  const classicLayout = standalone && isClassicExternalPosLayout(capabilities);
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
          const retailPackage = retailByCode[line?.product_code] ?? null;
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
    if (!isCheckoutCompleteStatus(sale.status, channelWorkflow, "pos")) return;
    const entry = { id: sale.id, order_num: sale.order_num };
    setSessionPosOrders((prev) => {
      const next = [entry, ...prev.filter((row) => String(row.id) !== String(entry.id))];
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
      let rows = await fetchRows(
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

      const orders = rows
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
    const [uoms, vats, retailRows] = await Promise.all([
      fetchUomsCached(),
      fetchVatsCached().catch(() => []),
      fetchRetailPackagesCached().catch(() => []),
    ]);
    const uomMap = new Map();
    for (const u of uoms) uomMap.set(String(u.id), u);
    const vatMap = new Map();
    for (const v of vats) vatMap.set(String(v.id), v);
    const retailMap = {};
    for (const row of retailRows ?? []) {
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
    user?.branch_id,
    tillId,
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
        const retailPackage = retailByCode?.[code] ?? null;
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
    if (cart?.id && cart.channel === channel && Array.isArray(cart.lines)) {
      return cart;
    }
    if (cart?.id && cart.channel === channel) {
      return refreshCart(cart.id);
    }
    return loadCashierCart();
  }, [cart, channel, loadCashierCart, refreshCart]);

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
    const delay = looksLikeProductCodeQuery(searchQuery) ? 0 : 280;
    const t = setTimeout(() => searchProducts(searchQuery), delay);
    return () => clearTimeout(t);
  }, [searchQuery, searchProducts]);

  function retailLineFlagFor(product, entryQty, retailLine = null, sellWholesaleOverride = null) {
    if (retailLine != null) return retailLine;
    const sellMode = sellWholesaleOverride ?? sellWholesale;
    const retailPackage = retailByCode[product.product_code] ?? null;
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
    const retailPackage = retailByCode[product.product_code] ?? null;
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
      cartLines: cart?.lines,
      sellFromShop,
      posSalesConfig,
      allowNegativeStock,
      stockAsRetail,
      productByCode,
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
    setCart(
      applyOptimisticCartMutation(activeCart, optimisticLine, {
        mergeTarget,
        editingRef: targetLineRef,
      }),
    );

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
      setCart((current) =>
        revertOptimisticCartMutation(current, {
          previousLineSnapshot:
            previousLineSnapshot?.product_code != null ? previousLineSnapshot : null,
          optimisticLine,
        }),
      );
      setCartLineSaveFailed(true);
      throw error;
    }

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

    if (activeCart?.held_order_num || cartRef.current?.held_order_num) {
      scheduleEditedOrderAutosave();
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
    if (replacingLineId) {
      pickProduct(product);
      return true;
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
        retailByCode[line.product_code] ?? null,
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
    const retailPackage = retailByCode[product.product_code] ?? null;
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
    const retailPackage = retailByCode[product.product_code] ?? null;
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
    if (!selectedProduct || busy || lineBusy || addLineBlocked) return;
    if (classicLayout) {
      void handleAddLine();
      return;
    }
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

      const retailPackage = retailByCode[line.product_code] ?? null;
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
      const updated = await apiRequest(`/sales/carts/${cart.id}/lines/${lineRef}`, {
        method: "DELETE",
      });
      cartRef.current = updated;
      setCart(updated);
      if (sameLineId(editingLineId, selectedLineId)) {
        clearLineEntry();
      }
      setSelectedLineId(null);
      if (updated?.held_order_num && (updated?.lines?.length ?? 0) > 0) {
        scheduleEditedOrderAutosave();
      }
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
        message: "Clear all items from the cart?",
        confirmLabel: "Clear",
        destructive: true,
      }))
    ) {
      return;
    }
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
      void printSaleOrder(sale, {
        capabilities,
        organization,
        organizationName: capabilities?.profile_label,
        uomById,
        user,
        preparedBy: user?.full_name ?? user?.username ?? null,
        documentType,
      })
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

  function scheduleEditedOrderAutosave() {
    const activeCart = cartRef.current;
    if (!activeCart?.held_order_num || !activeCart?.lines?.length) return;
    if (skipEditAutosaveRef.current) return;
    if (editAutosaveTimerRef.current) {
      window.clearTimeout(editAutosaveTimerRef.current);
    }
    editAutosaveTimerRef.current = window.setTimeout(() => {
      void finalizeEditedOrder({ quiet: true, submitKra: false, skipPrint: true });
    }, 650);
  }

  /** Finish a previous-order edit without the payment popup (same order_num). */
  async function finalizeEditedOrder({
    quiet = true,
    submitKra = false,
    skipPrint = true,
  } = {}) {
    const activeCart = cartRef.current;
    const summary = cartSummaryRef.current;
    if (!activeCart?.id || !activeCart?.held_order_num) return null;
    if (!activeCart?.lines?.length) {
      if (!quiet) {
        flashPosShortcutMessage("Add items before saving this order.");
      }
      return null;
    }
    if (cartHasOptimisticLines(activeCart) || lineBusy) {
      // Line mutation still settling — retry shortly.
      scheduleEditedOrderAutosave();
      if (!quiet) {
        flashPosShortcutMessage("Wait for cart lines to finish saving, then try again.");
      }
      return null;
    }
    if (cartStockBlocked || busy) {
      if (!quiet) {
        flashPosShortcutMessage("Fix stock issues before saving this order.");
      }
      return null;
    }
    if (editAutosaveInFlightRef.current) return null;
    editAutosaveInFlightRef.current = true;
    skipEditAutosaveRef.current = true;
    try {
      const lineTotal = (activeCart.lines ?? []).reduce(
        (sum, line) => sum + Number(line.amount ?? 0),
        0,
      );
      const total = Number(summary?.amountDue ?? summary?.total ?? lineTotal);
      const payNow = Math.max(0, total);
      const customerMemory = getPosOrderCustomer(activeCart.held_order_num);
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
        order_num: activeCart.held_order_num,
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
      const sale = await handleCheckout(body, { skipPrint, forceSubmitKra: kra });
      if (!sale?.id) return null;

      setStatusMessage(
        quiet
          ? `Order #${sale.order_num ?? activeCart.held_order_num} saved.`
          : `Order #${sale.order_num ?? activeCart.held_order_num} saved under the same order number.`,
      );
      if (!quiet && standalone) {
        notifySuccess(`Order #${sale.order_num} saved.`);
      }

      if (quiet) {
        // Keep editing under the same order number for further line changes.
        await restoreOrderForEdit(sale.id, {
          replace: true,
          saleSnapshot: sale,
          keepEditing: true,
        });
      } else {
        // Explicit save (F10): finish edit session and prepare a fresh cart.
        skipEditAutosaveRef.current = true;
        await loadCashierCart();
        setEditOrderNo("");
        setCompletedSale(sale);
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
    if (hasLines) {
      const ok = await confirm({
        title: "New order",
        message: "Clear this workspace and start a new order?",
        confirmLabel: "Start new order",
        destructive: true,
      });
      if (!ok) {
        skipEditAutosaveRef.current = false;
        return;
      }
    }

    setPaymentOpen(false);
    setPaymentError(null);
    setCompletedSale(null);
    setCartLineSaveFailed(false);
    setReplacingLineId(null);
    setSelectedLineId(null);
    setEditingLineId(null);
    setEditingLineRef(null);
    orderNoUserEditedRef.current = false;
    setEditOrderNo("");
    setOrderEditError(null);
    setEditBrowseIndex(0);
    clearLineEntry();
    setBusy(true);
    setStatusMessage(null);
    try {
      if (activeCart?.id && (hasLines || activeCart.held_order_num)) {
        await apiRequest(`/sales/carts/${activeCart.id}/lines`, { method: "DELETE" });
      }
      const next = await loadCashierCart();
      cartRef.current = next;
      orderNoUserEditedRef.current = false;
      if (next?.next_order_num != null) {
        setEditOrderNo(String(next.next_order_num));
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
    const sale = completedSale;
    if (!sale?.id) {
      const message = "No completed order to print. Complete payment first (F10).";
      if (standalone) notifyError(message);
      else setStatusMessage(message);
      return;
    }
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
      orderNoUserEditedRef.current = false;
      const orderNum = restoredCart?.held_order_num ?? restoredCart?.next_order_num;
      if (orderNum != null) {
        setEditOrderNo(String(orderNum));
        setSessionPosOrders((prev) => {
          if (prev.some((row) => String(row.id) === String(saleId))) return prev;
          return [...prev, { id: saleId, order_num: orderNum }].slice(0, 40);
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
    if (fromSession?.id != null) {
      orderNoUserEditedRef.current = false;
      await restoreOrderForEdit(fromSession.id);
      return;
    }
    orderNoUserEditedRef.current = false;
    await handleEditByOrderNumber(trimmed);
  }

  /** Click the order # (while it shows the next number) → load the latest completed (“current”) order. */
  async function classicOpenCurrentOrder() {
    if (!enablePosOrderEdit || busy) return;
    if (isCartEditSession) return;

    let orders = sessionPosOrders;
    if (!orders.length) {
      setStatusMessage("Loading completed POS orders…");
      orders = await loadCompletedPosOrders();
    }
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

    let orders = sessionPosOrders;
    if (!orders.length) {
      setStatusMessage("Loading completed POS orders…");
      orders = await loadCompletedPosOrders();
    }
    if (!orders.length) {
      const message =
        "No active completed POS orders found for this cashier. Orders already loaded for edit (numbers 9000000+) are archived and cannot be opened again — complete a new sale, then use ←.";
      setOrderEditError(message);
      setStatusMessage(message);
      return;
    }

    const nextIndex = editBrowseIndex + 1;
    if (nextIndex >= orders.length) {
      setStatusMessage("Already at the oldest completed order.");
      return;
    }
    const row = orders[nextIndex];
    if (!row) return;
    orderNoUserEditedRef.current = false;
    setEditBrowseIndex(nextIndex);
    setEditOrderNo(String(row.order_num));
    await restoreOrderForEdit(row.id);
  }

  async function classicGoNextOrder() {
    if (!classicCanGoNext || busy) return;
    if (editBrowseIndex > 0) {
      const nextIndex = editBrowseIndex - 1;
      const row = sessionPosOrders[nextIndex];
      if (!row) return;
      setEditBrowseIndex(nextIndex);
      setEditOrderNo(String(row.order_num));
      await restoreOrderForEdit(row.id);
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
    const orderLabel =
      activeOrderNum != null ? formatOrderNumber(activeOrderNum) : "—";
    return `New Order - ${orderLabel}`;
  }, [
    isCartEditSession,
    cart?.held_order_num,
    prefilledEditCustomerName,
    activeOrderNum,
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
    // Previous-order edit: write straight to sales under the same order # (no payment popup).
    if (cart?.held_order_num) {
      void finalizeEditedOrder({ quiet: false, submitKra: true, skipPrint: false });
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
        if (state.isCartEditSession) {
          void actions.finalizeEditedOrder({ quiet: false, submitKra: true, skipPrint: false });
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
                <NotificationBell />
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
                    Editing order #{cart.held_order_num}. Line changes save to this order automatically — no payment step.
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
                    retailByCode[line.product_code] ?? null,
                  );
                }}
                lineQtyUnit={(line) => {
                  const productMeta = productByCode[line.product_code];
                  return (
                    posCartLineEntryUnitLabel(
                      line,
                      productMeta ?? null,
                      retailByCode[line.product_code] ?? null,
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
                          retailByCode[line.product_code] ?? null,
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
                    disabled={busy || lineBusy}
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
                busy={busy || lineBusy}
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
                                    retailByCode[line.product_code] ?? null,
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
                title="Hold order (Alt+H)"
                icon="⏸"
                iconClass="pos-cart-action-icon--warn"
                disabled={busy || !cart?.lines?.length || cartStockBlocked}
                onClick={() => openSaveOrderDialog("hold")}
              />
              {posSalesConfig.showCheckoutOnCreate ? (
                <PosActionButton
                  label="Complete"
                  title={
                    checkoutBlocked
                      ? "Wait for the line to finish saving"
                      : "Complete payment (F10)"
                  }
                  icon="🛒"
                  iconClass="pos-cart-action-icon--complete"
                  disabled={busy || lineBusy || !cart?.lines?.length || cartStockBlocked || checkoutBlocked}
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
