"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError, isAbortError } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/api-concurrency";
import { buildPageParams } from "@/lib/paginated-api";
import { CentrixLogoHeader } from "@/components/branding/centrix-logo";
import { PRODUCT_NAME } from "@/lib/branding";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { toast } from "@/lib/toast";
import {
  createNotificationEcho,
  disconnectNotificationEcho,
  isRealtimeConfigured,
} from "@/lib/realtime/notification-echo";
import { useAuth } from "@/contexts/auth-context";
import { usePosSession } from "@/contexts/pos-session-context";
import {
  parseDecimalInput,
  INPUT_CLASS,
  SELECT_CLASS,
  INPUT_READONLY_CLASS,
  COMPACT_INPUT_CLASS,
  SearchableSelect,
} from "@/components/catalog/catalog-shared";
import { todayCalendarDate } from "@/lib/datetime";
import { enrichProductForLpo } from "@/components/lpo/lpo-product-utils";
import {
  cartLineEnteredDiscountPerUnit,
  cartLinePackQtyForDiscount,
  saleLineProductName,
  snapshotUomForPrint,
} from "@/lib/sale-line-items";
import { uomCompactPackageLabel } from "@/lib/uom-packaging";
import {
  applyCatalogPricesToCart,
  cartLineDisplayUnitPrice,
  cartLineLockedUnitOverride,
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
  posLineWholesaleRetailFlag,
  productSellsRetail,
  usesPosRetailPricing,
} from "@/lib/pos-line";
import { formatMixedStockDisplay, formatSaleLineQtyDisplay } from "@/lib/stock-uom";
import {
  computeProductLineDiscount,
  formatProductDiscountLabel,
  productHasConfiguredDiscount,
} from "@/lib/product-discount";
import { lineProductVat } from "@/lib/sales-vat";
import {
  formatCashSalesNumber,
  formatPosBrowseLabel,
  formatSaleKes,
  resolvePosBrowseNumber,
  resolvePosNextBrowseNumber,
  resolvePosSessionTicketNumber,
  saleCustomerLabel,
} from "@/lib/sales";
import { annotateSaleWithReceiptTenders } from "@/lib/checkout-payment-splits";
import {
  getChannelWorkflow,
  workflowPipelineSteps,
  checkoutCompleteStatuses,
  isCheckoutCompleteStatus,
  saleNeedsPaymentCollection,
  resolveCheckoutStatus,
  resolveSaveOrderStatus,
  resolveSaveOrderStatusLabel,
} from "@/lib/order-workflow";
import {
  getPosSalesConfig,
  areSalesDiscountFeaturesEnabled,
  isDiscountApprovalEnabledForChannel,
  lineDiscountInputLabel,
  isWorkspaceTillFloatRequired,
  salesCartChannelForWorkspace,
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
  isKraDeviceConfigured,
  isPlatformMpesaStkEnabled,
  isStkPushEnabled,
  shouldSubmitKraOnCheckout,
} from "@/lib/finance-settings";
import { useBlockingWait } from "@/lib/use-blocking-wait";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { usePageNavigationReady } from "@/lib/use-page-navigation-ready";
import {
  fetchRetailPackagesForProductCodes,
  fetchUomsCached,
  fetchVatsCached,
} from "@/lib/reference-data-cache";
import { printSaleOrder } from "@/components/sales/sale-order-print";
import { LOCAL_PRINTING_ADMIN_LABEL } from "@/lib/local-printing";
import { isPrintAgentEnabled, warmPrintAgentHealth } from "@/lib/print-agent";
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
  productCartStockDisplayMode,
  productCartStockLabel,
  productStockAtLocation,
} from "@/lib/pos-stock";
import {
  mergePosSearchResults,
} from "@/lib/pos-product-search-rank";
import {
  sameSearchResultList,
  upsertPosSearchProducts,
  posSearchCatalogHasCode,
  getPosSearchProduct,
} from "@/lib/pos-product-search-index";
import {
  applyCartMutationResponse,
  applyOptimisticCartMutation,
  buildOptimisticCartLine,
  cartHasOptimisticLines,
  cartLineRef,
  findMergeableCartLine,
  looksLikeProductCodeQuery,
  mergePreservedOptimisticLines,
  normalizeCartResponse,
  revertOptimisticCartMutation,
} from "@/lib/pos-cart-merge";
import { PosPaymentPanel } from "./pos-payment-panel";
import { PosEditPaymentAdjustmentDialog } from "./pos-edit-payment-adjustment-dialog";
import { PosProductSearch } from "./pos-product-search";
import { ClassicPosStatusFooter } from "./classic-pos-status-footer";
import { ClassicPosCartTable } from "./classic-pos-cart-table";
import {
  BatchActionBar,
  BatchDeleteButton,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";
import { ClassicPosAutoHeldDialog } from "./classic-pos-auto-held-dialog";
import { PosCartPaymentOptions, posCartPaymentPromptsEnabled } from "./pos-cart-payment-options";
import { PosHeldOrdersOverlay } from "./pos-held-orders-overlay";
import { PosPendingSyncOverlay } from "./pos-pending-sync-overlay";
import { PosOrderEditBar } from "./pos-order-edit-bar";
import { PosSaveOrderDialog } from "./pos-save-order-dialog";
import { PosLeaveGuardDialog } from "./pos-leave-guard-dialog";
import { PosKraProductUploadDialog } from "@/components/pos/pos-kra-product-upload-dialog";
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
  applyClassicPosDocumentTheme,
  applyOrgErpSidebarTheme,
  classicPosThemeBridgeVars,
  classicPosThemeCssVars,
  isDarkClassicPosTheme,
  resolveClassicPosThemeColors,
  resolveClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import { isClassicExternalPosLayout } from "@/lib/external-pos-layout";
import { usePosOfflineSupport } from "@/hooks/use-pos-offline-support";
import {
  abandonOfflineSaleEdit,
  cartHasStaleFailedOutboxAttachment,
  continueOpenCartThroughOutage,
  beginOfflineSaleEdit,
  buildPreviousOrderEditPrintSale,
  clearLocalPosCart,
  clearPreviousOrderEditDraft,
  clearPosSessionLocalCache,
  completeOfflineCashSale,
  detachPreviousOrderEditCartId,
  resolvePreviousOrderEditServerCartId,
  isLocalFirstCashCheckout,
  isMissingTemporaryCartError,
  isServerPosCartId,
  listOfflinePendingSalesForEdit,
  listFailedOutboxSales,
  loadOrCreateLocalPosCart,
  loadPreviousOrderEditDraft,
  parseOfflineSaleUuid,
  posTicketFieldsFromCart,
  peekNextPosOfflineOrderSlot,
  peekNextPosTicketNumber,
  peekIssuedPosTicketMax,
  peekLocalPosTicketNext,
  ensurePosOfflineOrderNumbers,
  getPosOfflineProduct,
  getPosOfflinePendingCount,
  purgeReservedPosTicketsUpTo,
  seedLocalPosTicketSeqFromSale,
  resolvePosTicketForCheckout,
  saveLocalPosCart,
  savePreviousOrderEditDraft,
  summarizeLocalPosCart,
  upsertLocalPosCartLine,
  upsertPreviousOrderEditOutbox,
  withPosReceiptTicket,
  warmPosOfflineCatalog,
} from "@/lib/pos-offline";
import { isSellableCatalogProduct } from "@/lib/catalog-cache";
import {
  claimPosFunctionKeyEvent,
  clearPosAltLatch,
  installPosDevToolsLockdown,
  installPosOfflineReloadGuard,
  isPosAltKeyEvent,
  isPosFunctionKeyEvent,
  isPosFunctionShortcutKey,
  isPosRealAltActive,
  notePosAltKeyEvent,
  resolvePosAltShortcutLetter,
  resolvePosShortcutKey,
} from "@/lib/pos-keyboard-shortcuts";
import {
  idbDeleteOutboxSale,
  idbFindSyncedServerSaleIdByPosTicket,
  newClientSaleUuid,
  todayPosOrderDate,
} from "@/lib/pos-offline-db";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { isKraProductNotRegisteredError } from "@/lib/kra-device-errors";
import {
  productCodesFromCartLines,
  registerProductsOnKraDevice,
} from "@/lib/kra-product-registration";
import { applyTheme, getTheme } from "@/lib/theme";
import {
  PosPriceCheckerModal,
  PosPreviousOrderLoadingOverlay,
  PosPrepareNextOrderOverlay,
} from "./pos-utility-modals";
import { filterByOrganization, orgListParams } from "@/lib/admin";
import { P } from "@/lib/permission-codes";
import { formDraftKey } from "@/stores/form-drafts";
import { useFormDraft } from "@/hooks/use-form-draft";
import { getPosDeviceIdentifier } from "@/lib/pos-device";
import {
  createBranchTill,
  indexOpenSessionsByTill,
  pickBranchTillForCashier,
  resolveTillReportNo,
  tillDisplayName,
} from "@/lib/pos-till";
import {
  extractSaleCustomerMemory,
  getPosOrderCustomer,
  getPosOrderCustomerName,
  rememberPosOrderCustomer,
  rememberPosOrderCustomerName,
} from "@/lib/pos-customer-name-memory";
import { readPosLastReceipt, rememberPosLastReceipt, clearPosLastReceipt } from "@/lib/pos-last-receipt";
import {
  posCashLineAmount,
  posDisplayCartLineAmount,
  roundLightStoresAmount,
} from "@/lib/pos-cash-round";
import {
  clearAutoHeldOrder,
  peekAutoHeldOrder,
  rememberAutoHeldOrder,
} from "@/lib/pos-auto-held";
import {
  clearAllLocalHeldOrders,
  countLocalHeldOrders,
  deleteLocalHeldOrder,
  forgetLocalHeldOrder,
  getLocalHeldOrder,
  isLocalHeldId,
  parkCartLocally,
  restoreLocalHeldOrder,
} from "@/lib/pos-local-held";
import {
  buildPaymentAdjustmentsFromCheckoutBody,
  computePreviousOrderEditPaymentDelta,
  computePreviousOrderEditSignedDelta,
  previousOrderAdjustmentsMatchDelta,
} from "@/lib/pos-edit-payment-adjustment";

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

function isLocalCartLineId(id) {
  const s = String(id ?? "");
  return s.startsWith("pending-") || s.startsWith("opt-");
}

/** Previous-order edits with real cashier changes (qty / swap / add / remove) — not F12-only touch. */
function editedOrderHasLocalDraftChanges(cart) {
  if (!cart?.held_order_num) return false;
  return Boolean(cart._editDraftDirty);
}

function withEditDraftDirty(cart) {
  if (!cart?.held_order_num) return cart;
  return { ...cart, _editDraftDirty: true };
}

function stripPreviousOrderDraftMarkers(cart) {
  if (!cart) return cart;
  const { _editDraftDirty: _omitDirty, ...rest } = cart;
  return {
    ...rest,
    lines: (rest.lines ?? []).map((line) => {
      const { _draftEdit: _omitDraft, _optimistic: _omitOpt, ...lineRest } = line;
      return lineRest;
    }),
  };
}

/** Drop previous-order edit markers so F8 can stay on a blank new-order cart. */
function stripPreviousOrderEditSession(cart) {
  if (!cart) return cart;
  const {
    held_order_num: _held,
    superseded_sale_id: _superseded,
    server_sale_id: _serverSale,
    server_cart_id: _serverCart,
    _editDraftDirty: _dirty,
    ...rest
  } = cart;
  return rest;
}

function stripOfflineSaleMarkers(cart) {
  if (!cart) return cart;
  const {
    offline: _offline,
    offline_client_sale_uuid: _uuid,
    offline_edit_snapshot: _snapshot,
    ...rest
  } = cart;
  return rest;
}

function isFreshWorkspacePlaceholder(cart) {
  return String(cart?.id ?? "") === "pending-fresh";
}

/** True when the cashier is actively editing a queued offline sale or previous-order session. */
function isActiveOfflineEditSession(cart) {
  if (!cart) return false;
  if (cart.held_order_num && cart.superseded_sale_id) return true;
  if (
    cart.offline_client_sale_uuid &&
    (cart.offline_edit_snapshot || (cart.lines?.length ?? 0) > 0)
  ) {
    return true;
  }
  return false;
}

/** Revising a booked/completed receipt — local draft until F10/sync (not a restored held park). */
function isPreviousOrderEditSession(cart) {
  return Boolean(cart?.held_order_num && cart?.superseded_sale_id);
}

/** Line edits stay local-only for previous-order revisions and offline carts — not restored held parks. */
function usesPosLocalDraftLineEdits(cart) {
  return Boolean(isPreviousOrderEditSession(cart) || cart?.offline);
}

/**
 * Open sale is continuing in IndexedDB (outage, reconnect mid-sale, or queued offline edit).
 * Line adds / removes / checkout must stay local — TemporaryCart "active" is not a real server id.
 */
function usesLocalPosCartWorkspace(cart) {
  return Boolean(cart?.offline || cart?.offline_client_sale_uuid);
}

/** Workspace still shows the sale that just completed (bootstrap did not clear held restore). */
function isStalePostCheckoutWorkspace(cart, completedSale) {
  if (!cart || !completedSale) return false;
  if (isFreshWorkspacePlaceholder(cart)) return false;
  if (!(cart.lines?.length > 0)) return false;
  const completedNums = new Set(
    [
      completedSale.order_num,
      completedSale.pos_order_num,
      completedSale.held_order_num,
    ]
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
  if (completedNums.size === 0) return false;
  const cartNums = [
    cart.held_order_num,
    cart.pos_order_num,
    resolvePosBrowseNumber(cart),
  ]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  return cartNums.some((n) => completedNums.has(n));
}

/** Ensure restored edit carts carry displayable lines (API cart or sale snapshot). */
function presentRestoredEditCart(restoredCart, sourceSale) {
  const cart = normalizeCartResponse(restoredCart) ?? restoredCart ?? {};
  const fromRestore =
    restoredCart?.restored_from_sale && typeof restoredCart.restored_from_sale === "object"
      ? restoredCart.restored_from_sale
      : null;
  const mergedSource = {
    ...(fromRestore ?? {}),
    ...(sourceSale ?? {}),
    // Prefer explicit snapshot fields; fill gaps from restore payload.
    id: sourceSale?.id ?? fromRestore?.id ?? null,
    customer_num: sourceSale?.customer_num ?? fromRestore?.customer_num ?? null,
    customer_name_override:
      sourceSale?.customer_name_override ?? fromRestore?.customer_name_override ?? null,
    customer_display_name:
      sourceSale?.customer_display_name ?? fromRestore?.customer_display_name ?? null,
    customer: sourceSale?.customer ?? fromRestore?.customer ?? null,
    pos_order_num: sourceSale?.pos_order_num ?? fromRestore?.pos_order_num ?? null,
    pos_order_date: sourceSale?.pos_order_date ?? fromRestore?.pos_order_date ?? null,
    payment_method_code:
      sourceSale?.payment_method_code ?? fromRestore?.payment_method_code ?? null,
    order_num: sourceSale?.order_num ?? fromRestore?.order_num ?? null,
  };

  const supersededSaleId =
    cart.superseded_sale_id ??
    mergedSource?.id ??
    sourceSale?.id ??
    sourceSale?.superseded_sale_id ??
    null;
  const base =
    supersededSaleId != null
      ? { ...cart, superseded_sale_id: Number(supersededSaleId) }
      : cart;

  const sourceCustomerNum =
    mergedSource?.customer_num ?? mergedSource?.customer?.customer_num ?? null;
  const sourceCustomerName =
    mergedSource?.customer_name_override ??
    mergedSource?.customer?.customer_name ??
    mergedSource?.customer_display_name ??
    null;

  const withPosTicket = {
    ...base,
    ...(mergedSource?.pos_order_num != null
      ? { pos_order_num: Number(mergedSource.pos_order_num) }
      : {}),
    ...(mergedSource?.pos_order_date
      ? {
          pos_order_date: String(mergedSource.pos_order_date).slice(0, 10),
        }
      : {}),
    // TemporaryCart has no customer columns — keep the sale's buyer on the edit session
    // so local-first / outbox sync does not rewrite the order as Walk-in.
    ...(base.customer_num == null && sourceCustomerNum != null
      ? { customer_num: Number(sourceCustomerNum) }
      : {}),
    ...(!(String(base.customer_name_override ?? "").trim()) &&
    sourceCustomerName &&
    String(sourceCustomerName).trim()
      ? { customer_name_override: String(sourceCustomerName).trim() }
      : {}),
    // Keep original tender method across edit sync (outbox used to hardcode CASH).
    ...(!base.payment_method_code && mergedSource?.payment_method_code
      ? { payment_method_code: String(mergedSource.payment_method_code).toUpperCase() }
      : {}),
    // Lock prior bill total for top-up/return math (browse rows often omit order_total).
    // Prefer the sale total; if missing, use the cart line summary so an untouched
    // load never looks like a full-bill top-up.
    ...(base.original_order_total == null
      ? (() => {
          const fromSale = Math.round(
            Number(mergedSource?.order_total ?? mergedSource?.amount_paid ?? 0) * 100,
          ) / 100;
          if (fromSale > 0.009) {
            return { original_order_total: fromSale };
          }
          const fromCart =
            Math.round(Number(summarizeLocalPosCart(base).amountDue ?? 0) * 100) / 100;
          return fromCart > 0.009 ? { original_order_total: fromCart } : {};
        })()
      : {}),
    // Keep original tender mix for receipt rebuild (never use rebuilt outbox payload).
    ...(mergedSource?.id
      ? { offline_edit_snapshot: base.offline_edit_snapshot ?? mergedSource }
      : {}),
  };

  if ((withPosTicket.lines?.length ?? 0) > 0) {
    const { _editDraftDirty: _omit, ...rest } = withPosTicket;
    return rest;
  }

  const items = Array.isArray(sourceSale?.items) ? sourceSale.items : [];
  if (
    !items.length ||
    (withPosTicket.held_order_num == null && withPosTicket.superseded_sale_id == null)
  ) {
    return withPosTicket;
  }

  const lines = items.map((item, index) => ({
    id: item.id ?? item.line_id ?? `restore-${index}`,
    update_code: item.id ?? item.line_id ?? `restore-${index}`,
    product_code: item.product_code,
    product_name: item.product_name ?? item.description ?? item.product_code,
    quantity: Number(item.quantity ?? 0),
    unit_price: Number(item.selling_price ?? item.unit_price ?? 0),
    display_unit_price:
      item.display_unit_price != null ? Number(item.display_unit_price) : undefined,
    uom: item.uom ?? undefined,
    amount: Number(item.amount ?? 0),
    discount_given: Number(item.discount_given ?? 0),
    on_wholesale_retail: Number(item.on_wholesale_retail ?? 0),
    product_vat: item.product_vat != null ? Number(item.product_vat) : undefined,
  }));

  return { ...withPosTicket, lines };
}

function resolveRestoredSourceSale(restoredRaw, saleSnapshot, saleId) {
  const fromRestore =
    restoredRaw?.restored_from_sale && typeof restoredRaw.restored_from_sale === "object"
      ? restoredRaw.restored_from_sale
      : null;
  if (saleSnapshot?.id) {
    // Browse snapshots are thin — prefer restore/API tenders & totals over missing zeros.
    const preferNum = (a, b) => {
      const av = Number(a);
      const bv = Number(b);
      if (Number.isFinite(av) && av > 0) return av;
      if (Number.isFinite(bv) && bv > 0) return bv;
      return a ?? b ?? null;
    };
    return {
      ...saleSnapshot,
      ...fromRestore,
      id: saleSnapshot.id ?? fromRestore?.id ?? saleId,
      order_num: saleSnapshot.order_num ?? fromRestore?.order_num ?? null,
      order_total: preferNum(fromRestore?.order_total, saleSnapshot.order_total),
      amount_paid: preferNum(fromRestore?.amount_paid, saleSnapshot.amount_paid),
      cash: preferNum(fromRestore?.cash, saleSnapshot.cash) ?? fromRestore?.cash ?? saleSnapshot.cash,
      mpesa_amount:
        preferNum(fromRestore?.mpesa_amount, saleSnapshot.mpesa_amount) ??
        fromRestore?.mpesa_amount ??
        saleSnapshot.mpesa_amount,
      equity_amount:
        preferNum(fromRestore?.equity_amount, saleSnapshot.equity_amount) ??
        fromRestore?.equity_amount ??
        saleSnapshot.equity_amount,
      kcb_amount:
        preferNum(fromRestore?.kcb_amount, saleSnapshot.kcb_amount) ??
        fromRestore?.kcb_amount ??
        saleSnapshot.kcb_amount,
      payments: Array.isArray(fromRestore?.payments) && fromRestore.payments.length
        ? fromRestore.payments
        : saleSnapshot.payments,
      customer_num: saleSnapshot.customer_num ?? fromRestore?.customer_num ?? null,
      customer_name_override:
        saleSnapshot.customer_name_override ?? fromRestore?.customer_name_override ?? null,
      customer_display_name:
        saleSnapshot.customer_display_name ?? fromRestore?.customer_display_name ?? null,
      pos_order_num: saleSnapshot.pos_order_num ?? fromRestore?.pos_order_num ?? null,
      pos_order_date: saleSnapshot.pos_order_date ?? fromRestore?.pos_order_date ?? null,
      payment_method_code:
        fromRestore?.payment_method_code ?? saleSnapshot.payment_method_code ?? null,
    };
  }
  if (fromRestore?.id) return fromRestore;
  return { id: saleId, order_num: restoredRaw?.held_order_num ?? null };
}

/** Paint sale lines immediately while restore-to-cart finishes in the background. */
function buildOptimisticPreviousOrderCart(saleId, sourceSale, existingCart) {
  const items = Array.isArray(sourceSale?.items) ? sourceSale.items : [];
  if (!items.length) return null;

  const skeleton = {
    id: existingCart?.id ?? `optimistic-${saleId}`,
    channel: existingCart?.channel ?? "pos",
    order_source: existingCart?.order_source ?? "pos",
    branch_id: existingCart?.branch_id ?? sourceSale?.branch_id ?? null,
    held_order_num: sourceSale?.order_num ?? null,
    superseded_sale_id: Number(saleId),
    pos_order_num: sourceSale?.pos_order_num ?? null,
    pos_order_date: sourceSale?.pos_order_date ?? null,
    customer_num: sourceSale?.customer_num ?? sourceSale?.customer?.customer_num ?? null,
    customer_name_override:
      sourceSale?.customer_name_override ?? sourceSale?.customer_display_name ?? null,
    order_discount: Number(sourceSale?.order_discount ?? 0),
    lines: [],
    _optimistic_restore: true,
  };

  return presentRestoredEditCart(skeleton, sourceSale);
}

function sameLineId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Resolve a cart row for swap/qty even when TemporaryCart remints ids after restore. */
function findCartLineForEdit(lines, needle, { preferProductCode = null } = {}) {
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length || needle == null) return null;

  const needleId = needle?.id ?? needle;
  const needleRef =
    needle && typeof needle === "object"
      ? needle.update_code ?? needle.client_line_id ?? needle.id
      : needle;
  const needleCode =
    preferProductCode ??
    (needle && typeof needle === "object" ? needle.product_code : null);
  const needleRetail =
    needle && typeof needle === "object"
      ? Number(needle.on_wholesale_retail ?? 0)
      : null;

  const byId = list.find(
    (row) =>
      sameLineId(row.id, needleId) ||
      (needleRef != null &&
        (sameLineId(row.update_code, needleRef) ||
          sameLineId(row.client_line_id, needleRef) ||
          sameLineId(row.id, needleRef))),
  );
  if (byId) return byId;

  if (needleCode != null && String(needleCode).trim() !== "") {
    const matches = list.filter(
      (row) =>
        String(row.product_code) === String(needleCode) &&
        (needleRetail == null ||
          Number(row.on_wholesale_retail ?? 0) === needleRetail),
    );
    if (matches.length === 1) return matches[0];
  }
  return null;
}

function posProductDisplayName(record) {
  if (!record) return "item";
  return record.product_name ?? record.description ?? record.product_code ?? "item";
}

const POS_CART_REQUEST = { loading: false, reportIssues: false };
const POS_CHECKOUT_TIMEOUT_MS = 90_000;
/** Wait after the last previous-order edit before uploading (batch qty/line changes). */
const PREVIOUS_ORDER_EDIT_SYNC_DEBOUNCE_MS = 30_000;

function presentLocalOfflineCart(local) {
  if (!local) return null;
  return {
    ...local,
    id: local.id || "active",
    offline: true,
    channel: "pos",
    held_order_num: local.held_order_num ?? null,
    superseded_sale_id: local.superseded_sale_id ?? null,
    offline_client_sale_uuid: local.offline_client_sale_uuid ?? null,
    offline_edit_snapshot: local.offline_edit_snapshot ?? null,
    lines: (local.lines ?? []).map((line) => {
      const qty = Number(line.quantity ?? 0);
      const price = Number(line.unit_price ?? 0);
      const storedAmount = Number(line.amount);
      const amount =
        Number.isFinite(storedAmount) && storedAmount > 0
          ? Math.round(storedAmount * 100) / 100
          : Math.round(qty * price * 100) / 100;
      return {
        ...line,
        id: line.client_line_id,
        update_code: line.client_line_id,
        amount,
      };
    }),
  };
}

/** True when a TemporaryCart line save failed because the link dropped. */
function isPosNetworkDropError(error) {
  if (!error) return false;
  if (error instanceof TypeError && /fetch|network|failed/i.test(String(error.message ?? ""))) {
    return true;
  }
  if (error instanceof ApiError) {
    const status = Number(error.status ?? 0);
    if (!status || status === 408 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    const msg = String(error.message ?? "");
    if (/network|offline|failed to fetch|timeout|temporar/i.test(msg)) return true;
  }
  return false;
}

function isOfflinePendingSaleId(saleId) {
  return String(saleId ?? "").startsWith("offline:");
}

/** Newest POS ticket # first — used for classic ← / → sequential browse. */
function posBrowseSortKey(row) {
  return Number(resolvePosSessionTicketNumber(row) ?? 0);
}

function sortPosOrdersByNumberDesc(orders) {
  return [...(orders ?? [])].sort((a, b) => posBrowseSortKey(b) - posBrowseSortKey(a));
}

/** Immediate older completed order (next lower POS ticket #). */
function findOlderPosOrder(orders, currentBrowseNum) {
  const current = Number(currentBrowseNum);
  if (!Number.isFinite(current)) return null;
  return (
    sortPosOrdersByNumberDesc(orders).find((row) => posBrowseSortKey(row) < current) ?? null
  );
}

/** Immediate newer completed order (next higher POS ticket #). */
function findNewerPosOrder(orders, currentBrowseNum) {
  const current = Number(currentBrowseNum);
  if (!Number.isFinite(current)) return null;
  const ascending = [...(orders ?? [])].sort(
    (a, b) => posBrowseSortKey(a) - posBrowseSortKey(b),
  );
  return ascending.find((row) => posBrowseSortKey(row) > current) ?? null;
}

function sessionOrderMatchesBrowseNum(row, trimmed) {
  const ticket = resolvePosSessionTicketNumber(row);
  if (ticket != null && String(ticket) === String(trimmed)) return true;
  const browse = resolvePosBrowseNumber(row);
  if (browse != null && String(browse) === String(trimmed)) return true;
  return false;
}

/** Digits / S0168-style tokens → order # lookup; otherwise treat as customer name search. */
function looksLikePosOrderNumberLookup(value) {
  const compact = String(value ?? "").trim().replace(/[\s#\-]+/g, "");
  if (!compact) return false;
  if (/^\d+$/.test(compact)) return true;
  return /^S0*\d+$/i.test(compact);
}

function formatPosOrderNameWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapPosOrderNameResult(row) {
  // Always show Cash Sales # (pos_order_num) — never org S# / order_num.
  const ticket = resolvePosSessionTicketNumber(row);
  return {
    ...row,
    ticket_label: ticket != null ? String(ticket) : "—",
    customer_label: saleCustomerLabel(row),
    amount_label: formatSaleKes(row.order_total ?? row.amount_paid),
    when_label: formatPosOrderNameWhen(row.completed_at ?? row.created_at),
  };
}

function mergeFreshWorkspaceCart(next, preservedPosNum) {
  if (!next) return next;
  // Prefer the on-device reserved Cash Sales # (starts at 1 after reserve).
  // Server peek is watermark+1 and must not jump the UI past unused reserved tickets.
  const preserved =
    preservedPosNum != null && Number(preservedPosNum) > 0 ? Number(preservedPosNum) : null;
  if (preserved == null) return next;
  if (Number(next.next_pos_order_num) === preserved) return next;
  return {
    ...next,
    next_pos_order_num: preserved,
    next_pos_order_date: next.next_pos_order_date ?? todayPosOrderDate(),
  };
}

function resolveFreshWorkspacePosNum(
  activeCart,
  sessionOrders,
  pendingSale = null,
  issuedPosMax = null,
  floatSessionId = null,
) {
  const serverNext = resolvePosNextBrowseNumber(activeCart);
  let maxPos = 0;
  if (issuedPosMax != null && Number(issuedPosMax) > 0) {
    maxPos = Number(issuedPosMax);
  }
  const activeSession = Number(floatSessionId);
  const scopedSession =
    Number.isFinite(activeSession) && activeSession > 0 ? activeSession : null;
  const rows = [...(sessionOrders ?? [])];
  if (pendingSale) rows.unshift(pendingSale);
  for (const row of rows) {
    // After Z/reopen, ignore tickets from a prior float session (or unsynced
    // outbox still carrying the closed session id) so Cash Sales # restarts at 1.
    if (scopedSession != null) {
      const rowSession = Number(row?.float_session_id ?? 0);
      if (rowSession !== scopedSession) continue;
    }
    const n = Number(resolvePosSessionTicketNumber(row) ?? 0);
    if (n > maxPos) maxPos = n;
  }
  // Only count the active cart when it is an in-progress sale. A blank workspace
  // already shows last+1 on next_pos_order_num — treating that as issued would
  // make F8 jump an extra ticket (10 → 11 after F10 already prepared #10).
  const inProgress =
    (activeCart?.lines?.length ?? 0) > 0 ||
    Boolean(activeCart?.held_order_num && activeCart?.superseded_sale_id) ||
    Boolean(activeCart?.offline_client_sale_uuid);
  if (inProgress) {
    const activePos =
      resolvePosSessionTicketNumber(activeCart) ?? resolvePosNextBrowseNumber(activeCart);
    if (activePos != null && activePos > maxPos) maxPos = activePos;
  }
  const sessionNext = maxPos > 0 ? maxPos + 1 : null;
  // Session sequence from completed tickets on this till — do not jump to server
  // watermark+1 (reserved block) which would show Cash Sales #21 with unused #1–#20.
  if (sessionNext != null) return sessionNext;
  return serverNext;
}

/** Prefer local Cash Sales seq (source of truth) over session browse / server peek. */
async function resolveNextPosTicketForWorkspace(
  activeCart,
  sessionOrders,
  pendingSale = null,
  { skipServerReseed = false, floatSessionId = null } = {},
) {
  // Server may raise the floor (cancelled tickets). It must not rewind local issues.
  // Pass floatSessionId so a new till session after Z starts at receipt 1.
  if (skipServerReseed) {
    void ensurePosOfflineOrderNumbers({ force: false, floatSessionId }).catch(() => {});
  } else {
    try {
      await ensurePosOfflineOrderNumbers({ force: false, floatSessionId });
    } catch {
      /* offline — use local seq / session */
    }
  }

  const issuedPosMax = await peekIssuedPosTicketMax(null, floatSessionId).catch(() => null);
  const sessionNext = resolveFreshWorkspacePosNum(
    activeCart,
    sessionOrders,
    pendingSale,
    issuedPosMax,
    floatSessionId,
  );
  const emptyFresh =
    !(activeCart?.lines?.length > 0) &&
    !(activeCart?.held_order_num && activeCart?.superseded_sale_id) &&
    !activeCart?.offline_client_sale_uuid;
  const alreadyShowing = resolvePosNextBrowseNumber(activeCart);

  // Local seq includes pending outbox tickets — authoritative while offline sync lags.
  const localNext = await peekLocalPosTicketNext(null, floatSessionId).catch(() => null);
  const localFloorNext =
    issuedPosMax != null && Number(issuedPosMax) > 0
      ? Number(issuedPosMax) + 1
      : localNext;

  if (
    emptyFresh &&
    alreadyShowing != null &&
    localFloorNext != null &&
    Number(alreadyShowing) === Number(localFloorNext)
  ) {
    return Number(alreadyShowing);
  }

  if (
    emptyFresh &&
    alreadyShowing != null &&
    sessionNext != null &&
    Number(alreadyShowing) === Number(sessionNext) &&
    (localFloorNext == null || Number(alreadyShowing) >= Number(localFloorNext))
  ) {
    return Number(alreadyShowing);
  }

  const slot = await peekNextPosOfflineOrderSlot().catch(() => null);
  const slotNum =
    slot?.pos_order_num != null && Number(slot.pos_order_num) > 0
      ? Number(slot.pos_order_num)
      : null;

  // Local / issued max always wins over a lagging server watermark.
  const candidates = [localFloorNext, sessionNext, localNext, slotNum].filter(
    (n) => n != null && Number(n) > 0,
  );
  if (candidates.length) {
    return Math.max(...candidates.map((n) => Number(n)));
  }
  return sessionNext;
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

/** POS ticket # from active cart (and previous-order source sale when editing). */
function posCheckoutCartFields(activeCart, sourceSale = null, extras = {}) {
  const ticket = resolvePosTicketForCheckout(activeCart, {
    editOrderNo: extras.editOrderNo ?? "",
    sourceSale,
    pendingSlot: extras.pendingSlot ?? null,
  });
  const merged = {
    ...activeCart,
    pos_order_num:
      ticket.pos_order_num ??
      activeCart?.pos_order_num ??
      sourceSale?.pos_order_num ??
      null,
    pos_order_date:
      ticket.pos_order_date ??
      activeCart?.pos_order_date ??
      sourceSale?.pos_order_date ??
      null,
    next_pos_order_num:
      activeCart?.next_pos_order_num ?? ticket.pos_order_num ?? null,
    next_pos_order_date:
      activeCart?.next_pos_order_date ?? ticket.pos_order_date ?? null,
  };
  return {
    ...posTicketFieldsFromCart(merged),
    next_pos_order_num: merged.next_pos_order_num,
    next_pos_order_date: merged.next_pos_order_date,
    pos_order_num: merged.pos_order_num,
    pos_order_date: merged.pos_order_date,
  };
}

function mergeSaleWithCheckoutPosTicket(sale, cartSource, checkoutCartFields) {
  return withPosReceiptTicket(sale, {
    ...(cartSource ?? {}),
    ...checkoutCartFields,
    channel: cartSource?.channel ?? sale?.channel ?? "pos",
    order_source: cartSource?.order_source ?? sale?.order_source ?? "pos",
  });
}

function previousOrderEditWorkspaceHint({ kraFiscalize = false, offline = false } = {}) {
  if (offline) {
    return "Alt+P reprint; F10 to complete (even if unchanged).";
  }
  if (kraFiscalize) {
    return "Edits sync in the background (KRA credit note when online). Alt+P reprints without waiting for the fiscal QR — or leave with F8 / next order; updates still sync.";
  }
  return "Edits apply instantly — online sync runs 30 seconds after you stop changing lines. Alt+P to reprint, or F8 / next order — updates still sync.";
}

/** Standalone toast / banner copy for previous-order edit modes. */
function previousOrderEditModeMessages(orderNum, { kraFiscalize = false, offline = false } = {}) {
  const label = orderNum != null ? `#${orderNum}` : "this order";
  if (offline) {
    return {
      loaded: `Order ${label} loaded. Alt+P reprint; F10 to complete.`,
      f10: "F10 completes this offline order.",
      synced: null,
      leaveConfirm:
        "Clear this order and start a new one? Unsaved offline changes may be lost.",
    };
  }
  if (kraFiscalize) {
    return {
      loaded: `Order ${label} loaded. Edit lines — sync and KRA run in the background. Finish with Alt+P or F10: payment methods → reprint → new order.`,
      f10: "Enter payment methods for the top-up/return, then the revised receipt prints and a new order opens. KRA syncs in the background.",
      synced: `Order ${label} saved. Print again with Alt+P if needed.`,
      leaveConfirm:
        "Start a new order? Edits keep syncing in the background (including KRA). You do not need Alt+P first.",
    };
  }
  return {
    loaded: `Order ${label} loaded. Each change applies instantly. Finish with Alt+P or F10: payment methods → reprint → new order.`,
    f10: "Enter payment methods for any top-up/return, then the revised receipt prints and focus moves to a new order.",
    synced: `Order ${label} saved on server. Print the revised receipt (Alt+P or Reprint).`,
    leaveConfirm:
      "Start a new order? Edits stay queued and sync in the background — Alt+P is not required.",
  };
}

/** Prefer the revised cart while editing; never fall back to the pre-edit source sale. */
function resolvePosReprintSale({
  isCartEditSession,
  editSourceSale,
  completedSale,
  sessionPosOrders,
  lastReceiptFallback,
  editCartSnapshot = null,
}) {
  if (isCartEditSession && editCartSnapshot?.items?.length) return editCartSnapshot;
  // editSourceSale still has the original lines — printing it after a swap/qty change
  // is exactly the "screen shows new, receipt shows old" bug. Prefer nothing over that.
  if (isCartEditSession) return editCartSnapshot?.items?.length ? editCartSnapshot : null;
  if (completedSale?.id) return completedSale;
  if (sessionPosOrders?.[0]?.id) return sessionPosOrders[0];
  if (lastReceiptFallback?.id) return lastReceiptFallback;
  return null;
}

function saleHasPrintableItems(sale) {
  return (
    Array.isArray(sale?.items) &&
    sale.items.length > 0 &&
    !sale.items.some(
      (line) => line?.product_code && !saleLineProductName(line) && !line?.name,
    )
  );
}

/** Fast POS reprint: skip redundant settings/org/network round-trips when capabilities are warm. */
function fastPosPrintOptions(sale, base = {}) {
  const offline = offlinePrintOptions(sale, base);
  if (offline !== base) return offline;
  return {
    ...base,
    skipSaleRefresh: saleHasPrintableItems(sale),
    skipSettingsRefresh: true,
    skipOrganizationRefresh: Boolean(
      base.organization?.name || base.organizationName || base.capabilities?.profile_label,
    ),
    // Receipt HTML is built from the sale already in memory — don't wait on WAN.
    skipNetworkLookups: true,
    skipLogoFetch: true,
    // Just-completed checkout — don't block thermal print on stock-gate races.
    skipStockPrintGate: true,
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

function sellableSearchResults(products) {
  return (products ?? []).filter(isSellableCatalogProduct);
}

function posSearchAvailableQty(product, sellFromShop, posSalesConfig, sellWholesale) {
  const mode = productCartStockDisplayMode(product, posSalesConfig, sellWholesale);
  const shop = productStockAtLocation(product, "shop");
  const store = productStockAtLocation(product, "store");
  if (mode === "shop") return shop;
  if (mode === "store") return store;
  return sellFromShop ? shop : store;
}

export function PosScreen({ standalone = false }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { user, capabilities, organization, hasPermission, logout } = useAuth();
  const classicLayout = standalone && isClassicExternalPosLayout(capabilities);
  const classicThemeTemplate = useMemo(
    () => resolveClassicPosThemeTemplate(capabilities),
    [capabilities],
  );
  const classicThemeColors = useMemo(
    () => resolveClassicPosThemeColors(capabilities),
    [capabilities],
  );
  const classicThemeVars = useMemo(
    () =>
      classicLayout ? classicPosThemeCssVars(classicThemeTemplate, classicThemeColors) : null,
    [classicLayout, classicThemeTemplate, classicThemeColors],
  );
  const classicThemeBridgeVars = useMemo(
    () =>
      classicLayout
        ? classicPosThemeBridgeVars(classicThemeTemplate, classicThemeColors)
        : null,
    [classicLayout, classicThemeTemplate, classicThemeColors],
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
  const {
    offlineMode,
    networkStatus,
    canFlushOutbox,
    pendingSync,
    orderNumbersLeft: _orderNumbersLeft,
    nextPosOrderNum: offlineNextPosOrderNum,
    syncing: offlineSyncing,
    lastSyncMessage,
    syncProgress,
    failedSyncOrders,
    searchOffline,
    refreshCounts: refreshOfflineCounts,
    applyPendingOutboxCount,
    flushOutboxNow,
    flushOutboxAfterSale,
    syncOfflineOrders,
    syncSingleOfflineOrder,
  } = usePosOfflineSupport({
    enabled: standalone,
    floatSessionId,
    organizationId: organization?.id ?? user?.organization_id,
    userId: user?.id,
  });

  /** Push queued outbox sales to the server (await when caller must block). */
  async function pushOutboxAfterSale(orderNum, { syncingLabel = "syncing", background = false } = {}) {
    if (!standalone) return true;

    const run = async () => {
      if (!background) {
        setStatusMessage(
          orderNum != null
            ? `Sale #${orderNum} saved — pushing to server…`
            : "Pushing sale to server…",
        );
      }
      const { ok, results, pending } = await flushOutboxAfterSale();
      await refreshOfflineCounts();
      if (ok) {
        if (orderNum != null && !background) {
          setStatusMessage(`Sale #${orderNum} completed and synced.`);
        }
        return true;
      }
      const failed = (results ?? []).filter((row) => !row.ok);
      const detail =
        failed[0]?.error ??
        (pending > 0 ? `${pending} sale(s) still waiting to sync` : "Could not reach the server");
      notifyError(
        orderNum != null
          ? `Sale #${orderNum} saved locally — sync failed: ${detail}`
          : `Sale saved locally — sync failed: ${detail}`,
      );
      setStatusMessage(
        orderNum != null
          ? `Sale #${orderNum} saved locally — ${syncingLabel}.`
          : `Sale saved locally — ${syncingLabel}.`,
      );
      return false;
    };

    if (background) {
      void run();
      return true;
    }
    return run();
  }

  /** Fire-and-forget outbox sync after checkout — receipt prints without waiting.
   * While offline/slow, only queue the sale; reconnect flushes 1, 2, 3… when online. */
  function queueOutboxAfterSale(orderNum) {
    if (offlineMode || !canFlushOutbox) {
      void (async () => {
        await refreshOfflineCounts();
        let pending = 0;
        try {
          pending = await getPosOfflinePendingCount();
        } catch {
          pending = Number(pendingSync ?? 0);
        }
        const waiting =
          pending > 0
            ? `${pending} order${pending === 1 ? "" : "s"} waiting to sync`
            : "will sync when online";
        setStatusMessage(
          orderNum != null
            ? `Sale #${orderNum} saved — ${waiting}.`
            : `Sale saved — ${waiting}.`,
        );
      })();
      return;
    }
    void pushOutboxAfterSale(orderNum, { background: true });
  }

  const handlePendingSyncCountChange = useCallback(
    (count) => {
      applyPendingOutboxCount(count);
    },
    [applyPendingOutboxCount],
  );

  /** External POS: transient snackbar only — no header notification bell. */
  function posSnackbar(message, { error = false } = {}) {
    if (!standalone || !message) return;
    if (error) notifyError(message);
    else notifySuccess(message);
  }

  const classicCurrencySettings = useMemo(
    () => mergeGeneralSettings(capabilities?.module_settings),
    [capabilities?.module_settings],
  );
  const { runBlockingTask, overlayNode: checkoutWaitOverlay } = useBlockingWait(
    "Completing sale…",
  );
  const organizationId = user?.organization_id ?? capabilities?.organization_id;

  // Live snackbar when ERP / managers app updates product prices or markups.
  useEffect(() => {
    if (!standalone || !organizationId || !isRealtimeConfigured()) {
      return undefined;
    }

    let cancelled = false;
    /** @type {import('laravel-echo').default | null} */
    let echo = null;
    let channel = null;
    const channelName = `organization.${organizationId}`;
    let lastToastAt = 0;

    (async () => {
      try {
        echo = await createNotificationEcho();
        if (cancelled || !echo) return;

        channel = echo.private(channelName);
        channel.listen(".catalog.pricing.updated", (payload) => {
          const now = Date.now();
          // Avoid toast spam when several products are saved in quick succession.
          if (now - lastToastAt < 2500) return;
          lastToastAt = now;
          const message =
            typeof payload?.message === "string" && payload.message.trim()
              ? payload.message.trim()
              : "Product prices or markups were updated.";
          notifySuccess(message);
        });
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[pos] pricing realtime unavailable", error);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        channel?.stopListening(".catalog.pricing.updated");
        echo?.leave(channelName);
      } catch {
        /* ignore */
      }
      disconnectNotificationEcho(echo);
    };
  }, [standalone, organizationId]);

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
  const pricingFormulas = posSalesConfig.pricingFormulas;
  const posOrderTypeMode = posSalesConfig.posOrderTypeMode;
  // External POS (/pos) → require_pos_till_float (platform). Backoffice create order → require_backoffice_till_float (org admin).
  const requireTillFloat = isWorkspaceTillFloatRequired(capabilities?.module_settings, { standalone });
  const canManageTillSession = hasPosTill || (standalone && requireTillFloat);
  const salesWorkspace = standalone ? "pos" : "backoffice";
  const enablePosOrderEdit = standalone && posSalesConfig.enablePosOrderEdit;
  // Cash rounding (Light Stores last-digit) — external POS and backoffice Create order.
  const enablePosCashRounding = posSalesConfig.enablePosCashRounding;
  const blindTillClose = posSalesConfig.blindTillClose;
  const canChooseOrderType = addRouteMarkupPrices && posOrderTypeMode === "toggle";
  const lockedToRouteOrder = addRouteMarkupPrices && posOrderTypeMode === "route";
  const showRouteOrderUi = addRouteMarkupPrices && posOrderTypeMode !== "normal";
  const qtyInputRef = useRef(null);
  const discountInputRef = useRef(null);
  const unitPriceRef = useRef(null);
  /** Live qty from the input on Enter — avoids stale lineForm when the last digit has not re-rendered. */
  const lineFormQtyCommitRef = useRef(null);
  const searchInputRef = useRef(null);
  const productSearchRef = useRef(null);
  const cartLinesScrollRef = useRef(null);
  const classicCartTableScrollRef = useRef(null);
  const prevCartLineCountRef = useRef(0);
  const focusSearchAfterAdd = useRef(false);
  /**
   * Focus Scan code. Select-all is for barcode overwrite after a completed action.
   * Never select-all when the field is already focused — that wipes in-progress typing
   * (next keystroke replaces the whole query).
   */
  function focusPosScanInput({ selectAll = false, forceSelectAll = false } = {}) {
    const el = searchInputRef.current;
    if (!el) return;
    const alreadyFocused =
      typeof document !== "undefined" && document.activeElement === el;
    el.focus({ preventScroll: true });
    if (!selectAll && !forceSelectAll) return;
    if (alreadyFocused && !forceSelectAll) return;
    el.select?.();
  }
  const appliedRouteMarkupRef = useRef(0);
  const [sellFromShop, setSellFromShop] = useState(true);
  const [sellWholesale, setSellWholesale] = useState(false);
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
  const orgTodayKey = todayCalendarDate(capabilities?.general?.timezone ?? "Africa/Nairobi");
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
      const [tillRes, branchRes, sessionRes] = await Promise.allSettled([
        apiRequest("/tills", { searchParams: { per_page: 200 } }),
        apiRequest("/branches", {
          searchParams: { per_page: 200, ...orgListParams(organizationId) },
        }),
        apiRequest("/till-float-sessions", {
          searchParams: {
            per_page: 200,
            "filter[status]": "open",
            "filter[session_date]": orgTodayKey,
          },
        }),
      ]);
      const tills =
        tillRes.status === "fulfilled"
          ? (tillRes.value?.data ?? [])
          : [];
      const sessions =
        sessionRes.status === "fulfilled"
          ? (sessionRes.value?.data ?? [])
          : [];
      const branchesFromApi =
        branchRes.status === "fulfilled"
          ? filterByOrganization(branchRes.value?.data ?? [], organizationId)
          : [];
      const branches = branchesFromApi.length > 0
        ? branchesFromApi
        : Array.from(
            new Map(
              (tills ?? [])
                .map((t) => [t.branch_id, t.branch_id ? { id: t.branch_id, branch_name: `Branch #${t.branch_id}` } : null])
                .filter((row) => row[1] != null),
            ).values(),
          );

      const assignedTillForUser = (tills ?? []).find(
        (t) => user?.id != null && Number(t.cashier_id) === Number(user.id),
      );
      const branchId = user?.branch_id ?? assignedTillForUser?.branch_id ?? branches[0]?.id ?? null;

      if (branchId) {
        const picked = pickBranchTillForCashier({
          branchId,
          tills,
          openSessions: sessions,
          userId: user?.id,
          deviceIdentifier: getPosDeviceIdentifier(),
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
  }, [organizationId, requireTillFloat, user?.branch_id, user?.id, orgTodayKey]);

  const openByTill = useMemo(
    () => indexOpenSessionsByTill(posOpenSessions),
    [posOpenSessions],
  );

  const activeTill = useMemo(
    () => posTills.find((t) => String(t.id) === String(tillId ?? activeSession?.till_id)) ?? null,
    [posTills, tillId, activeSession?.till_id],
  );

  const reportTillNo = useMemo(
    () => resolveTillReportNo({ till: activeTill, session: activeSession, report: sessionReport }),
    [activeTill, activeSession, sessionReport],
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

  // Keep the flag in sync with what OpenSessionModal actually shows. Otherwise
  // floatModalOpen can stay true after a session opens and Alt+H falsely says
  // "Close the till float dialog first" when no dialog is on screen.
  const floatDeclareDialogOpen = Boolean(
    canManageTillSession &&
      !activeSession &&
      !suspendedSession &&
      !sessionLoading &&
      !zReportOpen &&
      floatModalOpen &&
      (requireTillFloat || standalone),
  );

  useEffect(() => {
    if (!floatModalOpen) return;
    if (floatDeclareDialogOpen) return;
    setFloatModalOpen(false);
  }, [floatModalOpen, floatDeclareDialogOpen]);

  useEffect(() => {
    // Warm local print agent so the first receipt can skip the health ping.
    // Backoffice Create order uses the same thermal path as External POS.
    if (!isPrintAgentEnabled()) return;
    void warmPrintAgentHealth();
  }, [standalone, capabilities?.module_settings?.local_printing]);

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

      const opened = await openSession({
        ...payload,
        till_id: tillId,
        branch_id: branchId,
        device_identifier: getPosDeviceIdentifier(),
      });
      setFloatModalOpen(false);
      // New session must not inherit prior-session Cash Sales # from browse list.
      setSessionPosOrders([]);
      setCompletedSale(null);
      completedSaleRef.current = null;
      // After Z/close + reopen, Cash Sales # must restart at 1 for the new session.
      try {
        const sessionId = opened?.id ?? null;
        const { seedLocalPosTicketSeq } = await import("@/lib/pos-offline");
        // Force local counter to 0 before server peek so UI cannot flash old day max.
        if (sessionId) {
          await seedLocalPosTicketSeq(0, null, sessionId, { force: true });
        }
        const refreshed = await ensurePosOfflineOrderNumbers({
          force: true,
          floatSessionId: sessionId,
        });
        const nextNum = Number(refreshed?.next_pos_order_num ?? 1);
        const startAt =
          Number.isFinite(nextNum) && nextNum > 0 ? nextNum : 1;
        applyFreshWorkspacePlaceholder(cartRef.current, startAt);
        setEditOrderNo(String(startAt));
      } catch {
        applyFreshWorkspacePlaceholder(cartRef.current, 1);
        setEditOrderNo("1");
      }
      defaultScanFocusDoneRef.current = false;
      window.requestAnimationFrame(() => {
        focusPosScanInput({ selectAll: true });
      });
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
    setZReportTillName(
      resolveTillReportNo({
        till: closedTill,
        session: res?.session,
        report: res?.report ?? res,
      }),
    );
    setCloseSessionOpen(false);
    setZReportPayload(res);
    setZReportOpen(true);
  }

  async function resetPosLocalStateAfterZPrint() {
    // Do not await outbox sync here. Sync holds the IndexedDB exclusive lock and an
    // open connection; racing it left wipe blocked, froze the till after Z print, and
    // kept Cash Sales seq / carts for the next session. Wipe must win — then sign out.
    try {
      await Promise.race([
        clearPosSessionLocalCache(),
        new Promise((resolve) => window.setTimeout(resolve, 6_000)),
      ]);
    } catch (e) {
      console.warn("Could not wipe POS IndexedDB after Z print", e);
      try {
        await clearAllLocalHeldOrders();
        await clearLocalPosCart();
        await clearPreviousOrderEditDraft();
      } catch {
        /* non-fatal — still sign out */
      }
    }
    clearAutoHeldOrder();
    clearPosLastReceipt(user?.id, user?.branch_id);
    clearPosUiDraft();
    cartRef.current = null;
    setCart(null);
    setSelectedLineId(null);
    setHeldOrdersCount(0);
    setCompletedSale(null);
    completedSaleRef.current = null;
    setSessionPosOrders([]);
    setEditSourceSale(null);
    setStatusMessage(null);
  }

  /** Ask before wiping local POS data when unsynced offline sales still exist. */
  async function confirmWipeLocalPosDataIfNeeded() {
    let pending = Number(pendingSync ?? 0);
    try {
      pending = await getPosOfflinePendingCount();
    } catch {
      /* use state count */
    }
    const failed = Array.isArray(failedSyncOrders) ? failedSyncOrders.length : 0;
    const total = Math.max(pending, failed);
    if (total <= 0) return true;
    return confirm({
      title: "Wipe local POS data?",
      message:
        `There ${total === 1 ? "is 1 pending offline order" : `are ${total} pending offline orders`} ` +
        "that have not synced to the server. Signing out after Z will wipe them from this device. " +
        "Cancel to keep them, then open Pending sync to upload or delete first.",
      confirmLabel: "Wipe and sign out",
      cancelLabel: "Cancel",
      destructive: true,
    });
  }

  function leavePosAfterZ() {
    floatModalDismissedRef.current = true;
    setFloatModalOpen(false);
    setZReportPayload(null);
    setZReportOpen(false);
    setZReportTillName(null);
    void logout();
  }

  async function handleZReportPrinted() {
    if (!(await confirmWipeLocalPosDataIfNeeded())) {
      return;
    }
    try {
      await Promise.race([
        resetPosLocalStateAfterZPrint(),
        new Promise((resolve) => window.setTimeout(resolve, 8_000)),
      ]);
    } finally {
      leavePosAfterZ();
    }
  }

  async function handleZReportSignOut() {
    // Sign out without print — still wipe so the next cashier cannot inherit this shift.
    if (!(await confirmWipeLocalPosDataIfNeeded())) {
      return;
    }
    try {
      await Promise.race([
        clearPosSessionLocalCache(),
        new Promise((resolve) => window.setTimeout(resolve, 6_000)),
      ]);
    } catch (e) {
      console.warn("Could not wipe POS IndexedDB on Z dismiss", e);
    }
    leavePosAfterZ();
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
    if (!posSalesConfig.enableRetailPricing) setSellWholesaleMode(true);
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
  const searchAbortRef = useRef(null);

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
        setSelectedProduct((prev) => (prev?.product_code === code ? prev : null));
      }
    }
    if (typeof value.sellFromShop === "boolean") setSellFromShop(value.sellFromShop);
    if (typeof value.sellWholesale === "boolean") setSellWholesaleMode(value.sellWholesale);
    if (typeof value.isRouteOrder === "boolean") setIsRouteOrder(value.isRouteOrder);
    if (value.selectedRouteId != null) setSelectedRouteId(String(value.selectedRouteId));
  }, []);

  const isPosUiDraftBaseline = useCallback(
    (value) => {
      if (!value) return true;
      return (
        isEmptyPosLineForm(value.lineForm) &&
        value.sellFromShop === true &&
        value.sellWholesale === false &&
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
  /** Local-first workspace (offline/slow or mid-sale outage cart): no network payments / STK. */
  const posNetworkPaymentsBlocked =
    standalone && (offlineMode || Boolean(cart?.offline) || Boolean(cart?.offline_client_sale_uuid));
  const showCartPaymentPrompts =
    !posNetworkPaymentsBlocked &&
    posCartPaymentPromptsEnabled({
      enableVouchers,
      enablePoints: enableRedeemablePoints,
      enableMpesa: enableMpesaOnPos,
    });
  const [selectedLineId, setSelectedLineId] = useState(null);
  const {
    selectedIds: selectedLineIds,
    selectedCount: selectedLineCount,
    toggleOne: toggleCartLineSelect,
    toggleAllOnPage: toggleAllCartLinesOnPage,
    clearSelection: clearCartLineSelection,
    isAllOnPageSelected: allCartLinesSelected,
    isSomeOnPageSelected: someCartLinesSelected,
    setSelectedIds: setSelectedLineIds,
  } = usePageRowSelection();
  const [editingLineId, setEditingLineId] = useState(null);
  const [editingLineRef, setEditingLineRef] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previousOrderLoading, setPreviousOrderLoading] = useState(false);
  const [previousOrderLoadingMessage, setPreviousOrderLoadingMessage] = useState(
    "Loading previous order…",
  );
  const [previousOrderLoadingDetail, setPreviousOrderLoadingDetail] = useState(
    "Restoring lines and payment details…",
  );
  const [previousOrderLoadingSoft, setPreviousOrderLoadingSoft] = useState(false);
  const previousOrderLoadingDepthRef = useRef(0);
  const [preparingNextOpen, setPreparingNextOpen] = useState(false);
  const [preparingNextProgress, setPreparingNextProgress] = useState(0);
  const [lineBusy, setLineBusy] = useState(false);
  const [cartLineSaveFailed, setCartLineSaveFailed] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  /** Shown while copying cart between online server ↔ local offline storage. */
  const [cartBridgeStatus, setCartBridgeStatus] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saveOrderOpen, setSaveOrderOpen] = useState(false);
  const [heldOrdersOpen, setHeldOrdersOpen] = useState(false);
  const [heldOrdersCount, setHeldOrdersCount] = useState(0);
  const [pendingSyncOpen, setPendingSyncOpen] = useState(false);
  const [priceCheckerOpen, setPriceCheckerOpen] = useState(false);
  const pendingSyncAlertRef = useRef(false);
  const [autoHeldPrompt, setAutoHeldPrompt] = useState(null);
  const [autoHeldBusy, setAutoHeldBusy] = useState(false);
  const [orderDialogMode, setOrderDialogMode] = useState("save");
  const [saveOrderError, setSaveOrderError] = useState(null);
  const [paymentError, setPaymentError] = useState(null);
  const [kraUploadPrompt, setKraUploadPrompt] = useState(null);
  const [kraUploadBusy, setKraUploadBusy] = useState(false);
  const [kraUploadError, setKraUploadError] = useState(null);
  const kraCheckoutRetryRef = useRef(null);
  const [completedSale, setCompletedSale] = useState(null);
  const completedSaleRef = useRef(null);
  /** Sale loaded for POS order edit — used for Reprint receipt while revising. */
  const [editSourceSale, setEditSourceSale] = useState(null);
  const [receiptPrintStatus, setReceiptPrintStatus] = useState(null);
  const [orderEditError, setOrderEditError] = useState(null);
  const [sessionPosOrders, setSessionPosOrders] = useState([]);
  const [editOrderNo, setEditOrderNo] = useState("");
  const [editBrowseIndex, setEditBrowseIndex] = useState(0);
  const orderNoUserEditedRef = useRef(false);
  const [orderNameResults, setOrderNameResults] = useState(null);
  const [orderNameLoading, setOrderNameLoading] = useState(false);
  const [orderNameHighlight, setOrderNameHighlight] = useState(0);
  const orderNameSearchSeqRef = useRef(0);
  const [replacingLineId, setReplacingLineId] = useState(null);
  const replacingLineIdRef = useRef(null);
  const [swapDraft, setSwapDraft] = useState(null);
  const swapDraftRef = useRef(null);
  const swapLineQtyRef = useRef(null);
  const swapCommitInFlightRef = useRef(false);
  const [editAdjustmentDialog, setEditAdjustmentDialog] = useState(null);
  const resolveEditAdjustmentRef = useRef(null);
  const [leaveGuardOpen, setLeaveGuardOpen] = useState(false);
  const [leaveGuardBusy, setLeaveGuardBusy] = useState(false);
  const pendingLeaveHrefRef = useRef(null);
  const floatModalDismissedRef = useRef(false);
  const defaultScanFocusDoneRef = useRef(false);
  const cartRef = useRef(null);
  /** Server TemporaryCart ids checkout/delete already consumed — never reuse for line adds. */
  const consumedServerCartIdsRef = useRef(new Set());
  /** Coalesce concurrent TemporaryCart materialize (held restore + first scan). */
  const materializeInflightRef = useRef(null);
  /** Drop stale held-restore materialize when cashier starts another sale. */
  const heldRestoreGenerationRef = useRef(0);
  const cartSummaryRef = useRef(null);
  const lineBusyRef = useRef(false);
  const productByCodeRef = useRef({});
  const retailByCodeRef = useRef({});
  const applyLiveCartCatalogPricesRef = useRef(null);
  const sellWholesaleRef = useRef(false);
  function markServerCartConsumed(cartId) {
    if (!isServerPosCartId(cartId)) return;
    consumedServerCartIdsRef.current.add(Number(cartId));
  }

  function isServerCartConsumed(cartId) {
    return isServerPosCartId(cartId) && consumedServerCartIdsRef.current.has(Number(cartId));
  }

  /**
   * After F8 / checkout abandons a TemporaryCart, ignore late line POST/PATCH
   * responses so they cannot repaint the cleared workspace (felt like needing F8 twice).
   */
  function shouldApplyServerCartMutation(fromCartId) {
    if (fromCartId != null && isServerCartConsumed(fromCartId)) return false;
    if (isFreshWorkspacePlaceholder(cartRef.current)) return false;
    return true;
  }

  /** Drop workspace to a blank new-order shell without waiting on the network. */
  function applyFreshWorkspacePlaceholder(activeCart, peekNextPos) {
    heldRestoreGenerationRef.current += 1;
    const placeholder = {
      id: "pending-fresh",
      channel,
      order_source: standalone ? "pos" : "backoffice",
      branch_id: user?.branch_id ?? activeCart?.branch_id ?? null,
      till_id: tillId ?? activeCart?.till_id ?? null,
      float_session_id: floatSessionId ?? activeCart?.float_session_id ?? null,
      lines: [],
      ...(peekNextPos != null ? { next_pos_order_num: peekNextPos } : {}),
    };
    cartRef.current = placeholder;
    setCart(placeholder);
    setEditOrderNo(peekNextPos != null ? String(peekNextPos) : "");
    return placeholder;
  }

  // After Ctrl+R prepare reseeds Cash Sales seq from server (cancelled #s consumed),
  // bump a blank workspace so the order box shows 275 instead of stale 274.
  useEffect(() => {
    if (!standalone || offlineNextPosOrderNum == null) return undefined;
    const cart = cartRef.current;
    const emptyFresh =
      !(cart?.lines?.length > 0) &&
      !(cart?.held_order_num && cart?.superseded_sale_id) &&
      !cart?.offline_client_sale_uuid;
    if (!emptyFresh) return undefined;
    const showing = Number(cart?.next_pos_order_num ?? editOrderNo ?? 0);
    if (Number(offlineNextPosOrderNum) > showing) {
      applyFreshWorkspacePlaceholder(cart, Number(offlineNextPosOrderNum));
    }
    return undefined;
  }, [standalone, offlineNextPosOrderNum, editOrderNo]);

  function getRetailPackage(code) {
    if (!code) return null;
    const cached = retailByCodeRef.current[code];
    if (cached) return cached;
    // Prefer the item's embedded retail package settings (product list / show).
    const embedded = productByCodeRef.current[code]?.retail_package;
    if (embedded) {
      retailByCodeRef.current[code] = embedded;
      return embedded;
    }
    return cached !== undefined ? cached : null;
  }

  /** Ensure this SKU's retail_package_settings row is loaded before pricing. */
  async function ensureRetailPackageForProduct(product) {
    const code = product?.product_code;
    if (!code) return null;
    if (product.retail_package && !retailByCodeRef.current[code]) {
      retailByCodeRef.current[code] = product.retail_package;
    }
    if (retailByCodeRef.current[code] === undefined) {
      await ensureRetailPackages([code]);
    }
    return getRetailPackage(code);
  }
  const cartCommitChainRef = useRef(Promise.resolve());
  const editAutosaveTimerRef = useRef(null);
  const editAutosaveInFlightRef = useRef(false);
  const editAutosaveRerunRef = useRef(null);
  const skipEditAutosaveRef = useRef(false);
  const openCompletePaymentInFlightRef = useRef(false);
  const [editAutosaveBusy, setEditAutosaveBusy] = useState(false);

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
    if (cart?.held_order_num || cart?.superseded_sale_id) {
      return resolvePosBrowseNumber(cart);
    }
    return resolvePosNextBrowseNumber(cart);
  }, [
    cart?.held_order_num,
    cart?.superseded_sale_id,
    cart?.pos_order_num,
    cart?.next_pos_order_num,
  ]);

  const showStandaloneTillActions = standalone;
  const canUseSessionReports = Boolean(activeSession?.id);
  const showCartToolbar =
    !standalone &&
    (heldOrdersCount > 0 || (requireTillFloat && activeSession));

  const canGoPreviousOrder = sessionPosOrders.length > 0 && editBrowseIndex < sessionPosOrders.length - 1;
  const canGoNextOrder = sessionPosOrders.length > 0 && editBrowseIndex > 0;
  const hasSessionOrders = sessionPosOrders.length > 0;

  const prefilledEditCustomerName = useMemo(() => {
    const fromCart = String(cart?.customer_name_override ?? "").trim();
    if (fromCart) return fromCart;
    const orderNum = resolvePosBrowseNumber(cart) ?? cart?.held_order_num;
    if (!orderNum) return "";
    return getPosOrderCustomerName(orderNum);
  }, [cart?.customer_name_override, cart?.held_order_num, cart?.pos_order_num]);

  const prefilledEditCustomerNum = useMemo(() => {
    if (cart?.customer_num != null && Number(cart.customer_num) > 0) {
      return String(cart.customer_num);
    }
    const orderNum = resolvePosBrowseNumber(cart) ?? cart?.held_order_num;
    if (!orderNum) return "";
    const { customerNum } = getPosOrderCustomer(orderNum);
    return customerNum != null ? String(customerNum) : "";
  }, [cart?.customer_num, cart?.held_order_num, cart?.pos_order_num]);

  /** True only while revising a previous booked/completed receipt (not a restored held park). */
  const isCartEditSession = Boolean(cart?.held_order_num && cart?.superseded_sale_id);
  const isEditableResubmit = Boolean(cart?.discount_resubmit && isCartEditSession);
  /** Modern POS: revising a completed order (hold disabled; Complete saves + prints). */
  const modernOrderEditLocked = Boolean(
    standalone && !classicLayout && isCartEditSession && !isEditableResubmit,
  );
  const lastReceiptFallback = useMemo(
    () => readPosLastReceipt(user?.id, user?.branch_id),
    // Re-read when user identity changes; completedSale updates also refresh via remember.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: seed from storage once per user/branch
    [user?.id, user?.branch_id, completedSale?.id],
  );
  const editCartPrintSnapshot = useMemo(() => {
    if (!isCartEditSession || !cart) return null;
    return buildPreviousOrderEditPrintSale(cart, { user, organization, sourceSale: editSourceSale });
  }, [isCartEditSession, cart, user, organization, editSourceSale]);
  const reprintSale = useMemo(
    () =>
      resolvePosReprintSale({
        isCartEditSession,
        editSourceSale,
        completedSale,
        sessionPosOrders,
        lastReceiptFallback,
        editCartSnapshot: editCartPrintSnapshot,
      }),
    [
      isCartEditSession,
      editSourceSale,
      completedSale,
      sessionPosOrders,
      lastReceiptFallback,
      editCartPrintSnapshot,
    ],
  );
  const reprintReceiptLabel = (() => {
    const label = formatPosBrowseLabel(reprintSale);
    return label !== "—" ? `Reprint receipt #${label}` : "Reprint receipt";
  })();

  /** New-order mode: keep the # box on the next POS ticket until the user edits or opens a receipt. */
  useEffect(() => {
    if (!standalone) return;
    if (orderNoUserEditedRef.current) return;
    if (isCartEditSession) {
      const browse = resolvePosBrowseNumber(cart);
      if (browse != null) setEditOrderNo(String(browse));
      return;
    }
    const nextBrowse = resolvePosNextBrowseNumber(cart);
    if (nextBrowse != null) {
      setEditOrderNo(String(nextBrowse));
      return;
    }
    // F8 / post-checkout placeholder owns editOrderNo — never derive from session list here.
    if (isFreshWorkspacePlaceholder(cart)) return;
    if (sessionPosOrders.length > 0) {
      let maxPos = 0;
      for (const row of sessionPosOrders) {
        const n = Number(resolvePosSessionTicketNumber(row) ?? 0);
        if (n > maxPos) maxPos = n;
      }
      if (maxPos > 0) {
        setEditOrderNo(String(maxPos + 1));
      }
    }
  }, [
    standalone,
    isCartEditSession,
    cart?.id,
    cart?.held_order_num,
    cart?.pos_order_num,
    cart?.next_pos_order_num,
    sessionPosOrders,
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
        ? `Revising Cash Sales #${formatPosBrowseLabel(cart)}. Approver-advised discounts are applied — complete checkout to book.`
        : "Approver-advised discounts are applied. Complete checkout to book this order.";
    }
    if (advisedDiscountLines.length > 0) {
      return isCartEditSession
        ? `Revising Cash Sales #${formatPosBrowseLabel(cart)}. Apply advised discounts on each line, then complete checkout to resubmit.`
        : "Manager advised discounts per item. Apply them, then complete checkout to resubmit.";
    }
    return isCartEditSession
      ? `Revising Cash Sales #${formatPosBrowseLabel(cart)}. Update line discounts, then complete checkout to resubmit for approval.`
      : "Update line discounts, then complete checkout to resubmit for approval.";
  }, [
    advisedDiscountLines.length,
    advisedDiscountReady,
    cart?.held_order_num,
    cart?.pos_order_num,
    discountFeaturesEnabled,
    isCartEditSession,
    isEditableResubmit,
  ]);

  function rememberCompletedPosOrder(sale) {
    if (!sale?.id) return;
    rememberPosLastReceipt(user?.id, user?.branch_id, sale);
    if (!enablePosOrderEdit) return;
    if (
      !isCheckoutCompleteStatus(sale.status, channelWorkflow, "pos") &&
      !sale.offline_pending_sync
    ) {
      return;
    }
    const browseNum = resolvePosBrowseNumber(sale);
    const entry = {
      id: sale.id,
      order_num: sale.order_num,
      pos_order_num: sale.pos_order_num ?? null,
      pos_order_date: sale.pos_order_date ?? null,
      float_session_id: sale.float_session_id ?? floatSessionId ?? null,
      status: sale.status,
      ...(sale.offline_pending_sync ? { offline_pending_sync: true } : {}),
    };
    setSessionPosOrders((prev) => {
      // Same POS ticket after edit replaces the previous sale id so ← opens the live receipt.
      const next = sortPosOrdersByNumberDesc([
        entry,
        ...prev.filter(
          (row) =>
            String(row.id) !== String(entry.id) &&
            !sessionOrderMatchesBrowseNum(row, browseNum),
        ),
      ]);
      return next.slice(0, 15);
    });
    setEditBrowseIndex(0);
    // Leave editOrderNo on the completed ticket for ← browse; post-checkout advance sets the next #.
    if (!posSalesConfig.showCheckoutOnCreate) {
      if (browseNum != null) setEditOrderNo(String(browseNum));
    }
  }

  /** Keep Reprint enabled across clear-workspace / remount. */
  function markSaleForReprint(sale) {
    if (!sale?.id) return;
    completedSaleRef.current = sale;
    setCompletedSale(sale);
    rememberCompletedPosOrder(sale);
  }

  function promptPreviousOrderPaymentAdjustment(delta, orderNum, options = {}) {
    return new Promise((resolve, reject) => {
      resolveEditAdjustmentRef.current = { resolve, reject };
      setEditAdjustmentDialog({
        delta,
        orderNum,
        confirmLabel: options.confirmLabel ?? "Save & continue",
      });
    });
  }

  async function ensurePreviousOrderPaymentAdjustment(cartNow, options = {}) {
    if (!cartNow?.held_order_num || !cartNow?.superseded_sale_id) return cartNow;
    // Payment method / top-up / return only when the cashier actually changed the order.
    if (!options.force && !editedOrderHasLocalDraftChanges(cartNow)) {
      return cartNow;
    }
    const delta = computePreviousOrderEditPaymentDelta(editSourceSale, cartNow, {
      cashRound: enablePosCashRounding,
    });
    // No bill change → never prompt (even if a no-op keystroke left the cart dirty).
    if (!delta.type || !(Number(delta.amount) > 0)) return cartNow;
    if (previousOrderAdjustmentsMatchDelta(cartNow.payment_adjustments, delta)) return cartNow;
    const adjustments = await promptPreviousOrderPaymentAdjustment(
      delta,
      cartNow.held_order_num ?? resolvePosBrowseNumber(cartNow),
      options,
    );
    const next = withEditDraftDirty({ ...cartNow, payment_adjustments: adjustments });
    cartRef.current = next;
    setCart(next);
    void savePreviousOrderEditDraft(next).catch(() => {});
    return next;
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

    // Previous-order browse: today only, this cashier, current float session.
    const today = new Date().toISOString().slice(0, 10);
    const cashierId = user?.id != null ? Number(user.id) : null;
    const activeFloatId =
      floatSessionId != null && Number(floatSessionId) > 0
        ? Number(floatSessionId)
        : null;

    async function fetchRows(searchParams) {
      const res = await apiRequest("/sales", { searchParams });
      return Array.isArray(res?.data) ? res.data : [];
    }

    try {
      let rows = [];
      try {
        const baseExtra = {
            for_pos_order_edit: 1,
            channel: "pos",
            order_source: "pos",
            with_items: 0,
            sort: "-created_at",
          from_date: today,
          to_date: today,
            date_field: "placed",
          ...(cashierId != null ? { cashier_id: cashierId } : {}),
          ...(activeFloatId != null ? { float_session_id: activeFloatId } : {}),
        };
        rows = await fetchRows(
          buildPageParams({
            page: 1,
            perPage: 15,
            extra: {
              ...baseExtra,
              status_in: statusIn,
              exclude_statuses: "held,draft,cancelled,expired",
          },
        }),
      );

      if (!rows.length) {
        rows = await fetchRows(
          buildPageParams({
            page: 1,
              perPage: 15,
              extra: baseExtra,
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
          if (cashierId != null) {
            const rowCashier = row.cashier_id ?? row.created_by;
            if (rowCashier != null && Number(rowCashier) !== cashierId) return false;
          }
          if (activeFloatId != null) {
            const rowSession = Number(row.float_session_id ?? 0);
            // Only exclude when the sale is stamped to a *different* open session.
            // Null/0 (legacy or remapped edits) must stay browseable by Cash Sales #.
            if (rowSession > 0 && rowSession !== activeFloatId) return false;
          }
          const source = String(row.order_source ?? row.channel ?? "pos").toLowerCase();
          if (source && source !== "pos") return false;
          const status = String(row.status ?? "").toLowerCase();
          if (["held", "draft", "cancelled", "expired"].includes(status)) return false;
          return true;
        })
        .map((row) => ({
          id: row.id,
          order_num: row.order_num,
          pos_order_num: row.pos_order_num ?? null,
          pos_order_date: row.pos_order_date ?? null,
          float_session_id: row.float_session_id ?? null,
          status: row.status,
          order_total: row.order_total != null ? Number(row.order_total) : null,
          amount_paid: row.amount_paid != null ? Number(row.amount_paid) : null,
        }))
        .slice(0, 15);

      let offlineOrders = [];
      try {
        offlineOrders = await listOfflinePendingSalesForEdit();
      } catch {
        offlineOrders = [];
      }
      // Keep unsynced sales from prior sessions visible for sync/edit, but the
      // Cash Sales # sequencer only counts the open float session (below).
      offlineOrders = offlineOrders.map((row) => ({
        ...row,
        float_session_id: row.float_session_id ?? null,
      }));

      const offlineBrowseKeys = new Set(
        offlineOrders
          .map((row) => resolvePosSessionTicketNumber(row))
          .filter((n) => n != null)
          .map(String),
      );
      const orders = sortPosOrdersByNumberDesc([
        ...offlineOrders.map((row) => ({
          id: row.id,
          order_num: row.order_num,
          pos_order_num: row.pos_order_num ?? null,
          pos_order_date: row.pos_order_date ?? null,
          float_session_id: row.float_session_id ?? null,
          status: row.status,
          offline_pending_sync: true,
        })),
        ...serverOrders.filter((row) => {
          const ticket = resolvePosSessionTicketNumber(row);
          return ticket == null || !offlineBrowseKeys.has(String(ticket));
        }),
      ]).slice(0, 15);

      setSessionPosOrders(orders);
      // Restore Reprint target after remount when React state was wiped.
      setCompletedSale((prev) => {
        if (prev?.id) return prev;
        if (!orders[0]?.id) return prev;
        return orders[0];
      });
      if (orders[0]?.id) {
        const remembered = readPosLastReceipt(user?.id, user?.branch_id);
        if (!remembered?.id) {
          rememberPosLastReceipt(user?.id, user?.branch_id, orders[0]);
        }
      }
      setEditOrderNo((current) => {
        const live = cartRef.current;
        const editingPrevious = Boolean(live?.held_order_num && live?.superseded_sale_id);
        const onFreshNewOrder =
          isFreshWorkspacePlaceholder(live) ||
          (!editingPrevious && !live?.offline_client_sale_uuid);
        if (onFreshNewOrder) {
          // Prefer session-scoped next ticket — never fall back to prior-session max.
          const nextScoped = resolveFreshWorkspacePosNum(
            live,
            orders,
            null,
            null,
            activeFloatId,
          );
          if (nextScoped != null) return String(nextScoped);
          const next = resolvePosNextBrowseNumber(live);
          if (next != null) return String(next);
          if (String(current ?? "").trim()) return current;
          return "1";
        } else if (String(current ?? "").trim()) {
          return current;
        }
        const browse = resolvePosBrowseNumber(orders[0]);
        return browse != null ? String(browse) : current;
      });
      return orders;
    } catch (e) {
      const message =
        e instanceof ApiError ? dedupeErrorMessage(e.message) : "Could not load completed POS orders";
      setOrderEditError(message);
      setStatusMessage(message);
      return [];
    }
  }, [
    enablePosOrderEdit,
    standalone,
    channelWorkflow,
    user?.id,
    user?.branch_id,
    floatSessionId,
  ]);

  const clearOrderNameSearch = useCallback(() => {
    orderNameSearchSeqRef.current += 1;
    setOrderNameResults(null);
    setOrderNameLoading(false);
    setOrderNameHighlight(0);
  }, []);

  const searchPosOrdersByCustomerName = useCallback(
    async (nameQuery) => {
      const trimmed = String(nameQuery ?? "").trim();
      if (trimmed.length < 2) return [];

      const TOMBSTONE_MIN = 9_000_000;
      const needle = trimmed.toLowerCase();

      let offlineMatches = [];
      try {
        const offlineOrders = await listOfflinePendingSalesForEdit();
        offlineMatches = offlineOrders
          .filter((row) => {
            const label = saleCustomerLabel(row).toLowerCase();
            const override = String(row.customer_name_override ?? "").toLowerCase();
            return label.includes(needle) || override.includes(needle);
          })
          .map(mapPosOrderNameResult);
      } catch {
        offlineMatches = [];
      }

      let serverMatches = [];
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
              filter_customer: trimmed,
              sort: "-created_at",
            },
          }),
        });
        const rows = Array.isArray(res?.data) ? res.data : [];
        serverMatches = rows
          .filter((row) => row?.id != null)
          .filter((row) => Number(row.order_num) < TOMBSTONE_MIN)
          .filter((row) => !row?.fulfillment_meta?.superseded_by_edit)
          .filter((row) => {
            const status = String(row.status ?? "").toLowerCase();
            return !["held", "draft", "cancelled", "expired"].includes(status);
          })
          .map(mapPosOrderNameResult);
      } catch {
        serverMatches = [];
      }

      const offlineIds = new Set(offlineMatches.map((row) => String(row.id)));
      const merged = [
        ...offlineMatches,
        ...serverMatches.filter((row) => !offlineIds.has(String(row.id))),
      ];
      return merged.slice(0, 25);
    },
    [],
  );

  const orderNameSearchQuery = useMemo(() => {
    if (!classicLayout || !enablePosOrderEdit) return "";
    const trimmed = String(editOrderNo ?? "").trim();
    if (trimmed.length < 2) return "";
    if (looksLikePosOrderNumberLookup(trimmed)) return "";
    // Don't treat the next-ticket placeholder as a name while user hasn't edited.
    if (!orderNoUserEditedRef.current) return "";
    return trimmed;
  }, [classicLayout, enablePosOrderEdit, editOrderNo]);

  const debouncedOrderNameQuery = useDebouncedValue(orderNameSearchQuery, 300);

  useEffect(() => {
    if (!debouncedOrderNameQuery) {
      // Do not clear results here — keep the dropdown open while typing/pausing
      // until Esc, selection, empty field, or order-# lookup.
      setOrderNameLoading(false);
      return;
    }

    const seq = ++orderNameSearchSeqRef.current;
    let cancelled = false;
    setOrderNameLoading(true);
    void (async () => {
      try {
        const results = await searchPosOrdersByCustomerName(debouncedOrderNameQuery);
        if (cancelled || seq !== orderNameSearchSeqRef.current) return;
        setOrderNameResults(results);
        setOrderNameHighlight(0);
      } catch {
        if (cancelled || seq !== orderNameSearchSeqRef.current) return;
        setOrderNameResults([]);
        setOrderNameHighlight(0);
      } finally {
        if (!cancelled && seq === orderNameSearchSeqRef.current) {
          setOrderNameLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedOrderNameQuery, searchPosOrdersByCustomerName]);

  // Hydrate last receipt for Reprint when returning to POS (module switch / remount).
  useEffect(() => {
    if (!standalone || !user?.id) return;
    setCompletedSale((prev) => {
      if (prev?.id) return prev;
      return readPosLastReceipt(user.id, user.branch_id);
    });
  }, [standalone, user?.id, user?.branch_id]);

  useEffect(() => {
    lineBusyRef.current = lineBusy;
  }, [lineBusy]);

  useEffect(() => {
    if (!enablePosOrderEdit || !standalone) return;
    void loadCompletedPosOrders();
  }, [enablePosOrderEdit, standalone, loadCompletedPosOrders]);

  useEffect(() => {
    if (!standalone || !enablePosOrderEdit) return;
    if (offlineSyncing) return;
    if (!lastSyncMessage) return;
    // Only refresh ← browse after a successful sync. Failed retries used to reload
    // completed orders on every attempt (and reopen the pending-sync popup).
    if (!/^Synced\s+\d+/i.test(String(lastSyncMessage).trim())) return;
    void loadCompletedPosOrders();
  }, [
    standalone,
    enablePosOrderEdit,
    offlineSyncing,
    lastSyncMessage,
    loadCompletedPosOrders,
  ]);

  const closePendingSyncOverlay = useCallback(() => {
    // Treat as acknowledged so Close cannot be undone by a stale syncProgress
    // "failed" flag re-opening the dialog on the next effect pass.
    pendingSyncAlertRef.current = true;
    setPendingSyncOpen(false);
  }, []);

  useEffect(() => {
    if (!standalone) return;
    if (failedSyncOrders.length <= 0) {
      // Mid-flush progress can briefly under-count; keep the popup stable until flush ends.
      if (offlineSyncing) return;
      if (pendingSync <= 0) {
        pendingSyncAlertRef.current = false;
        setPendingSyncOpen(false);
      }
      return;
    }
    // Auto-open only when sync failed — waiting orders sync silently in the background.
    if (!pendingSyncAlertRef.current) {
      pendingSyncAlertRef.current = true;
      setPendingSyncOpen(true);
    }
  }, [standalone, pendingSync, offlineSyncing, failedSyncOrders.length]);

  /** Keep the order # box ahead of tickets already saved in pending/failed outbox rows. */
  useEffect(() => {
    if (!standalone) return undefined;
    let cancelled = false;
    void (async () => {
      const nextTicket = await peekNextPosTicketNumber(null, floatSessionId).catch(() => null);
      if (cancelled || nextTicket == null) return;
      const live = cartRef.current;
      const hasLines = (live?.lines?.length ?? 0) > 0;
      const editingPrevious = Boolean(live?.held_order_num && live?.superseded_sale_id);
      const editingQueued = isActiveOfflineEditSession(live) && Boolean(live?.offline_client_sale_uuid);
      if (hasLines || editingPrevious || editingQueued) return;
      const showing = Number(resolvePosNextBrowseNumber(live) ?? editOrderNo ?? 0);
      if (showing > 0 && showing < Number(nextTicket)) {
        applyFreshWorkspacePlaceholder(live, Number(nextTicket));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [standalone, pendingSync, failedSyncOrders.length, editOrderNo, floatSessionId]);

  /** After a failed sync, drop stale offline/edit markers so a new ticket cannot reattach to the old order. */
  useEffect(() => {
    if (!standalone) return;
    if (syncProgress?.phase !== "complete" || !(Number(syncProgress?.failed ?? 0) > 0)) return;

    const current = cartRef.current;
    if (isActiveOfflineEditSession(current) && (current?.lines?.length ?? 0) > 0) {
      return;
    }
    if (current?.held_order_num && current?.superseded_sale_id && editedOrderHasLocalDraftChanges(current)) {
      return;
    }

    void clearLocalPosCart().catch(() => {});

    if (!current) return;
    if (isFreshWorkspacePlaceholder(current)) return;

    if (
      current.held_order_num ||
      current.offline_client_sale_uuid ||
      current.offline ||
      current.superseded_sale_id
    ) {
      const cleaned = stripOfflineSaleMarkers(
        stripPreviousOrderEditSession(stripPreviousOrderDraftMarkers(current)),
      );
      cartRef.current = cleaned;
      setCart(cleaned);
    }
  }, [standalone, syncProgress?.phase, syncProgress?.failed]);

  // When the offline catalog refreshes, apply new prices to open cart lines.
  // Pause while offline, and also while a continued offline / queued-edit cart is open
  // so reconnect does not rewrite prices mid-sale.
  useEffect(() => {
    if (!standalone || offlineMode) return undefined;
    let cancelled = false;

    async function syncCatalogPricesToCart() {
      const activeCart = cartRef.current;
      if (!activeCart?.lines?.length) return;
      if (
        activeCart.offline ||
        activeCart.offline_client_sale_uuid ||
        activeCart.held_order_num ||
        activeCart.superseded_sale_id
      ) {
        return;
      }
      try {
        const warm = await warmPosOfflineCatalog({ force: false });
        if (cancelled || warm.skipped) return;
        const codes = [
          ...new Set((activeCart.lines ?? []).map((l) => l.product_code).filter(Boolean)),
        ];
        const productMeta = {};
        for (const code of codes) {
          const row = await getPosOfflineProduct(code);
          if (row?.product_code) productMeta[code] = row;
        }
        if (cancelled || !Object.keys(productMeta).length) return;
        applyLiveCartCatalogPricesRef.current?.(productMeta);
      } catch {
        /* ignore background price refresh */
      }
    }

    void syncCatalogPricesToCart();
    const timer = window.setInterval(() => {
      void syncCatalogPricesToCart();
    }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [standalone, offlineMode, lastSyncMessage]);

  useEffect(() => {
    if (!classicLayout) return;
    const live = new Set((cart?.lines ?? []).map((line) => String(line.id)));
    setSelectedLineIds((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
    if (selectedLineId != null && !live.has(String(selectedLineId))) {
      setSelectedLineId(null);
    }
  }, [cart?.lines, classicLayout, selectedLineId, setSelectedLineIds]);

  useEffect(() => {
    const lineCount = cart?.lines?.length ?? 0;
    const prevCount = prevCartLineCountRef.current;
    prevCartLineCountRef.current = lineCount;
    if (lineCount <= prevCount) return;

    const scrollToLatest = () => {
      if (classicLayout) {
        const el = classicCartTableScrollRef.current;
        if (!el) return;
        // Scroll only inside the cart pane — never scrollIntoView (that jumps
        // outer layout and can pin the scan box at the top of the screen).
        el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
        return;
      }
      const el = cartLinesScrollRef.current;
      if (!el) return;
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    };

    requestAnimationFrame(() => {
      scrollToLatest();
      // Second frame: layout may grow after the new row paints.
      requestAnimationFrame(scrollToLatest);
    });
  }, [cart?.lines?.length, classicLayout]);

  const cartSummary = useMemo(() => {
    const rows = cart?.lines ?? [];
    const lineDiscounts = rows.reduce((sum, line) => sum + Number(line.discount_given ?? 0), 0);
    const net = enablePosCashRounding
      ? rows.reduce((sum, line) => sum + posCashLineAmount(line.amount ?? 0), 0)
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
  sellWholesaleRef.current = sellWholesale;

  const kraFiscalizeOnPosCheckout = useMemo(
    () =>
      shouldSubmitKraOnCheckout(
        capabilities?.module_settings,
        capabilities,
        cartSummary?.total ?? cartSummary?.amountDue,
      ),
    [capabilities, cartSummary?.total, cartSummary?.amountDue],
  );

  /** Previous-order edits finish with Alt+P (KRA and non-KRA). F10 is not required online. */
  const instantAutoEditSync = useMemo(() => {
    if (!standalone || !isCartEditSession) return false;
    return true;
  }, [standalone, isCartEditSession]);

  /** KRA-on previous-order edit: print without QR; fiscalize on background outbox sync. */
  const kraEditBackgroundFiscalize = useMemo(() => {
    if (!standalone || !isCartEditSession) return false;
    return shouldSubmitKraOnCheckout(
      capabilities?.module_settings,
      capabilities,
      cartSummary?.total ?? cartSummary?.amountDue,
    );
  }, [
    standalone,
    isCartEditSession,
    capabilities,
    cartSummary?.total,
    cartSummary?.amountDue,
  ]);

  const paymentPanelBillTotal = useMemo(() => cartSummary.amountDue, [cartSummary.amountDue]);

  const previousOrderEditAdjustment = useMemo(() => {
    if (!isCartEditSession) return null;
    // Untouched previous orders must use the normal payment panel (or Alt+P reprint),
    // never top-up/return breakdown.
    if (!editedOrderHasLocalDraftChanges(cart)) return null;
    const delta = computePreviousOrderEditSignedDelta(editSourceSale, cart, {
      cashRound: enablePosCashRounding,
    });
    if (!delta.type || !(Number(delta.amount) > 0)) return null;
    return {
      ...delta,
      orderNum: resolvePosBrowseNumber(cart) ?? cart?.held_order_num ?? null,
    };
  }, [isCartEditSession, editSourceSale, cart, enablePosCashRounding]);
  const previousOrderEditReadyToPrint = useMemo(() => {
    if (!instantAutoEditSync || !isCartEditSession) return false;
    if (offlineSyncing || editAutosaveBusy) return false;
    if (editedOrderHasLocalDraftChanges(cart)) return false;
    if (pendingSync > 0) return false;
    return (cart?.lines?.length ?? 0) > 0;
  }, [
    instantAutoEditSync,
    isCartEditSession,
    offlineSyncing,
    editAutosaveBusy,
    pendingSync,
    cart,
  ]);

  // Classic External POS: full theme palette on the cashier desk.
  // Leaving POS restores sidebar + button org theme (backoffice keeps default surfaces).
  useEffect(() => {
    if (!classicLayout) return undefined;
    const previous = getTheme();
    const forceLight = !isDarkClassicPosTheme(classicThemeTemplate);
    if (forceLight) applyTheme("light");
    if (isDarkClassicPosTheme(classicThemeTemplate)) applyTheme("dark");
    applyClassicPosDocumentTheme(classicThemeTemplate, classicThemeColors);
    return () => {
      applyTheme(previous);
      applyOrgErpSidebarTheme(classicThemeTemplate, classicThemeColors, { mode: previous });
    };
  }, [classicLayout, classicThemeTemplate, classicThemeColors]);

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
      const localCount = await countLocalHeldOrders();
      let serverCount = 0;
      try {
        const res = await apiRequest("/sales", {
          searchParams: { per_page: 1, "filter[status]": "held" },
          loading: false,
          reportIssues: false,
        });
        serverCount = Number(res.total ?? (res.data ?? []).length ?? 0);
      } catch {
        serverCount = 0;
      }
      setHeldOrdersCount(localCount + serverCount);
    } catch (e) {
      if (isAbortError(e)) return;
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
    if (!pending?.localHeldId && !pending?.saleId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (pending.localHeldId && isLocalHeldId(pending.localHeldId)) {
          const park = await getLocalHeldOrder(pending.localHeldId);
          if (cancelled) return;
          if (!park) {
            clearAutoHeldOrder();
            return;
          }
          setAutoHeldPrompt({
            localHeldId: park.id,
            holdLabel: park.hold_label ?? pending.holdLabel,
            saleId: null,
            orderNum: null,
          });
          return;
        }

        const sale = await apiRequest(`/sales/${pending.saleId}`);
        if (cancelled) return;
        if (String(sale?.status ?? "").toLowerCase() !== "held") {
          clearAutoHeldOrder();
          return;
        }
        setAutoHeldPrompt({
          saleId: pending.saleId,
          orderNum: sale.order_num ?? pending.orderNum,
          localHeldId: null,
          holdLabel: null,
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

  const beginPreviousOrderLoading = useCallback((
    message = "Loading previous order…",
    { detail = "Restoring lines and payment details…", soft = false } = {},
  ) => {
    previousOrderLoadingDepthRef.current += 1;
    setPreviousOrderLoadingMessage(message);
    setPreviousOrderLoadingDetail(detail);
    setPreviousOrderLoadingSoft(Boolean(soft));
    setPreviousOrderLoading(true);
    closeProductSearchDropdown();
    searchInputRef.current?.blur?.();
    defaultScanFocusDoneRef.current = false;
  }, []);

  const endPreviousOrderLoading = useCallback(() => {
    previousOrderLoadingDepthRef.current = Math.max(0, previousOrderLoadingDepthRef.current - 1);
    if (previousOrderLoadingDepthRef.current === 0) {
      setPreviousOrderLoading(false);
      setPreviousOrderLoadingSoft(false);
      defaultScanFocusDoneRef.current = false;
    }
  }, []);

  const posSearchSuspended =
    (previousOrderLoading && !previousOrderLoadingSoft) ||
    preparingNextOpen ||
    autoHeldBusy;

  const orderEditBusy = busy || previousOrderLoading;
  /** Blocks cart qty/swap only on hard waits — soft previous-order load still allows edits. */
  const cartInteractionBusy =
    busy || (previousOrderLoading && !previousOrderLoadingSoft);

  useEffect(() => {
    if (!posSearchSuspended) return undefined;
    closeProductSearchDropdown();
    searchInputRef.current?.blur?.();
    defaultScanFocusDoneRef.current = false;
    return undefined;
  }, [posSearchSuspended]);

  useEffect(() => {
    if (cartActionPending || posSearchSuspended || !focusSearchAfterAdd.current) return;
    focusSearchAfterAdd.current = false;
    const frame = window.requestAnimationFrame(() => {
      focusPosScanInput({ selectAll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cartActionPending, posSearchSuspended]);

  const posShellReady = !sessionLoading && uomById.size > 0;
  usePageNavigationReady(posShellReady);

  // Default keyboard focus: Scan code so cashiers can start searching/scanning immediately.
  useEffect(() => {
    if (!standalone) return undefined;
    if (!posShellReady || cart == null) return undefined;

    const blockingOverlay =
      floatDeclareDialogOpen ||
      paymentOpen ||
      saveOrderOpen ||
      heldOrdersOpen ||
      pendingSyncOpen ||
      leaveGuardOpen ||
      priceCheckerOpen ||
      zReportOpen ||
      xReportOpen ||
      closeSessionOpen ||
      Boolean(autoHeldPrompt) ||
      Boolean(editAdjustmentDialog) ||
      preparingNextOpen ||
      previousOrderLoading ||
      autoHeldBusy;

    if (blockingOverlay) {
      // Re-focus scan after till float / other overlays close.
      defaultScanFocusDoneRef.current = false;
      return undefined;
    }

    if (defaultScanFocusDoneRef.current) return undefined;

    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (
      active &&
      active !== document.body &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        active.isContentEditable)
    ) {
      if (active === searchInputRef.current) {
        defaultScanFocusDoneRef.current = true;
      }
      return undefined;
    }

    defaultScanFocusDoneRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      focusPosScanInput({ selectAll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    standalone,
    posShellReady,
    cart,
    floatDeclareDialogOpen,
    paymentOpen,
    saveOrderOpen,
    heldOrdersOpen,
    pendingSyncOpen,
    leaveGuardOpen,
    priceCheckerOpen,
    zReportOpen,
    xReportOpen,
    closeSessionOpen,
    autoHeldPrompt,
    editAdjustmentDialog,
    preparingNextOpen,
    previousOrderLoading,
    autoHeldBusy,
  ]);

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

  const retailPackageInflightRef = useRef(new Map());

  const ensureRetailPackages = useCallback(async (productCodes) => {
    const wanted = [
      ...new Set(
        (productCodes ?? [])
          .map((c) => String(c ?? "").trim())
          .filter((code) => code && retailByCodeRef.current[code] === undefined),
      ),
    ];
    if (!wanted.length) return;

    const waitExisting = [];
    const toFetch = [];
    for (const code of wanted) {
      const inflight = retailPackageInflightRef.current.get(code);
      if (inflight) waitExisting.push(inflight);
      else toFetch.push(code);
    }

    let fetchPromise = Promise.resolve();
    if (toFetch.length) {
      // Track in-flight without nulling the cache — null made search/entry flash
      // wholesale-only prices, then jump when markup arrived.
      fetchPromise = (async () => {
        try {
          const rows = await fetchRetailPackagesForProductCodes(toFetch);
          for (const code of toFetch) {
            if (retailByCodeRef.current[code] === undefined) {
              retailByCodeRef.current[code] = null;
            }
          }
          for (const row of rows ?? []) {
            if (row?.product_code) retailByCodeRef.current[row.product_code] = row;
          }
          setRetailByCode({ ...retailByCodeRef.current });
        } catch {
          for (const code of toFetch) {
            if (retailByCodeRef.current[code] === undefined) {
              retailByCodeRef.current[code] = null;
            }
          }
          setRetailByCode({ ...retailByCodeRef.current });
        } finally {
          for (const code of toFetch) {
            retailPackageInflightRef.current.delete(code);
          }
        }
      })();
      for (const code of toFetch) {
        retailPackageInflightRef.current.set(code, fetchPromise);
      }
    }

    await Promise.all([...waitExisting, fetchPromise]);
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

  const loadCashierCart = useCallback(async (options = {}) => {
    const skipEditDraftRestore = Boolean(options.skipEditDraftRestore);
    // When false, fetch/create only — caller decides whether to paint (hold/print clear).
    const applyState = options.applyState !== false;
    if (!user?.branch_id) return null;
    if (standalone && offlineMode) {
      const current = cartRef.current;
      // Mid-sale outage: keep the open workspace lines — do not rebuild/copy the cart.
      if (
        current &&
        (current.lines?.length > 0 || current.held_order_num)
      ) {
        if (current.offline) return current;
        const local = await continueOpenCartThroughOutage(current, {
          branch_id: user.branch_id,
          till_id: tillId,
          float_session_id: floatSessionId,
        });
        const presented = presentLocalOfflineCart(local);
        if (applyState) {
          cartRef.current = presented;
          setCart(presented);
        }
        return presented;
      }
      const local = await loadOrCreateLocalPosCart({
        branch_id: user.branch_id,
        till_id: tillId,
        float_session_id: floatSessionId,
      });
      const presented = presentLocalOfflineCart(local);
      if (applyState) {
        cartRef.current = presented;
        setCart(presented);
      }
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

    // Resume a previous-order edit draft from local cache (lines edited before refresh).
    if (!skipEditDraftRestore) {
      try {
        const draft = await loadPreviousOrderEditDraft();
        if (
          draft?.server_cart_id &&
          String(draft.server_cart_id) === String(full?.id) &&
          draft.held_order_num &&
          Array.isArray(draft.lines) &&
          draft.lines.length > 0
        ) {
          const resumed = {
            ...full,
            held_order_num: draft.held_order_num,
            superseded_sale_id: draft.superseded_sale_id ?? full.superseded_sale_id,
            order_discount: draft.order_discount ?? full.order_discount,
            ...(Array.isArray(draft.payment_adjustments) && draft.payment_adjustments.length
              ? { payment_adjustments: draft.payment_adjustments }
              : {}),
            lines: draft.lines,
            ...(draft._editDraftDirty ? { _editDraftDirty: true } : {}),
          };
          if (applyState) {
            cartRef.current = resumed;
            setCart(resumed);
            if (showRouteOrderUi && resumed?.route_id) {
              const route = routes.find((r) => r.id === resumed.route_id);
              appliedRouteMarkupRef.current = Number(route?.route_markup_price ?? 0);
            } else {
              appliedRouteMarkupRef.current = 0;
            }
          }
          return resumed;
        }
      } catch {
        // Ignore draft restore failures — fall through to server cart.
      }
    }

    if (applyState) {
      cartRef.current = full;
      setCart(full);
      if (showRouteOrderUi && full?.route_id) {
        const route = routes.find((r) => r.id === full.route_id);
        appliedRouteMarkupRef.current = Number(route?.route_markup_price ?? 0);
      } else {
        appliedRouteMarkupRef.current = 0;
      }
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

  const recoverMissingServerCart = useCallback(async () => {
    markServerCartConsumed(cartRef.current?.id);
    await clearLocalPosCart().catch(() => {});
    await clearPreviousOrderEditDraft().catch(() => {});
    return loadCashierCart({ skipEditDraftRestore: true });
  }, [loadCashierCart]);

  const refreshCart = useCallback(async (cartId) => {
    try {
      const updated = await apiRequest(`/sales/carts/${cartId}`, POS_CART_REQUEST);
      cartRef.current = updated;
      setCart(updated);
      return updated;
    } catch (e) {
      if (
        isMissingTemporaryCartError(e) &&
        cartRef.current?.held_order_num &&
        cartRef.current?.superseded_sale_id
      ) {
        const saleId = cartRef.current.superseded_sale_id;
        const restored = await apiRequest(`/sales/orders/${saleId}/restore-to-cart`, {
          method: "POST",
          body: { replace: true },
          ...POS_CART_REQUEST,
        });
        const presented =
          presentRestoredEditCart(restored, editSourceSale ?? { id: saleId }) ?? restored;
        cartRef.current = presented;
        setCart(presented);
        return presented;
      }
      if (isMissingTemporaryCartError(e)) {
        markServerCartConsumed(cartId);
        return recoverMissingServerCart();
      }
      throw e;
    }
  }, [editSourceSale, recoverMissingServerCart]);

  /** After reconnect, push a local offline cart onto a fresh server cart so lines survive. */
  const materializeOfflineCartOnServer = useCallback(
    async (localCart, options = {}) => {
      const applyToWorkspace = options.applyToWorkspace !== false;
      if (!user?.branch_id || !localCart?.lines?.length) {
        return loadCashierCart();
      }
      if (materializeInflightRef.current) {
        const inflight = await materializeInflightRef.current;
        if (applyToWorkspace && inflight && isServerPosCartId(inflight.id)) {
          const live = cartRef.current;
          if (!isServerPosCartId(live?.id)) {
            cartRef.current = inflight;
            setCart(inflight);
          }
        }
        return inflight;
      }

      const task = (async () => {
        const body = {
          channel: "pos",
          order_source: "pos",
          branch_id: localCart.branch_id ?? user.branch_id,
        };
        if (localCart.till_id ?? tillId) body.till_id = localCart.till_id ?? tillId;
        let serverCart = await apiRequest("/sales/carts", {
          method: "POST",
          body,
          ...POS_CART_REQUEST,
        });

        const linePayload = (localCart.lines ?? [])
          .filter((line) => line?.product_code && Number(line.quantity) > 0)
          .map((line) => {
            const qty = Number(line.quantity);
            const unitPrice = Number(line.unit_price ?? 0);
            return {
              product_code: line.product_code,
              quantity: qty,
              unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
              display_unit_price:
                line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
              uom: line.uom ?? undefined,
              on_wholesale_retail: Number(line.on_wholesale_retail ?? 0) ? 1 : 0,
              discount_given: Number(line.discount_given ?? 0) || 0,
              product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
              amount: line.amount != null ? Number(line.amount) : undefined,
            };
          });

        if (linePayload.length) {
          serverCart = await apiRequest(`/sales/carts/${serverCart.id}/lines`, {
            method: "PUT",
            body: {
              lines: linePayload,
              order_discount: Number(localCart.order_discount ?? 0) || 0,
            },
            ...POS_CART_REQUEST,
          });
        }

        const customerPatch = {
          ...(localCart.customer_num != null ? { customer_num: localCart.customer_num } : {}),
          ...(localCart.customer_name_override
            ? { customer_name_override: localCart.customer_name_override }
            : {}),
        };
        if (Object.keys(customerPatch).length > 0) {
          serverCart = { ...serverCart, ...customerPatch };
          void apiRequest(`/sales/carts/${serverCart.id}`, {
            method: "PATCH",
            body: customerPatch,
            ...POS_CART_REQUEST,
          }).catch(() => {
            /* customer optional */
          });
        }

        if (localCart.held_order_num && !localCart.offline_client_sale_uuid) {
          serverCart = {
            ...serverCart,
            held_order_num: localCart.held_order_num,
          };
        }

        void clearLocalPosCart().catch(() => {});

        const payFields = [
          "mpesa_payment_amount",
          "mpesa_transaction_code",
          "mpesa_phone",
          "voucher_payment_amount",
          "points_payment_amount",
          "amount_paid",
        ];
        const withLocalMeta = { ...(normalizeCartResponse(serverCart) ?? serverCart) };
        for (const key of payFields) {
          if (localCart?.[key] != null && localCart[key] !== "") {
            withLocalMeta[key] = localCart[key];
          }
        }
        if (localCart.restored_from_local_held_id) {
          withLocalMeta.restored_from_local_held_id = localCart.restored_from_local_held_id;
        }
        if (localCart.restored_from_hold_label) {
          withLocalMeta.restored_from_hold_label = localCart.restored_from_hold_label;
        }

        if (applyToWorkspace) {
          cartRef.current = withLocalMeta;
          setCart(withLocalMeta);
        }
        return withLocalMeta;
      })();

      materializeInflightRef.current = task;
      try {
        return await task;
      } finally {
        if (materializeInflightRef.current === task) {
          materializeInflightRef.current = null;
        }
      }
    },
    [user?.branch_id, tillId, loadCashierCart],
  );

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
    if (
      standalone &&
      current &&
      (await cartHasStaleFailedOutboxAttachment(current))
    ) {
      const cleaned = stripOfflineSaleMarkers(stripPreviousOrderEditSession(current));
      cartRef.current = cleaned;
      setCart(cleaned);
      return loadCashierCart({ skipEditDraftRestore: true });
    }
    if (standalone && offlineMode) {
      if (current?.offline && Array.isArray(current.lines)) return current;
      if (current && (current.lines?.length > 0 || current.held_order_num)) {
        const local = await continueOpenCartThroughOutage(current, {
          branch_id: user?.branch_id,
          till_id: tillId,
          float_session_id: floatSessionId,
        });
        const presented = presentLocalOfflineCart(local);
        cartRef.current = presented;
        setCart(presented);
        return presented;
      }
      return loadCashierCart();
    }
    // Back online: never call the API with the local "active" cart id.
    // Detached previous-order edits (`edit:123`) stay local until sync restores a TemporaryCart.
    if (
      standalone &&
      current?.held_order_num &&
      current?.superseded_sale_id &&
      !isServerPosCartId(current.id) &&
      !current.offline &&
      !current.offline_client_sale_uuid
    ) {
      return current;
    }
    if (standalone && (current?.offline || (current && !isServerPosCartId(current.id)))) {
      // Optimistic F8 / post-sale placeholder — always finish TemporaryCart bootstrap.
      // Do not treat pending-fresh + optimistic lines as an offline cart to materialize
      // (that wiped the row and re-priced markup in the background).
      if (current?.id === "pending-fresh") {
        const pendingOptimistic = (current.lines ?? []).filter((line) => line?._optimistic);
        let bootstrapped = null;
        if (freshCartBootstrapRef.current) {
          bootstrapped = await freshCartBootstrapRef.current.catch(() => null);
        }
        if (!bootstrapped || !isServerPosCartId(bootstrapped.id)) {
          bootstrapped = await loadCashierCart({ skipEditDraftRestore: true });
        }
        if (bootstrapped && pendingOptimistic.length) {
          // Keep the instantly painted rows while TemporaryCart finishes creating.
          const merged = {
            ...bootstrapped,
            lines: mergePreservedOptimisticLines(bootstrapped.lines, pendingOptimistic),
          };
          cartRef.current = merged;
          setCart(merged);
          return merged;
        }
        return bootstrapped;
      }
      // Open sale already continuing locally after an outage — keep it.
      // Rematerializing onto TemporaryCart re-POSTed lines and duplicated items.
      // Includes queued offline edits (offline_client_sale_uuid) after reconnect.
      if (
        usesLocalPosCartWorkspace(current) &&
        (current.lines?.length > 0 ||
          current.held_order_num ||
          current.offline_client_sale_uuid)
      ) {
        return current;
      }
      if (current?.lines?.length > 0 || current?.held_order_num) {
        try {
          return await materializeOfflineCartOnServer(current);
        } catch (e) {
          console.warn("Could not rehydrate offline cart after reconnect", e);
          notifyError(
            e instanceof Error
              ? e.message
              : "Could not restore cart online. Starting a fresh server cart.",
          );
        }
      }
      return loadCashierCart();
    }
    if (
      current?.id &&
      isServerPosCartId(current.id) &&
      isServerCartConsumed(current.id)
    ) {
      return recoverMissingServerCart();
    }
    // Trust the live TemporaryCart for line adds. A GET refresh here races
    // optimistic UI and briefly drops/replaces lines (cart flicker).
    if (current?.id && isServerPosCartId(current.id) && current.channel === channel) {
      return current;
    }
    return loadCashierCart();
  }, [
    channel,
    loadCashierCart,
    recoverMissingServerCart,
    standalone,
    offlineMode,
    user?.branch_id,
    tillId,
    floatSessionId,
    materializeOfflineCartOnServer,
  ]);

  function enqueueCartCommit(task) {
    const run = cartCommitChainRef.current.then(task, task);
    // Keep the chain alive after failures, and never leave void callers unhandled.
    cartCommitChainRef.current = run.catch(() => {});
    return cartCommitChainRef.current;
  }

  /** Flip dirty only after a real qty / swap / add / remove — never on F12-only reprice. */
  function markPreviousOrderDraftDirtyNow() {
    const current = cartRef.current;
    if (!isPreviousOrderEditSession(current) || current._editDraftDirty) return;
    const next = withEditDraftDirty(current);
    cartRef.current = next;
    setCart(next);
    if (current.superseded_sale_id) {
      scheduleEditedOrderAutosave();
    }
  }

  /**
   * @param {"qty" | "swap" | "add"} kind
   */
  function notePreviousOrderEditSuccess(kind) {
    if (!isPreviousOrderEditSession(cartRef.current)) return;
    markPreviousOrderDraftDirtyNow();
    const dirty = cartRef.current;
    if (dirty) {
      void savePreviousOrderEditDraft(dirty).catch(() => {});
    }
    if (kind === "qty") {
      notifySuccess("Quantity updated successfully");
      setStatusMessage("Quantity updated successfully");
    } else if (kind === "swap") {
      notifySuccess("Item changed successfully");
      setStatusMessage("Item changed successfully");
    } else if (kind === "add") {
      notifySuccess("Item added successfully");
      setStatusMessage("Item added successfully");
    }
  }

  function persistPreviousOrderLocalDraft(nextCart, { immediate = false } = {}) {
    if (
      !isPreviousOrderEditSession(nextCart) ||
      nextCart.offline ||
      nextCart.offline_client_sale_uuid
    ) {
      return;
    }
    void savePreviousOrderEditDraft(nextCart).catch(() => {});
    if (editedOrderHasLocalDraftChanges(nextCart)) {
      scheduleEditedOrderAutosave({ immediate });
    }
  }

  /**
   * After a previous-order edit syncs, keep editing on the local cart and point
   * superseded_sale_id at the new live sale. Do NOT call restore-to-cart here —
   * that re-cancels the order and makes it vanish from Sales & Orders / X/Z maths
   * for the whole remaining edit session.
   *
   * Empty-line cancel sync returns status=cancelled — leave the edit session.
   */
  async function refreshPreviousOrderEditCartAfterSync(sale, { workspaceGeneration } = {}) {
    if (!sale?.id || !standalone) return;
    if (skipEditAutosaveRef.current) return;
    const active = cartRef.current;
    if (!active?.held_order_num || !active?.superseded_sale_id) return;
    if (isFreshWorkspacePlaceholder(active)) return;
    // Finish/print already moved on — never repaint the edited ticket.
    if (
      workspaceGeneration != null &&
      freshWorkspaceGenerationRef.current !== workspaceGeneration
    ) {
      return;
    }

    // Match by org S# or Cash Sales # — edit checkout mints a new sale id under the same ticket.
    const sameTicket =
      Number(active.held_order_num) === Number(sale.order_num) ||
      (active.pos_order_num != null &&
        sale.pos_order_num != null &&
        Number(active.pos_order_num) === Number(sale.pos_order_num));
    if (!sameTicket) return;

    if (String(sale.status ?? "").toLowerCase() === "cancelled") {
      skipEditAutosaveRef.current = true;
      try {
        await clearPreviousOrderEditDraft().catch(() => {});
        markSaleForReprint(sale);
        setEditSourceSale(null);
        setCompletedSale(sale);
        // Drop edit markers first so F8/fresh bootstrap does not prompt to leave edit.
        const cleared = stripPreviousOrderEditSession({
          ...active,
          lines: [],
          payment_adjustments: undefined,
          _editDraftDirty: undefined,
        });
        cartRef.current = cleared;
        setCart(cleared);
        await startFreshWorkspace();
        setStatusMessage(
          `Order #${formatPosBrowseLabel({
            order_num: sale.order_num,
            pos_order_num: sale.pos_order_num,
          })} cancelled — return recorded.`,
        );
        if (enablePosOrderEdit) {
          void loadCompletedPosOrders();
        }
      } finally {
        skipEditAutosaveRef.current = false;
      }
      return;
    }

    const keepDirty = editedOrderHasLocalDraftChanges(active);
    const base = isServerPosCartId(active.id)
      ? detachPreviousOrderEditCartId(active)
      : active;
    const next = {
      ...base,
      // Detached edit cart — next sync restores from this live sale id once.
      server_sale_id: sale.id,
      superseded_sale_id: sale.id,
      held_order_num: Number(sale.order_num),
      // Baseline for the next top-up/return is the total just synced.
      original_order_total: Math.round(Number(sale.order_total ?? 0) * 100) / 100,
      ...(sale.pos_order_num != null
        ? { pos_order_num: Number(sale.pos_order_num) }
        : {}),
      ...(sale.pos_order_date ? { pos_order_date: sale.pos_order_date } : {}),
      ...(keepDirty ? { _editDraftDirty: true } : {}),
    };
    const normalized = keepDirty ? next : stripPreviousOrderDraftMarkers(next);
    cartRef.current = normalized;
    setCart(normalized);
    setEditSourceSale(sale);
    // Keep ← / Cash Sales # browse on the live revised sale (edit checkout mints a new id).
    // Re-apply after list refresh so a slow/empty API response cannot wipe the ticket.
    rememberCompletedPosOrder(sale);
    void savePreviousOrderEditDraft(normalized).catch(() => {});
    if (enablePosOrderEdit) {
      void loadCompletedPosOrders().finally(() => {
        rememberCompletedPosOrder(sale);
      });
    }
    if (keepDirty) {
      scheduleEditedOrderAutosave();
    }
  }

  async function waitForCartLineSavesToFinish() {
    await cartCommitChainRef.current.catch(() => {});
    if (!lineBusyRef.current) return;
    await new Promise((resolve) => {
      const startedAt = Date.now();
      const tick = () => {
        if (!lineBusyRef.current || Date.now() - startedAt > 5000) {
          resolve();
          return;
        }
        window.setTimeout(tick, 40);
      };
      tick();
    });
  }

  function closeProductSearchDropdown() {
    productSearchRef.current?.closeDropdown?.();
  }

  function focusClassicProductSearch({ forceSelectAll = false } = {}) {
    closeProductSearchDropdown();
    window.requestAnimationFrame(() => {
      focusPosScanInput({ selectAll: true, forceSelectAll });
    });
  }

  /** Focus Scan code only — used after Esc closes overlays without clearing the entry row. */
  function focusScanCode() {
    focusClassicProductSearch({ forceSelectAll: true });
  }

  /** After a line is added: return keyboard to Scan code for the next item. */
  function focusScanAfterItemAdded() {
    focusSearchAfterAdd.current = true;
    closeProductSearchDropdown();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!focusSearchAfterAdd.current) return;
        focusSearchAfterAdd.current = false;
        focusPosScanInput({ selectAll: true });
      });
    });
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
    closeProductSearchDropdown();
    focusScanAfterItemAdded();
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
    // Only remount when channel/branch changes — not when offlineMode flips
    // (that would wipe an open mid-sale cart). Outage continue keeps the sale in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [channel, user?.branch_id]);

  // Mid-sale outage: keep the open sale in place. Do not copy/rebuild the cart into
  // IndexedDB (that raced classic line adds and created duplicate rows). Quietly mark
  // the workspace as local-only; completed-order sync is what waits for reconnect.
  const wasOfflineModeRef = useRef(offlineMode);
  useEffect(() => {
    if (!standalone) return;
    const wasOffline = wasOfflineModeRef.current;
    wasOfflineModeRef.current = offlineMode;
    if (!offlineMode || wasOffline) return;

    const current = cartRef.current;
    if (!current || current.offline) return;
    if (!(current.lines?.length > 0 || current.held_order_num)) return;

    let cancelled = false;
    void (async () => {
      try {
        const local = await continueOpenCartThroughOutage(current, {
          branch_id: user?.branch_id,
          till_id: tillId,
          float_session_id: floatSessionId,
        });
        if (cancelled) return;
        // Only flip the working cart if a line-add has not already continued locally.
        if (cartRef.current?.offline) return;
        const presented = presentLocalOfflineCart(local);
        cartRef.current = presented;
        setCart(presented);
        const n = presented.lines?.length ?? 0;
        setStatusMessage(
          n
            ? `Connection dropped — sale continues (${n} item${n === 1 ? "" : "s"}). Sync when back online.`
            : "Connection dropped — sale continues offline. Sync when back online.",
        );
        void refreshOfflineCounts();
      } catch (e) {
        console.warn("Failed to continue cart through outage", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    standalone,
    offlineMode,
    user?.branch_id,
    tillId,
    floatSessionId,
    refreshOfflineCounts,
  ]);

  // Reconnect: do not rematerialize an open mid-sale cart onto TemporaryCart.
  // Checkout is already local-first (outbox → sync). Rematerializing mid-sale
  // re-POSTed lines and duplicated items when the link flapped.

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
      searchAbortRef.current?.abort();
      const abort = new AbortController();
      searchAbortRef.current = abort;

      const rankOpts = {
        limit: 40,
        getAvailableQty: (product) =>
          posSearchAvailableQty(product, sellFromShop, posSalesConfig, sellWholesale),
      };

      const seedRetailAndIndex = (list) => {
        const novelForIndex = [];
        for (const p of list) {
          const code = p?.product_code;
          if (!code) continue;
          if (retailByCodeRef.current[code] == null && p.retail_package) {
            retailByCodeRef.current[code] = p.retail_package;
          }
          if (!posSearchCatalogHasCode(code)) novelForIndex.push(p);
        }
        // Only index truly new codes — re-upserting known catalog rows used to
        // rebuild the full prefix index on every keystroke (felt heavy).
        if (novelForIndex.length) upsertPosSearchProducts(novelForIndex);
        setProductByCode((prev) => {
          let changed = false;
          let next = prev;
          for (const p of list) {
            const code = p?.product_code;
            if (!code || prev[code]) continue;
            if (!changed) {
              next = { ...prev };
              changed = true;
            }
            next[code] = p;
          }
          return changed ? next : prev;
        });
      };

      let committedNonEmpty = false;

      const commitSearchResults = (list) => {
        if (list.length > 0) committedNonEmpty = true;
        setSearchResults((prev) => (sameSearchResultList(prev, list) ? prev : list));
      };

      if (!trimmed) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      // Name searches need at least 2 chars; code/barcode can be 1+ (handled by looksLike).
      if (!looksLikeProductCodeQuery(trimmed) && trimmed.length < 2) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      // Keep the prior list visible while this query is in flight. Clearing early when the
      // query lengthens (yab → yabal) blanked the dropdown before index/API responded.
      /** Offline/index search is already ranked — only enrich + sellable filter. */
      const paintFromOffline = async () => {
        const local = await searchOffline(trimmed, rankOpts.limit);
        return sellableSearchResults(
          local.map((p) => enrichProductForLpo(p, uomMap, vatMap)),
        ).slice(0, rankOpts.limit);
      };

      const finishRetailPackages = (list) => {
        const missingPkg = list
          .filter((p) => p?.product_code && retailByCodeRef.current[p.product_code] === undefined)
          .map((p) => p.product_code);
        const cap = classicLayout ? 12 : 24;
        if (!missingPkg.length) return;
        void ensureRetailPackages(missingPkg.slice(0, cap)).then(() => {
          if (seq !== searchSeq.current || abort.signal.aborted) return;
          setRetailByCode({ ...retailByCodeRef.current });
        });
      };

      const applyRemoteMerge = (remoteRaw) => {
        if (seq !== searchSeq.current || abort.signal.aborted) return;
        const remote = sellableSearchResults(
          (remoteRaw ?? []).map((p) => enrichProductForLpo(p, uomMap, vatMap)),
        );
        const list = mergePosSearchResults(localPaint, remote, trimmed, rankOpts);
        seedRetailAndIndex(list);
        for (const p of list) {
          const code = p?.product_code;
          if (!code || retailByCodeRef.current[code] != null) continue;
          if (p.retail_package) retailByCodeRef.current[code] = p.retail_package;
        }
        commitSearchResults(list);
        finishRetailPackages(list);
      };

      let localPaint = [];
      try {
        if (standalone && offlineMode) {
          const list = await paintFromOffline();
          if (seq !== searchSeq.current) return;
          seedRetailAndIndex(list);
          commitSearchResults(list);
          setSearching(false);
          finishRetailPackages(list);
          return;
        }

        // Classic / standalone: paint warmed catalog immediately (already ranked in-memory).
        if (standalone) {
          try {
            localPaint = await paintFromOffline();
            if (seq === searchSeq.current && localPaint.length) {
              seedRetailAndIndex(localPaint);
              commitSearchResults(localPaint);
              setSearching(false);
              finishRetailPackages(localPaint);
            }
          } catch {
            /* fall through to API */
          }
        }

        // Any local hits: merge API in background so typing stays snappy.
        // (Previously required 8+ hits — short queries still waited on the network.)
        const localReady = localPaint.length > 0;
        const apiPromise = apiRequest("/products", {
          searchParams: {
            per_page: 40,
            q: trimmed,
            fields: "lean",
            status: "active",
            ...productBranchParams,
          },
          signal: abort.signal,
          loading: false,
          reportIssues: false,
        });

        if (localReady) {
          void apiPromise
            .then((res) => applyRemoteMerge(res.data))
            .catch((err) => {
              if (isAbortError(err) || abort.signal.aborted || seq !== searchSeq.current) return;
            });
          return;
        }

        const res = await apiPromise;
        if (seq !== searchSeq.current || abort.signal.aborted) return;
        applyRemoteMerge(res.data);
      } catch (err) {
        if (isAbortError(err) || abort.signal.aborted || seq !== searchSeq.current) return;
        // Network drop mid-search: keep local paint or fall back to offline catalog.
        if (standalone) {
          try {
            if (localPaint.length) {
              commitSearchResults(localPaint);
              setStatusMessage("Offline catalog — prices from last sync.");
              return;
            }
            const list = await paintFromOffline();
            if (seq !== searchSeq.current) return;
            seedRetailAndIndex(list);
            commitSearchResults(list);
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
        if (seq === searchSeq.current) {
          setSearching(false);
          if (!committedNonEmpty && trimmed) {
            setSearchResults([]);
          }
        }
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
      sellFromShop,
      posSalesConfig,
      sellWholesale,
    ],
  );

  useEffect(() => {
    // Product already selected and Scan shows its code — don't reopen search results.
    if (
      selectedProductCode &&
      String(searchQuery ?? "").trim() === String(selectedProductCode).trim()
    ) {
      setSearching(false);
      setSearchResults([]);
      return;
    }
    const trimmed = searchQuery.trim();
    const codeLike = looksLikeProductCodeQuery(searchQuery);
    // Debounce typing so we don't thrash index/API on every keystroke.
    // Local catalog paints first inside searchProducts; Enter / barcode still resolve immediately.
    const delay = !trimmed
      ? 0
      : codeLike
        ? 50
        : classicLayout
          ? 120
          : 200;
    const t = setTimeout(() => searchProducts(searchQuery), delay);
    return () => clearTimeout(t);
  }, [searchQuery, searchProducts, classicLayout, selectedProductCode]);

  function retailLineFlagFor(product, entryQty, retailLine = null, sellWholesaleOverride = null) {
    if (retailLine != null) return retailLine;
    const sellMode = sellWholesaleOverride ?? sellWholesaleRef.current;
    const retailPackage = getRetailPackage(product.product_code);
    const resolved = resolvePosQuantity(entryQty, product, retailPackage, sellMode);
    return posLineRetailStockFlag(posSalesConfig, sellMode, resolved.isRetail, product);
  }

  /** Keep sellWholesaleRef in sync so F12 → Enter/scan prices the new mode immediately. */
  function setSellWholesaleMode(nextOrUpdater) {
    const next =
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(sellWholesaleRef.current)
        : nextOrUpdater;
    sellWholesaleRef.current = Boolean(next);
    setSellWholesale(Boolean(next));
  }

  function applyComputedPrice(
    product,
    entryQty,
    discount,
    overridePrice = null,
    retailLine = null,
    sellWholesaleOverride = null,
  ) {
    // Prefer the F12 ref — state can lag one frame after toggle, which priced
    // the next Enter/scan at the previous wholesale/retail mode.
    const sellMode = sellWholesaleOverride ?? sellWholesaleRef.current;
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
        formulas: pricingFormulas,
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
        formulas: pricingFormulas,
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
      formulas: pricingFormulas,
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
    // Prefer cache first — previous-order qty edits must not wait on retail-package fetch.
    const cached = productByCodeRef.current[trimmed];
    if (cached) {
      if (!isSellableCatalogProduct(cached)) {
        delete productByCodeRef.current[trimmed];
        setProductByCode((prev) => {
          if (!prev[trimmed]) return prev;
          const next = { ...prev };
          delete next[trimmed];
          return next;
        });
      } else {
        await ensureRetailPackageForProduct(cached);
        return cached;
      }
    }
    const fromResults = searchResults.find(
      (p) =>
        p.product_code.toLowerCase() === trimmed.toLowerCase()
        && isSellableCatalogProduct(p),
    );
    if (fromResults) {
      productByCodeRef.current[fromResults.product_code] = fromResults;
      await ensureRetailPackageForProduct(fromResults);
      return fromResults;
    }
    try {
      const row = await apiRequest(`/products/${encodeURIComponent(trimmed)}`, {
        searchParams: { status: "active", ...productBranchParams },
      });
      const enriched = enrichProductForLpo(row, uomById, vatById);
      if (!isSellableCatalogProduct(enriched)) return null;
      productByCodeRef.current[enriched.product_code] = enriched;
      setProductByCode((prev) => ({ ...prev, [enriched.product_code]: enriched }));
      await ensureRetailPackageForProduct(enriched);
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
    const intendedEdit = editingId != null || editingRef != null;
    // Always re-resolve merge against the live cart. Classic Qty-Enter queues
    // commits with a stale mergeTarget from React state — during an outage that
    // spawned one optimistic row per key-repeat instead of one merged line.
    let resolvedMergeTarget = mergeTarget;
    if (!intendedEdit && posSalesConfig.combineIdenticalLines !== false) {
      resolvedMergeTarget =
        findMergeableCartLine(
          liveCart?.lines,
          product.product_code,
          computed,
          posSalesConfig,
          sellWholesale,
          null,
          product,
          { combineIdenticalLines: true },
        ) ?? mergeTarget;
    }
    let targetLineRef = cartLineRef(
      editingRef != null || editingId != null
        ? { update_code: editingRef, id: editingId }
        : resolvedMergeTarget,
    );
    if (!targetLineRef && resolvedMergeTarget) {
      targetLineRef = cartLineRef(resolvedMergeTarget);
    }

    if (intendedEdit && !targetLineRef) {
      setStatusMessage("Could not resolve the cart line to update.");
      return false;
    }

    if (resolvedMergeTarget && !editingId) {
      const newBaseQty = Number(resolvedMergeTarget.quantity) + incrementBaseQty;
      const mergedEntryQty = posEntryQtyFromBaseQty(
        newBaseQty,
        product,
        retailPackage,
        cartLineRetailStockFlag(resolvedMergeTarget),
      );
      // Keep the cashier-facing price already on the cart line (important for order edits / same-day append).
      // Never lock API amortized unit_price — retail paths would × conversion again (e.g. 3600×25).
      const lockedUnit =
        cartLineLockedUnitOverride(
          resolvedMergeTarget,
          product.uom,
          cartLineRetailStockFlag(resolvedMergeTarget),
          { cashRound: enablePosCashRounding },
        ) ?? override;
      finalComputed = applyComputedPrice(product, mergedEntryQty, discount, lockedUnit);
    }

    const stockAsRetail =
      lineRetailStockFlagOverride != null
        ? lineRetailStockFlagOverride
        : posLineRetailStockFlag(posSalesConfig, sellWholesale, computed.isRetail, product);
    const onWholesaleRetailFlag =
      lineRetailStockFlagOverride != null
        ? Boolean(lineRetailStockFlagOverride) && productSellsRetail(product)
        : posLineWholesaleRetailFlag(
            product,
            sellWholesale,
            computed.isRetail,
            posSalesConfig,
          );

    const stockBaseQty =
      resolvedMergeTarget && !editingId
        ? Number(resolvedMergeTarget.quantity) + incrementBaseQty
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
      excludeLineId: editingId ?? resolvedMergeTarget?.id ?? resolvedMergeTarget?.update_code,
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

    // Local workspace: true offline/slow, OR mid-sale cart kept local after reconnect.
    // Never POST to TemporaryCart with id "active" — that breaks scanning after the link returns.
    if (standalone && (offlineMode || usesLocalPosCartWorkspace(liveCart))) {
      // Continue the open sale in place — never rebuild/copy TemporaryCart lines here.
      const live = cartRef.current ?? liveCart;
      const activeCart =
        usesLocalPosCartWorkspace(live) && Array.isArray(live.lines)
          ? live
          : presentLocalOfflineCart(
              await continueOpenCartThroughOutage(live ?? (await ensureCart()), {
                branch_id: user?.branch_id,
                till_id: tillId,
                float_session_id: floatSessionId,
              }),
            );
      if (activeCart && !usesLocalPosCartWorkspace(cartRef.current)) {
        cartRef.current = activeCart;
        setCart(activeCart);
      }
      const working = cartRef.current ?? activeCart;
      // Re-resolve against the offline workspace — continueOpenCart may have just
      // collapsed duplicate rows from a link flap.
      const offlineMerge =
        !intendedEdit && posSalesConfig.combineIdenticalLines !== false
          ? findMergeableCartLine(
              working?.lines,
              product.product_code,
              computed,
              posSalesConfig,
              sellWholesale,
              null,
              product,
              { combineIdenticalLines: true },
            ) ?? resolvedMergeTarget
          : resolvedMergeTarget;
      if (offlineMerge && !editingId && offlineMerge !== resolvedMergeTarget) {
        const newBaseQty = Number(offlineMerge.quantity) + incrementBaseQty;
        const mergedEntryQty = posEntryQtyFromBaseQty(
          newBaseQty,
          product,
          retailPackage,
          cartLineRetailStockFlag(offlineMerge),
        );
        const lockedUnit =
          cartLineLockedUnitOverride(
            offlineMerge,
            product.uom,
            cartLineRetailStockFlag(offlineMerge),
            { cashRound: enablePosCashRounding },
          ) ?? override;
        finalComputed = applyComputedPrice(product, mergedEntryQty, discount, lockedUnit);
        resolvedMergeTarget = offlineMerge;
        targetLineRef = cartLineRef(offlineMerge);
      }
      const preserveOfflineIdentity = isActiveOfflineEditSession(working);
      const localLine = {
        client_line_id:
          editingId != null
            ? String(editingRef ?? editingId)
            : resolvedMergeTarget?.client_line_id ??
              resolvedMergeTarget?.update_code ??
              resolvedMergeTarget?.id ??
              newClientSaleUuid(),
        product_code: product.product_code,
        product_name: product.product_name ?? product.description ?? product.product_code,
        quantity: finalComputed.baseQty,
        unit_price: finalComputed.unitPricePerBase,
        display_unit_price: finalComputed.displayUnitPrice,
        // Persist priced amount (aggregate + RPS markup), not unit×qty alone.
        amount: finalComputed.lineAmount,
        uom: finalComputed.uomLabel || product.package_name,
        unit_id: product.unit_id ?? product.uom?.id ?? null,
        unit: snapshotUomForPrint(product.uom ?? product.unit),
        on_wholesale_retail: onWholesaleRetailFlag,
        discount_given:
          allowDiscounts || discountApprovalActive ? finalComputed.discountApplied : 0,
        vat_rate: Number(product.vat_rate ?? product.tax_rate ?? 0),
        product_vat: lineProductVat(product, finalComputed.lineAmount),
      };
      const nextLocal = await upsertLocalPosCartLine(
        {
          id: "active",
          offline: true,
          lines: (working?.lines ?? []).map((l) => ({
            ...l,
            client_line_id: l.client_line_id ?? l.update_code ?? l.id,
          })),
          branch_id: working?.branch_id ?? user?.branch_id,
          till_id: tillId ?? working?.till_id,
          float_session_id: floatSessionId ?? working?.float_session_id,
          order_discount: Number(working?.order_discount ?? 0) || 0,
          held_order_num: preserveOfflineIdentity ? working?.held_order_num ?? null : null,
          superseded_sale_id: preserveOfflineIdentity
            ? working?.superseded_sale_id ?? null
            : null,
          offline_client_sale_uuid: preserveOfflineIdentity
            ? working?.offline_client_sale_uuid ?? null
            : null,
          offline_edit_snapshot: preserveOfflineIdentity
            ? working?.offline_edit_snapshot ?? null
            : null,
          customer_num: working?.customer_num ?? null,
          customer_name_override: working?.customer_name_override ?? null,
          migrated_from_online_cart_id: working?.migrated_from_online_cart_id ?? null,
        },
        localLine,
      );
      const presented = presentLocalOfflineCart(nextLocal);
      cartRef.current = presented;
      setCart(presented);
      setStatusMessage(
        successMessage ??
          (offlineMode
            ? `Added offline (will sync when online).`
            : `Added.`),
      );
      if (clearEntry) clearClassicEntryFields();
      void refreshOfflineCounts();
      return true;
    }

    // Build the priced line body first, then paint the cart row immediately
    // (before TemporaryCart / POST) so markup is already on the row — no blank gap.
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
      // Always send the workspace line amount so hold/restore/checkout never
      // recompute from unit_price × quantity (tier / pack pricing).
      amount: finalComputed.lineAmount,
    };

    const discountAmount = Number(lineBody.discount_given ?? 0);
    const needsLineDiscountApproval =
      discountApprovalActive &&
      !canAutoApproveDiscount &&
      !finalComputed.autoProductDiscount &&
      discountAmount > 0;

    // Snapshot the pre-edit row before optimistic paint so failed PATCHes can restore it.
    const previousLineSnapshot =
      targetLineRef != null
        ? {
            ...(resolvedMergeTarget ??
              liveCart.lines?.find(
                (line) => String(cartLineRef(line)) === String(targetLineRef),
              ) ??
              {}),
          }
        : null;
    const serverUpdateNo = liveCart?.update_no;

    const paintOptimisticOn = (baseCart) => {
      if (!baseCart?.id || needsLineDiscountApproval) return null;
      const optimisticLine = buildOptimisticCartLine(product, lineBody, finalComputed);
      const optimisticCart = applyOptimisticCartMutation(baseCart, optimisticLine, {
        mergeTarget: resolvedMergeTarget,
        editingRef: targetLineRef,
        editingId,
      });
      cartRef.current = optimisticCart;
      setCart(optimisticCart);
      return { optimisticLine, optimisticCart };
    };

    let painted = paintOptimisticOn(liveCart);
    if (painted && unlockUiEarly && clearEntry) {
      clearClassicEntryFields();
    }

    const activeCart = await ensureCart();
    // ensureCart may replace pending-fresh — re-paint so the row never blanks.
    if (
      activeCart?.id &&
      (!painted ||
        String(cartRef.current?.id) !== String(activeCart.id) ||
        !(cartRef.current?.lines ?? []).some((line) => line?._optimistic))
    ) {
      painted = paintOptimisticOn(activeCart) ?? painted;
    }
    if (painted && unlockUiEarly && clearEntry) {
      clearClassicEntryFields();
    }

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
          cartState = applyCartMutationResponse(cartRef.current ?? activeCart, added);
          if (shouldApplyServerCartMutation(activeCart.id)) {
            cartRef.current = cartState;
            setCart(cartState);
          }
          const newLine = [...(added.lines ?? [])]
            .reverse()
            .find((line) => line.product_code === product.product_code);
          lineRef = newLine ? cartLineRef(newLine) : null;
        } else {
          const updated = await apiRequest(`/sales/carts/${activeCart.id}/lines/${lineRef}`, {
            method: "PATCH",
            body: {
              ...deferredLineBody,
              update_no: serverUpdateNo ?? activeCart.update_no,
            },
            ...POS_CART_REQUEST,
          });
          cartState = applyCartMutationResponse(cartRef.current ?? activeCart, updated, {
            targetLineRef: lineRef,
          });
          if (shouldApplyServerCartMutation(activeCart.id)) {
            cartRef.current = cartState;
            setCart(cartState);
          }
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

    const optimisticLine =
      painted?.optimisticLine ?? buildOptimisticCartLine(product, lineBody, finalComputed);
    const optimisticCart =
      painted?.optimisticCart ??
      applyOptimisticCartMutation(activeCart, optimisticLine, {
        mergeTarget: resolvedMergeTarget,
        editingRef: targetLineRef,
      });

    // Previous-order edit: keep line add/update local until Complete saves + prints.
    if (isPreviousOrderEditSession(activeCart)) {
      const draftLines = (optimisticCart.lines ?? []).map((line) => {
        const { _optimistic, ...rest } = line;
        return { ...rest, _draftEdit: true };
      });
      // Preserve real server line ids when updating/merging an existing restored line.
      if (targetLineRef || resolvedMergeTarget) {
        const base =
          resolvedMergeTarget ??
          activeCart.lines?.find((line) => String(cartLineRef(line)) === String(targetLineRef));
        if (base && !String(base.id ?? "").startsWith("pending-")) {
          const preserveRef = targetLineRef ?? cartLineRef(resolvedMergeTarget);
          let idx = draftLines.findIndex(
            (line) => String(cartLineRef(line)) === String(preserveRef),
          );
          if (idx < 0 && resolvedMergeTarget) {
            idx = draftLines.findIndex(
              (line) =>
                String(line.product_code) === String(product.product_code) &&
                Number(line.on_wholesale_retail ?? 0) === Number(lineBody.on_wholesale_retail ?? 0),
            );
          }
          if (idx >= 0) {
            draftLines[idx] = {
              ...draftLines[idx],
              id: base.id,
              update_code: base.update_code ?? base.id,
            };
          }
        }
      }
      const draftCart = {
        ...optimisticCart,
        lines: draftLines,
        // Keep dirty if already set by a real qty/swap/add — never mark dirty here
        // (F12-only reprice and no-op commits must not open payment C/M).
        ...(activeCart._editDraftDirty ? { _editDraftDirty: true } : {}),
      };
      cartRef.current = draftCart;
      setCart(draftCart);
      persistPreviousOrderLocalDraft(draftCart);
      setCartLineSaveFailed(false);
      if (successMessage) setStatusMessage(successMessage);
      if (clearEntry && !unlockUiEarly) {
        clearClassicEntryFields();
      }
      return true;
    }

    if (!painted) {
      cartRef.current = optimisticCart;
      setCart(optimisticCart);
    }

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
            update_no: serverUpdateNo ?? activeCart.update_no,
          },
          ...POS_CART_REQUEST,
        });
        const nextCart = applyCartMutationResponse(cartRef.current ?? activeCart, updated, {
          targetLineRef,
        });
        if (shouldApplyServerCartMutation(activeCart.id)) {
          cartRef.current = nextCart;
          setCart(nextCart);
        }
      } else {
        const updated = await apiRequest(`/sales/carts/${activeCart.id}/lines`, {
          method: "POST",
          body: lineBody,
          ...POS_CART_REQUEST,
        });
        const nextCart = applyCartMutationResponse(cartRef.current ?? activeCart, updated);
        if (shouldApplyServerCartMutation(activeCart.id)) {
          cartRef.current = nextCart;
          setCart(nextCart);
        }
      }
      setCartLineSaveFailed(false);
    } catch (error) {
      if (
        isMissingTemporaryCartError(error) &&
        standalone &&
        isServerPosCartId(activeCart.id) &&
        !activeCart.held_order_num
      ) {
        markServerCartConsumed(activeCart.id);
        try {
          const fresh = await recoverMissingServerCart();
          if (fresh?.id && !isServerCartConsumed(fresh.id)) {
            if (targetLineRef) {
              const updated = await apiRequest(`/sales/carts/${fresh.id}/lines/${targetLineRef}`, {
                method: "PATCH",
                body: {
                  ...lineBody,
                  update_no: fresh.update_no,
                },
                ...POS_CART_REQUEST,
              });
              const nextCart = applyCartMutationResponse(cartRef.current ?? fresh, updated, {
                targetLineRef,
              });
              if (shouldApplyServerCartMutation(fresh.id)) {
                cartRef.current = nextCart;
                setCart(nextCart);
              }
            } else {
              const updated = await apiRequest(`/sales/carts/${fresh.id}/lines`, {
                method: "POST",
                body: lineBody,
                ...POS_CART_REQUEST,
              });
              const nextCart = applyCartMutationResponse(cartRef.current ?? fresh, updated);
              if (shouldApplyServerCartMutation(fresh.id)) {
                cartRef.current = nextCart;
                setCart(nextCart);
              }
            }
            setCartLineSaveFailed(false);
            if (successMessage) setStatusMessage(successMessage);
            if (clearEntry && !unlockUiEarly) clearClassicEntryFields();
            return true;
          }
        } catch (retryErr) {
          setStatusMessage(
            retryErr instanceof ApiError ? retryErr.message : "Failed to add line after new cart",
          );
          throw retryErr;
        }
      }

      // Link dropped mid-add: keep the workspace line and continue the sale locally.
      // Do not revert + retry TemporaryCart (that spawned duplicate classic lines).
      if (standalone && isPosNetworkDropError(error)) {
        const live = cartRef.current ?? optimisticCart ?? activeCart;
        const committed = {
          ...live,
          lines: (live?.lines ?? []).map((line) => {
            const { _optimistic: _drop, ...rest } = line;
            return rest;
          }),
        };
        const local = await continueOpenCartThroughOutage(committed, {
          branch_id: user?.branch_id,
          till_id: tillId,
          float_session_id: floatSessionId,
        });
        const presented = presentLocalOfflineCart(local);
        cartRef.current = presented;
        setCart(presented);
        setCartLineSaveFailed(false);
        setStatusMessage(
          successMessage ??
            "Connection dropped — line kept. Sale continues; sync when back online.",
        );
        if (clearEntry && !unlockUiEarly) clearClassicEntryFields();
        else if (clearEntry && unlockUiEarly) focusScanAfterItemAdded();
        void refreshOfflineCounts();
        return true;
      }

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
    } else if (clearEntry && unlockUiEarly) {
      // Entry was cleared early — reinforce Scan focus after optimistic cart paint.
      focusScanAfterItemAdded();
    }

    return true;
  }

  async function quickAddOrIncrementProduct(product) {
    if (busy || !product) return;
    if (!assertRouteReadyForAdd()) return;

    setProductByCode((prev) =>
      prev[product.product_code] ? prev : { ...prev, [product.product_code]: product },
    );
    productByCodeRef.current[product.product_code] =
      productByCodeRef.current[product.product_code] ?? product;

    // Retail markup comes from retail_package_settings for this item — load before pricing.
    await ensureRetailPackageForProduct(product);
    const computed = applyComputedPrice(product, "1", 0);
    if (computed.baseQty <= 0) return;

    // Always serialize adds — rapid scan/click must merge qty, never duplicate lines.
    void enqueueCartCommit(async () => {
      const mergeTarget = findMergeableCartLine(
        cartRef.current?.lines,
        product.product_code,
        computed,
        posSalesConfig,
        sellWholesaleRef.current,
        null,
        product,
        { combineIdenticalLines: posSalesConfig.combineIdenticalLines !== false },
      );
      try {
        const ok = await commitCartLine({
          product,
          computed,
          incrementBaseQty: computed.baseQty,
          mergeTarget,
          successMessage: null,
          unlockUiEarly: true,
        });
        if (ok) {
          notePreviousOrderEditSuccess(mergeTarget ? "qty" : "add");
        }
      } catch (e) {
        setStatusMessage(e instanceof ApiError ? e.message : "Failed to add line");
      }
    });
  }

  async function handleBarcodeEnter(code) {
    if (!enableBarcodeScanner) return false;
    const trimmed = String(code ?? "").trim();
    if (!trimmed) return false;

    let product = null;
    // Prefer the warmed offline catalog whenever the open sale is local — including
    // after reconnect mid-sale — so scans do not depend on live product GETs.
    if (
      classicLayout ||
      offlineMode ||
      usesLocalPosCartWorkspace(cartRef.current)
    ) {
      try {
        const local = await getPosOfflineProduct(trimmed);
        if (local && isSellableCatalogProduct(local)) {
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
    if (replacingLineIdRef.current) {
      void pickProduct(product);
      return true;
    }
    await quickAddOrIncrementProduct(product);
    return true;
  }

  async function completeSwapFromDraft(entryQtyRaw) {
    const draft = swapDraftRef.current;
    if (!draft?.line || !draft?.product) return false;
    if (swapCommitInFlightRef.current) return false;
    const entryQty = parseDecimalInput(entryQtyRaw ?? draft.quantity);
    if (!(entryQty > 0)) {
      setStatusMessage("Enter a quantity greater than zero to complete the swap.");
      return false;
    }

    swapCommitInFlightRef.current = true;

    const finishSwap = async () => {
      try {
        const ok = await replaceCartLineWithProduct(
          draft.line,
          draft.product,
          String(entryQtyRaw ?? entryQty),
          0,
          null,
        );
        if (ok) {
          swapDraftRef.current = null;
          setSwapDraft(null);
          setReplacingLineId(null);
          replacingLineIdRef.current = null;
          setSelectedProduct(null);
          setSelectedProductCode(null);
          setSearchQuery("");
          setLineForm(EMPTY_LINE);
          // replaceCartLineWithProduct already notifies / sets status.
          // After swap qty Enter, focus Scan code for the next new line.
          focusScanAfterItemAdded();
        }
        return ok;
      } catch (e) {
        setStatusMessage(e instanceof ApiError ? e.message : "Failed to swap line");
        return false;
      } finally {
        swapCommitInFlightRef.current = false;
      }
    };

    if (usesPosLocalDraftLineEdits(cartRef.current) || classicLayout) {
      void enqueueCartCommit(finishSwap);
      return true;
    }

    setLineBusy(true);
    try {
      return await finishSwap();
    } finally {
      setLineBusy(false);
    }
  }

  function handleSwapDraftQtyChange(line, value) {
    const draft = swapDraftRef.current;
    if (!draft) return;
    const matches =
      sameLineId(draft.lineId, line.id) ||
      sameLineId(draft.line?.id, line.id) ||
      sameLineId(draft.line?.update_code, line.update_code) ||
      sameLineId(draft.line?.update_code, line.id);
    if (!matches) return;
    const next = { ...draft, quantity: value };
    swapDraftRef.current = next;
    setSwapDraft(next);
  }

  async function pickProduct(product) {
    if (!product) return;
    setProductByCode((prev) =>
      prev[product.product_code] ? prev : { ...prev, [product.product_code]: product },
    );
    productByCodeRef.current[product.product_code] =
      productByCodeRef.current[product.product_code] ?? product;

    await ensureRetailPackageForProduct(product);
    const retailPackage = getRetailPackage(product.product_code);
    const activeReplacingId = replacingLineIdRef.current;
    const activeCart = cartRef.current ?? cart;
    const replaceLine = activeReplacingId
      ? findCartLineForEdit(activeCart?.lines, {
          id: activeReplacingId,
          update_code: activeReplacingId,
        })
      : null;

    if (activeReplacingId) {
      if (!replaceLine) {
        setStatusMessage("Could not find the line to swap — press Esc and try again.");
        return;
      }
      if (String(replaceLine.product_code) === String(product.product_code)) {
        setStatusMessage("Choose a different product to swap onto this line.");
        return;
      }
      // Keep the cashier-facing qty on the line being replaced (e.g. "2"), applied
      // as the new product's entry qty. Do NOT re-base old stock through the new UOM
      // (1 base unit ÷ conversion 50 became 0.02 bags).
      const oldProduct =
        productByCodeRef.current[replaceLine.product_code] ??
        productByCode[replaceLine.product_code] ??
        null;
      const quantity = posEntryQtyFromCartLine(
        replaceLine,
        oldProduct,
        getRetailPackage(replaceLine.product_code),
      );
      const nextSwapDraft = {
        lineId: replaceLine.id,
        line: replaceLine,
        product,
        quantity: String(quantity),
      };
      swapDraftRef.current = nextSwapDraft;
      setSwapDraft(nextSwapDraft);
      setReplacingLineId(replaceLine.id);
      replacingLineIdRef.current = replaceLine.id;
      setSearchQuery(product.product_code ?? "");
      setSearchResults([]);
      setStatusMessage(
        `Swapping to ${posProductDisplayName(product)} — adjust qty if needed, then press Enter.`,
      );
      window.requestAnimationFrame(() => {
        swapLineQtyRef.current?.focus({ preventScroll: true });
        swapLineQtyRef.current?.select?.();
      });
      return;
    }

    setSelectedProductCode(product.product_code);
    setSelectedProduct(product);
    setUnitPriceTouched(false);
    const quantity = defaultPosEntryQty(product, sellWholesale, retailPackage);
    const computed = applyComputedPrice(
      product,
      quantity,
      0,
      null,
      null,
      null,
    );
    setLineForm({
      product_code: product.product_code,
      description: product.product_name ?? "",
      package: product.uom
        ? uomCompactPackageLabel(product.uom)
        : computed.packagingLabel,
      quantity,
      discount: String(computed.discountAmount ?? 0),
      unit_price: String(computed.displayUnitPrice),
    });

    // After select, Scan shows the product code (not the typed search fragment)
    // while focus moves to qty.
    setSearchQuery(product.product_code ?? "");
    searchAbortRef.current?.abort();
    searchSeq.current += 1;
    setSearching(false);
    setSearchResults([]);
  }

  function beginReplaceCartLine(lineId) {
    const line = findCartLineForEdit(cartRef.current?.lines ?? cart?.lines, lineId);
    if (!line) return;
    // Classic / local drafts enqueue without freezing the grid — allow swap while a
    // parallel line save finishes. Hard checkout busy still blocks.
    const localDraftEdit = usesPosLocalDraftLineEdits(cartRef.current);
    if (lineBusy && !classicLayout && !localDraftEdit) return;
    if (busy && !previousOrderLoadingSoft) return;
    swapCommitInFlightRef.current = false;
    swapDraftRef.current = null;
    setSwapDraft(null);
    replacingLineIdRef.current = line.id;
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
      `Swap ${posProductDisplayName(line)}: search or scan the replacement product (Enter selects). Esc cancels.`,
    );
    // Move keyboard to Scan so the replacement can be typed immediately.
    window.requestAnimationFrame(() => {
      focusPosScanInput({ selectAll: true });
    });
  }

  function cancelReplaceCartLine() {
    if (!replacingLineId && !swapDraftRef.current) return;
    setReplacingLineId(null);
    replacingLineIdRef.current = null;
    swapDraftRef.current = null;
    setSwapDraft(null);
    swapCommitInFlightRef.current = false;
    setSelectedProduct(null);
    setSelectedProductCode(null);
    setSearchQuery("");
    setSearchResults([]);
    setLineForm(EMPTY_LINE);
    setStatusMessage("Swap cancelled.");
    focusProductSearch();
  }

  async function replaceCartLineWithProduct(line, product, entryQty, discount = 0, override = null) {
    const activeCart = cartRef.current ?? cart;
    if (!line || !product || !activeCart?.id) return false;

    // Prefer the live cart row — previous-order restore can remint TemporaryCart ids
    // after the swap draft was opened against the optimistic sale-item lines.
    const liveLine =
      findCartLineForEdit(activeCart.lines, line, {
        preferProductCode: line.product_code,
      }) ??
      findCartLineForEdit(activeCart.lines, {
        id: replacingLineIdRef.current ?? swapDraftRef.current?.lineId,
        product_code: line.product_code,
        on_wholesale_retail: line.on_wholesale_retail,
      }) ??
      line;

    // Price the replacement with the current F12 session — do not inherit the old
    // line's retail flag (that forced "piece" UOM on bag products).
    const computed = applyComputedPrice(product, entryQty, discount, override);
    if (computed.baseQty <= 0) {
      setStatusMessage("Enter a valid quantity.");
      return false;
    }
    const isRetailLine = Boolean(computed.isRetail);

    // Classic + previous-order / offline: swap in place on the cart first so the
    // UI never depends on TemporaryCart PATCH timing (that left the old SKU).
    if (usesPosLocalDraftLineEdits(activeCart) || classicLayout) {
      const stockAsRetail = Boolean(isRetailLine);
      const stockCheck = posStockAvailability({
        product,
        baseQty: computed.baseQty,
        cartLines: activeCart.lines,
        sellFromShop,
        posSalesConfig,
        allowNegativeStock,
        stockAsRetail,
        productByCode: productByCodeRef.current,
        excludeLineId: liveLine.id ?? liveLine.update_code,
      });
      if (!stockCheck.ok) {
        setStatusMessage(
          posStockInsufficientMessage(stockCheck, {
            product,
            sellWholesale,
            retailPackage: getRetailPackage(product.product_code),
            posSalesConfig,
          }),
        );
        return false;
      }

      const onWholesaleRetailFlag = posLineWholesaleRetailFlag(
        product,
        sellWholesale,
        computed.isRetail,
        posSalesConfig,
      );
      const preservedId = liveLine.id;
      const preservedRef =
        liveLine.update_code ?? liveLine.client_line_id ?? liveLine.id;
      const nextLine = {
        ...liveLine,
        id: preservedId,
        update_code: preservedRef,
        client_line_id: liveLine.client_line_id ?? preservedRef,
        product_code: product.product_code,
        product_name:
          product.product_name ?? product.description ?? product.product_code,
        quantity: computed.baseQty,
        unit_price: computed.unitPricePerBase,
        display_unit_price: computed.displayUnitPrice,
        amount: computed.lineAmount,
        uom: computed.uomLabel || product.package_name,
        unit_id: product.unit_id ?? product.uom?.id ?? null,
        unit: snapshotUomForPrint(product.uom ?? product.unit),
        on_wholesale_retail: onWholesaleRetailFlag ? 1 : 0,
        discount_given:
          allowDiscounts || discountApprovalActive ? computed.discountApplied : 0,
        vat_rate: Number(product.vat_rate ?? product.tax_rate ?? 0),
        product_vat: lineProductVat(product, computed.lineAmount),
        _draftEdit: true,
      };

      const lines = [...(activeCart.lines ?? [])];
      let idx = lines.findIndex(
        (row) =>
          sameLineId(row.id, preservedId) ||
          sameLineId(row.update_code, preservedRef) ||
          sameLineId(row.client_line_id, preservedRef),
      );
      if (idx < 0) {
        idx = lines.findIndex(
          (row) =>
            String(row.product_code) === String(liveLine.product_code) &&
            Number(row.on_wholesale_retail ?? 0) ===
              Number(liveLine.on_wholesale_retail ?? 0),
        );
      }
      if (idx < 0) {
        setStatusMessage("Could not resolve the line to replace.");
        return false;
      }
      lines[idx] = nextLine;
      const nextCart = isPreviousOrderEditSession(activeCart)
        ? withEditDraftDirty({ ...activeCart, lines })
        : { ...activeCart, lines };
      cartRef.current = nextCart;
      setCart(nextCart);

      if (isPreviousOrderEditSession(nextCart)) {
        persistPreviousOrderLocalDraft(nextCart, { immediate: true });
        notePreviousOrderEditSuccess("swap");
        clearClassicEntryFields();
        return true;
      }

      // Offline / local workspace — cart is already the source of truth.
      if (usesLocalPosCartWorkspace(nextCart) || !isServerPosCartId(nextCart.id)) {
        if (usesLocalPosCartWorkspace(nextCart)) {
          try {
            const saved = await saveLocalPosCart({
              ...nextCart,
              lines: (nextCart.lines ?? []).map((l) => ({
                ...l,
                client_line_id: l.client_line_id ?? l.update_code ?? l.id,
              })),
            });
            const presented = presentLocalOfflineCart(saved);
            cartRef.current = presented;
            setCart(presented);
          } catch {
            /* keep in-memory swap */
          }
        }
        notifySuccess("Item changed successfully");
        setStatusMessage("Item changed successfully");
        clearClassicEntryFields();
        return true;
      }

      // Classic live TemporaryCart: UI already swapped — sync with PATCH, keep local
      // SKU even if the network round-trip fails (cashier must not see the old item).
      const lineRef = cartLineRef(nextLine);
      try {
        const ok = await commitCartLine({
          product,
          computed,
          incrementBaseQty: computed.baseQty,
          editingId: nextLine.id,
          editingRef: lineRef,
          discount,
          override,
          clearEntry: true,
          successMessage: null,
          lineRetailStockFlagOverride: isRetailLine,
        });
        // Guard against a silent server no-op that reverts the SKU.
        const after = (cartRef.current?.lines ?? []).find(
          (row) =>
            sameLineId(row.id, nextLine.id) ||
            String(cartLineRef(row)) === String(lineRef),
        );
        if (
          after &&
          String(after.product_code) !== String(product.product_code)
        ) {
          // Re-apply local swap — TemporaryCart response lost the new SKU.
          const live = cartRef.current ?? nextCart;
          const repairedLines = [...(live.lines ?? [])];
          const repairIdx = repairedLines.findIndex(
            (row) =>
              sameLineId(row.id, nextLine.id) ||
              String(cartLineRef(row)) === String(lineRef),
          );
          if (repairIdx >= 0) {
            repairedLines[repairIdx] = {
              ...repairedLines[repairIdx],
              ...nextLine,
              id: repairedLines[repairIdx].id,
              update_code:
                repairedLines[repairIdx].update_code ?? nextLine.update_code,
            };
            const repaired = { ...live, lines: repairedLines };
            cartRef.current = repaired;
            setCart(repaired);
          }
          setStatusMessage(
            "Item changed on screen — server sync lagged. Press Enter on qty again if needed.",
          );
        } else if (ok) {
          notifySuccess("Item changed successfully");
          setStatusMessage("Item changed successfully");
        }
      } catch (e) {
        setStatusMessage(
          e instanceof ApiError
            ? e.message
            : "Item changed on screen — could not sync. Try again if checkout fails.",
        );
      }
      clearClassicEntryFields();
      return true;
    }

    const lineRef = cartLineRef(liveLine);
    if (!lineRef) {
      setStatusMessage("Could not resolve the line to replace.");
      return false;
    }

    // Non-classic modern layout: PATCH / local edit in place.
    const ok = await commitCartLine({
      product,
      computed,
      incrementBaseQty: computed.baseQty,
      editingId: liveLine.id,
      editingRef: lineRef,
      discount,
      override,
      clearEntry: true,
      successMessage: null,
      lineRetailStockFlagOverride: isRetailLine,
    });
    if (!ok) return false;

    // Guard: silent no-op mutations left the old SKU on previous-order drafts.
    const after = (cartRef.current?.lines ?? []).find(
      (row) =>
        sameLineId(row.id, liveLine.id) ||
        String(cartLineRef(row)) === String(lineRef),
    );
    if (after && String(after.product_code) !== String(product.product_code)) {
      setStatusMessage("Could not swap this line — try again.");
      return false;
    }
    if (isPreviousOrderEditSession(cartRef.current ?? activeCart)) {
      notePreviousOrderEditSuccess("swap");
    } else {
      notifySuccess("Item changed successfully");
      setStatusMessage("Item changed successfully");
    }
    return true;
  }

  useEffect(() => {
    replacingLineIdRef.current = replacingLineId;
  }, [replacingLineId]);

  useEffect(() => {
    swapDraftRef.current = swapDraft;
  }, [swapDraft]);

  useEffect(() => {
    if (!classicLayout || !replacingLineId || swapDraft) return;
    const frame = window.requestAnimationFrame(() => {
      focusPosScanInput({ selectAll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [classicLayout, replacingLineId, swapDraft]);

  useEffect(() => {
    if (editingLineId) return;
    setUnitPriceTouched(false);
  }, [sellWholesale, routeMarkupPerUnit, editingLineId]);

  useEffect(() => {
    if (!selectedProduct?.product_code || replacingLineId) return;
    const frame = window.requestAnimationFrame(() => {
      qtyInputRef.current?.focus({ preventScroll: true });
      qtyInputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedProduct?.product_code, replacingLineId]);

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
      const nextPackage = selectedProduct.uom
        ? uomCompactPackageLabel(selectedProduct.uom)
        : computed.packagingLabel;
      const nextPrice = String(computed.displayUnitPrice);
      const nextDiscount =
        allowDiscounts && computed.autoProductDiscount
          ? String(computed.discountAmount ?? 0)
          : allowEditLineDiscount || discountApprovalActive
            ? prev.discount
            : "0";
      if (
        prev.unit_price === nextPrice &&
        prev.package === nextPackage &&
        prev.discount === nextDiscount
      ) {
        return prev;
      }
      return {
        ...prev,
        package: nextPackage,
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
      formulas: pricingFormulas,
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

  const entryRowComputed = useMemo(() => {
    if (!selectedProduct || !lineForm.quantity) return null;
    return applyComputedPrice(
      selectedProduct,
      lineForm.quantity,
      parseDecimalInput(lineForm.discount),
    );
  }, [
    selectedProduct,
    lineForm.quantity,
    lineForm.discount,
    sellWholesale,
    retailByCode,
    routeMarkupPerUnit,
  ]);

  const swapLinePreview = useMemo(() => {
    if (!swapDraft?.product || swapDraft.quantity == null || swapDraft.quantity === "") {
      return null;
    }
    const retailPackage = getRetailPackage(swapDraft.product.product_code);
    // New product follows the current F12 session — not the old line's retail flag.
    const computed = applyComputedPrice(swapDraft.product, swapDraft.quantity, 0);
    const amount = enablePosCashRounding
      ? roundLightStoresAmount(computed.lineAmount)
      : computed.lineAmount;
    const qtyUnit =
      posCartLineEntryUnitLabel(
        {
          on_wholesale_retail: computed.isRetail ? 1 : 0,
        },
        swapDraft.product,
        retailPackage,
      ) ||
      posQuantityFieldMeta(swapDraft.product, sellWholesale, retailPackage, swapDraft.quantity)
        .unit ||
      "";
    return {
      lineId: swapDraft.lineId,
      productCode: swapDraft.product.product_code,
      productName:
        swapDraft.product.product_name ??
        swapDraft.product.description ??
        swapDraft.product.product_code,
      package: swapDraft.product.uom
        ? uomCompactPackageLabel(swapDraft.product.uom)
        : computed.packagingLabel,
      qtyUnit,
      unitPrice: computed.displayUnitPrice,
      vat: lineProductVat(swapDraft.product, computed.lineAmount),
      amount,
    };
  }, [swapDraft, sellWholesale, retailByCode, routeMarkupPerUnit, enablePosCashRounding]);

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
      formulas: pricingFormulas,
    });
    const mergeTarget = editingLineId
      ? null
      : findMergeableCartLine(
          cart?.lines,
          product.product_code,
          computed,
          posSalesConfig,
          sellWholesale,
          null,
          product,
          { combineIdenticalLines: posSalesConfig.combineIdenticalLines !== false },
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

  // Previous-order drafts never wait on line API saves — only live carts do.
  const checkoutBlocked =
    !isCartEditSession && (lineBusy || cartHasOptimisticLines(cart));

  const addLineBlocked =
    !selectedProduct ||
    (lineStockCheck.ok === false && !allowNegativeStock);

  async function syncCartRoute(routeId) {
    if (!cart?.id) return null;
    if (usesLocalPosCartWorkspace(cart) || !isServerPosCartId(cart.id)) {
      const nextCart = { ...cart, route_id: routeId ?? null };
      let saved = nextCart;
      if (usesLocalPosCartWorkspace(cart)) {
        saved = presentLocalOfflineCart(await saveLocalPosCart(nextCart));
      }
      cartRef.current = saved;
      setCart(saved);
      return saved;
    }
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
      // Local workspace / previous-order draft — never PATCH TemporaryCart "active".
      if (
        usesLocalPosCartWorkspace(cart) ||
        (cart.held_order_num &&
          cart.superseded_sale_id &&
          !cart.discount_resubmit)
      ) {
        const nextCart = withEditDraftDirty({ ...cart, order_discount: next });
        let saved = nextCart;
        if (usesLocalPosCartWorkspace(cart)) {
          saved = presentLocalOfflineCart(
            await saveLocalPosCart({
              ...nextCart,
              lines: (nextCart.lines ?? []).map((l) => ({
                ...l,
                client_line_id: l.client_line_id ?? l.id,
              })),
            }),
          );
        } else {
          persistPreviousOrderLocalDraft(nextCart);
        }
        cartRef.current = saved;
        setCart(saved);
        setOrderDiscountDraft(next > 0 ? String(next) : "");
        return;
      }

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
        formulas: pricingFormulas,
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

    // Prefer qty captured from the input on Enter (last keystroke may not be in state yet).
    const entryQtyRaw =
      lineFormQtyCommitRef.current != null
        ? lineFormQtyCommitRef.current
        : lineForm.quantity;
    lineFormQtyCommitRef.current = null;
    if (
      entryQtyRaw != null &&
      String(entryQtyRaw) !== String(lineForm.quantity ?? "")
    ) {
      setLineForm((p) => ({ ...p, quantity: String(entryQtyRaw) }));
    }

    await ensureRetailPackageForProduct(selectedProduct);

    const discount = parseDecimalInput(lineForm.discount);
    const retailPackage = getRetailPackage(selectedProduct.product_code);
    // Retail totals come from package settings: aggregate wholesale + markup.
    // Do not treat the Price field as unit×qty override (that drops/doubles the add-on).
    const retailPricing = usesPosRetailPricing(
      sellWholesale,
      selectedProduct,
      retailPackage,
    );
    const override =
      unitPriceTouched && !retailPricing
        ? parseDecimalInput(lineForm.unit_price)
        : null;

    const replaceLine = replacingLineIdRef.current
      ? findCartLineForEdit(cartRef.current?.lines ?? cart?.lines, {
          id: replacingLineIdRef.current,
          update_code: replacingLineIdRef.current,
        })
      : null;

    if (replaceLine) {
      if (String(replaceLine.product_code) === String(selectedProduct.product_code)) {
        setStatusMessage("Choose a different product to replace this line.");
        return;
      }
      const runReplace = async () => {
      try {
        const ok = await replaceCartLineWithProduct(
          replaceLine,
          selectedProduct,
          entryQtyRaw,
          discount,
          override,
        );
        if (ok) {
          setReplacingLineId(null);
          // replaceCartLineWithProduct already notes previous-order swap success.
          if (!isPreviousOrderEditSession(cartRef.current)) {
            setStatusMessage(
              `Replaced ${posProductDisplayName(replaceLine)} with ${posProductDisplayName(selectedProduct)}.`,
            );
          }
        }
      } catch (e) {
        setStatusMessage(e instanceof ApiError ? e.message : "Failed to replace line");
        }
      };
      void enqueueCartCommit(runReplace);
      return;
    }

    const computed = applyComputedPrice(
      selectedProduct,
      entryQtyRaw,
      discount,
      override,
    );
    if (computed.baseQty <= 0) {
      setStatusMessage("Enter a valid quantity.");
      return;
    }

    const wasEditing = editingLineId;
    const editingLine = cart?.lines?.find((l) => sameLineId(l.id, editingLineId)) ?? null;
    const run = async () => {
    try {
      const liveLines = cartRef.current?.lines;
      const mergeTarget = editingLineId
        ? null
        : findMergeableCartLine(
            liveLines,
            lineForm.product_code,
            computed,
            posSalesConfig,
            sellWholesale,
            null,
            selectedProduct,
            { combineIdenticalLines: posSalesConfig.combineIdenticalLines !== false },
          );
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
        unlockUiEarly: true,
      });
      if (!ok) return;
      if (editingLineId) {
        notePreviousOrderEditSuccess("qty");
      } else if (mergeTarget) {
        notePreviousOrderEditSuccess("qty");
      } else {
        notePreviousOrderEditSuccess("add");
      }
      focusScanAfterItemAdded();
    } catch (e) {
      setStatusMessage(
        e instanceof ApiError
          ? e.message
          : wasEditing
            ? "Failed to update line"
            : "Failed to add line",
      );
      }
    };

    // Always serialize line adds — rapid Enter/click must not create duplicate rows.
    // commitCartLine paints then clears entry (unlockUiEarly) — do not clear first.
    void enqueueCartCommit(run);
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
    if (!selectedProduct) return;
    // Classic / previous-order drafts enqueue without freezing on TemporaryCart lineBusy —
    // Enter on qty must still add the item (same rule as swap / line qty edits).
    const localDraftEdit = usesPosLocalDraftLineEdits(cartRef.current);
    if (busy) return;
    if (lineBusy && !classicLayout && !localDraftEdit) return;
    if (addLineBlocked) {
      if (classicLayout && lineStockMessage) setStatusMessage(lineStockMessage);
      return;
    }
    // Classic entry row only edits qty — Enter adds the line.
    if (classicLayout) {
      void handleAddLine();
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
    if (!selectedProduct || busy) return;
    const localDraftEdit = usesPosLocalDraftLineEdits(cartRef.current);
    if (lineBusy && !classicLayout && !localDraftEdit) return;
    if (addLineBlocked) return;
    if (allowEditUnitPrice) {
      focusLineField(unitPriceRef);
      return;
    }
    void handleAddLine();
  }

  function handleUnitPriceEnter(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (busy) return;
    const localDraftEdit = usesPosLocalDraftLineEdits(cartRef.current);
    if (lineBusy && !classicLayout && !localDraftEdit) return;
    if (!addLineBlocked) void handleAddLine();
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
    if (!line || !cart?.id || !delta) return;
    const localDraftEdit = usesPosLocalDraftLineEdits(cartRef.current);
    // Live cart still blocks while another line request is in flight.
    if (!localDraftEdit && (busy || lineBusy)) return;

    const run = async () => {
      const activeCart = cartRef.current ?? cart;
      const product =
        productByCodeRef.current[line.product_code] ??
        (await resolveProductByCode(line.product_code));
      if (!product) {
        setStatusMessage("Product not found for this cart line.");
        return;
      }

      const retailPackage = getRetailPackage(line.product_code);
      // +/- keeps this line's own wholesale/retail mode (F12 only applies on qty Enter).
      const isRetailLine = cartLineRetailStockFlag(line);
      const adjustCheck = canAdjustCartLineQuantity({
        line,
        product,
        retailPackage,
        delta,
        cartLines: activeCart?.lines,
        sellFromShop,
        posSalesConfig,
        allowNegativeStock,
        productByCode: productByCodeRef.current,
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

        // Previous-order / offline: remove locally (same as add — flush on Complete).
        if (isPreviousOrderEditSession(activeCart) || activeCart?.offline) {
          const nextLines = (activeCart.lines ?? []).filter(
            (l) => String(cartLineRef(l)) !== String(lineRef) && !sameLineId(l.id, line.id),
          );
          let nextCart = withEditDraftDirty({ ...activeCart, lines: nextLines });
          if (activeCart.offline) {
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
          if (isPreviousOrderEditSession(activeCart) && !activeCart.offline) {
            persistPreviousOrderLocalDraft(nextCart, { immediate: true });
          }
          if (sameLineId(editingLineId, line.id)) clearLineEntry();
          if (sameLineId(selectedLineId, line.id)) setSelectedLineId(null);
          return;
        }

        const updated = await apiRequest(`/sales/carts/${activeCart.id}/lines/${lineRef}`, {
          method: "DELETE",
        });
        if (shouldApplyServerCartMutation(activeCart.id)) {
          cartRef.current = updated;
          setCart(updated);
        }
        if (sameLineId(editingLineId, line.id)) clearLineEntry();
        if (sameLineId(selectedLineId, line.id)) setSelectedLineId(null);
        return;
      }

      const entryQty = cartLineEntryQtyForBaseQty(line, product, retailPackage, nextBaseQty);
      const packQty = cartLinePackQtyForDiscount(
        { ...line, quantity: nextBaseQty },
        product,
        retailPackage,
      );
      const perUnitDiscount = lineDiscountPerUnit(line.discount_given, packQty);
      const lockedUnit = cartLineLockedUnitOverride(line, product.uom, isRetailLine, {
        cashRound: enablePosCashRounding,
      });
      const computed = applyComputedPrice(
        product,
        entryQty,
        perUnitDiscount,
        lockedUnit,
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
        notePreviousOrderEditSuccess("qty");
      }
    };

    // Match fast new-order adds: don't freeze the grid while a local draft updates.
    if (localDraftEdit) {
      void enqueueCartCommit(async () => {
        try {
          await run();
        } catch (e) {
          setStatusMessage(e instanceof ApiError ? e.message : "Failed to update quantity");
        }
      });
      return;
    }

    setLineBusy(true);
    try {
      await run();
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to update quantity");
    } finally {
      setLineBusy(false);
    }
  }

  /**
   * Classic qty Enter: only this line updates. Typed qty stays as entered (e.g. 6 → 6);
   * price/mode follow the current F12 retail/wholesale session. Other lines are unchanged.
   */
  async function setCartLineEntryQuantity(line, entryQtyRaw) {
    if (!line || !(cartRef.current ?? cart)?.id) return;
    const swapDraft = swapDraftRef.current;
    // Only the line being swapped — never match by product_code alone (that stole
    // normal qty Enter into completeSwapFromDraft and left the qty unchanged).
    const swapTargetsThisLine =
      Boolean(swapDraft) &&
      (sameLineId(swapDraft.lineId, line.id) ||
        sameLineId(swapDraft.line?.id, line.id) ||
        sameLineId(swapDraft.line?.update_code, line.update_code) ||
        sameLineId(swapDraft.line?.update_code, line.id) ||
        sameLineId(swapDraft.lineId, line.update_code) ||
        sameLineId(swapDraft.line?.client_line_id, line.id) ||
        sameLineId(swapDraft.line?.client_line_id, line.update_code) ||
        // Reminted TemporaryCart ids: still finish the swap when this row is the
        // original SKU that was being replaced.
        (swapDraft.line?.product_code != null &&
          String(swapDraft.line.product_code) === String(line.product_code) &&
          Number(swapDraft.line.on_wholesale_retail ?? 0) ===
            Number(line.on_wholesale_retail ?? 0)));
    if (swapTargetsThisLine) {
      if (swapDraft?.product) {
        void completeSwapFromDraft(entryQtyRaw);
        return;
      }
      // Incomplete swap draft — clear and apply a normal qty edit.
      swapDraftRef.current = null;
      setSwapDraft(null);
      setReplacingLineId(null);
      replacingLineIdRef.current = null;
    }
    const localDraftEdit = usesPosLocalDraftLineEdits(cartRef.current);
    if (!classicLayout && !localDraftEdit && (busy || lineBusy)) return;
    const entryQty = parseDecimalInput(entryQtyRaw);
    if (!(entryQty > 0)) {
      setStatusMessage("Enter a quantity greater than zero, or use − to remove the line.");
      return;
    }

    // Unchanged qty + same retail/wholesale mode must not mark a previous-order
    // edit dirty — that wrongly opened Payment Breakdown on Alt+P. After F12,
    // session mode can differ while the typed number is the same — that must
    // still reprice. Always park focus on new-line Scan (never stay on qty).
    let qtyActuallyChanged = true;
    {
      const activeCart = cartRef.current ?? cart;
      const liveLine =
        (activeCart?.lines ?? []).find(
          (row) =>
            sameLineId(row.id, line.id) ||
            (cartLineRef(line) != null &&
              String(cartLineRef(row)) === String(cartLineRef(line))),
        ) ?? line;
      const productMeta =
        productByCodeRef.current[liveLine.product_code] ??
        productByCode[liveLine.product_code] ??
        null;
      const currentEntry = Number(
        parseDecimalInput(
          posEntryQtyFromCartLine(
            liveLine,
            productMeta,
            getRetailPackage(liveLine.product_code),
          ),
        ),
      );
      const lineIsRetail = cartLineRetailStockFlag(liveLine);
      const sessionIsRetail = posSalesConfig.enableRetailPricing
        ? isPosRetailSession(sellWholesaleRef.current)
        : lineIsRetail;
      const qtyUnchanged =
        Number.isFinite(currentEntry) && Math.abs(currentEntry - entryQty) < 0.0001;
      qtyActuallyChanged = !qtyUnchanged;
      const modeUnchanged = lineIsRetail === sessionIsRetail;
      setSelectedLineId(null);
      focusScanAfterItemAdded();
      if (qtyUnchanged && modeUnchanged) return;
    }

    const run = async () => {
      const activeCart = cartRef.current ?? cart;
      const liveLine =
        (activeCart?.lines ?? []).find(
          (row) =>
            sameLineId(row.id, line.id) ||
            (cartLineRef(line) != null &&
              String(cartLineRef(row)) === String(cartLineRef(line))),
        ) ?? line;
      const lineRef = cartLineRef(liveLine);
      if (!lineRef) {
        setStatusMessage("Could not resolve the cart line to update.");
        return;
      }
      // Prefer cache — qty↔unit conversion only needs product UOM, not a network round-trip.
      let product = productByCodeRef.current[liveLine.product_code] ?? null;
      if (!product) {
        const fromCatalog = getPosSearchProduct(liveLine.product_code);
        if (fromCatalog && isSellableCatalogProduct(fromCatalog)) {
          product = enrichProductForLpo(fromCatalog, uomById, vatById);
          productByCodeRef.current[product.product_code] = product;
          setProductByCode((prev) =>
            prev[product.product_code] ? prev : { ...prev, [product.product_code]: product },
          );
        }
      }
      if (!product) {
        product = await resolveProductByCode(liveLine.product_code);
      }
      if (!product) {
        setStatusMessage("Product not found for this cart line.");
        return;
      }

      const lineIsRetail = cartLineRetailStockFlag(liveLine);
      const sessionIsRetail = posSalesConfig.enableRetailPricing
        ? isPosRetailSession(sellWholesaleRef.current)
        : lineIsRetail;
      const switchingMode = sessionIsRetail !== lineIsRetail;

      // Retail markups/tiers live on retail_package — load whenever pricing retail,
      // not only on a mode flip (otherwise retail amount missed markup).
      if (
        sessionIsRetail &&
        retailByCodeRef.current[liveLine.product_code] === undefined &&
        !product?.retail_package
      ) {
        await ensureRetailPackageForProduct(product);
      }
      const retailPackage = getRetailPackage(liveLine.product_code);

      // Always price from the cashier-facing number in the qty field.
      // F12 wholesale↔retail must NOT ×/÷ conversion_factor to "preserve stock"
      // (1 bag became 50 retail units). Typed qty stays as entered in the new mode.
      const pricingEntryQty = entryQty;

      // When F12 session differs from the line's mode, reprice from catalog —
      // do not lock the old wholesale/retail unit.
      const lockedUnit = !switchingMode
        ? cartLineLockedUnitOverride(liveLine, product.uom, lineIsRetail, {
            cashRound: enablePosCashRounding,
          })
        : null;
      const computedPreview = applyComputedPrice(
        product,
        pricingEntryQty,
        0,
        lockedUnit,
        sessionIsRetail,
        !sessionIsRetail,
      );
      const packQty = cartLinePackQtyForDiscount(
        {
          ...liveLine,
          quantity: computedPreview.baseQty,
          on_wholesale_retail: sessionIsRetail ? 1 : 0,
        },
        product,
        retailPackage,
      );
      const perUnitDiscount = lineDiscountPerUnit(liveLine.discount_given, packQty);
      const computed = applyComputedPrice(
        product,
        pricingEntryQty,
        perUnitDiscount,
        lockedUnit,
        sessionIsRetail,
        !sessionIsRetail,
      );

      if (!allowNegativeStock) {
        const stockCheck = posStockAvailability({
          product,
          baseQty: computed.baseQty,
          cartLines: activeCart?.lines,
          sellFromShop,
          posSalesConfig,
          allowNegativeStock,
          stockAsRetail: posLineRetailStockFlag(
            posSalesConfig,
            !sessionIsRetail,
            computed.isRetail,
            product,
          ),
          productByCode: productByCodeRef.current,
          excludeLineId: liveLine?.id ?? liveLine?.update_code,
        });
        if (!stockCheck.ok) {
          setStatusMessage(
            posStockInsufficientMessage(stockCheck, {
              product,
              sellWholesale: !sessionIsRetail,
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
        editingId: liveLine.id,
        editingRef: lineRef,
        discount: perUnitDiscount,
        clearEntry: false,
        successMessage: null,
        unlockUiEarly: classicLayout,
        lineRetailStockFlagOverride: sessionIsRetail,
      });
      if (ok) {
        // After qty Enter/blur, park on new-line Scan code (not the same row).
        setSelectedLineId(null);
        focusScanAfterItemAdded();
        // Real qty change only — F12-only same-number reprice stays clean (no C/M popup).
        if (qtyActuallyChanged) {
          notePreviousOrderEditSuccess("qty");
        }
      }
    };

    // Classic (and previous-order local drafts): same as scan-add — optimistic paint,
    // do not freeze the qty grid behind lineBusy / PATCH.
    if (classicLayout || localDraftEdit) {
      void enqueueCartCommit(async () => {
        try {
          await run();
        } catch (e) {
          setStatusMessage(e instanceof ApiError ? e.message : "Failed to update quantity");
        }
      });
      return;
    }

    setLineBusy(true);
    try {
      await run();
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to update quantity");
    } finally {
      setLineBusy(false);
    }
  }

  function cartLineMatchesSelection(line, idSet) {
    if (!line || !idSet?.size) return false;
    return [...idSet].some((id) => sameLineId(line.id, id));
  }

  function clearClassicLineSelection() {
    clearCartLineSelection();
    setSelectedLineId(null);
  }

  function handleClassicSelectLine(lineId) {
    setSelectedLineId(lineId);
    setSelectedLineIds((prev) => {
      const key = String(lineId);
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  function previousOrderLineRemoveConfirmMessage(count = 1) {
    const itemLabel = count === 1 ? "this item" : `${count} items`;
    let message =
      `Remove ${itemLabel} from the revised order? Stock for removed lines is already back in inventory — it was restored when you opened this receipt.`;
    if (isKraDeviceConfigured(capabilities?.module_settings, capabilities)) {
      message +=
        " If the original sale was sent to KRA, a credit note is issued in the background when you open the order; the revised sale is fiscalized when you finish checkout.";
    } else if (instantAutoEditSync) {
      message += " Changes save automatically — use Alt+P to reprint.";
    } else {
      message += " Use Alt+P to finish and print the revised order.";
    }
    return message;
  }

  async function removeCartLinesByIds(rawIds) {
    const ids = [...new Set((rawIds ?? []).map(String))].filter(Boolean);
    if (!cart?.id || !cart?.lines?.length || !ids.length) return;

    const idSet = new Set(ids);
    const targets = (cart.lines ?? []).filter((line) => cartLineMatchesSelection(line, idSet));
    if (!targets.length) return;

    const isPreviousOrderEdit = Boolean(cart.held_order_num && cart.superseded_sale_id);
    if (isPreviousOrderEdit || targets.length > 1) {
      const ok = await confirm({
        title: targets.length === 1 ? "Remove item" : "Remove selected items",
        message: isPreviousOrderEdit
          ? previousOrderLineRemoveConfirmMessage(targets.length)
          : `Remove ${targets.length} items from the cart?`,
        confirmLabel: "Remove",
        destructive: true,
      });
      if (!ok) return;
    }

    setStatusMessage(null);
    const clearsEditing = targets.some((line) => sameLineId(editingLineId, line.id));

    // Previous-order edit / offline: remove locally without freezing the POS.
    if (isPreviousOrderEditSession(cart) || cart.offline) {
      const nextLines = (cart.lines ?? []).filter((line) => !cartLineMatchesSelection(line, idSet));
      let nextCart = withEditDraftDirty({ ...cart, lines: nextLines });
      if (cart.offline) {
        try {
          const saved = await saveLocalPosCart({
            ...nextCart,
            lines: nextLines.map((l) => ({
              ...l,
              client_line_id: l.client_line_id ?? l.id,
            })),
          });
          nextCart = presentLocalOfflineCart(saved);
        } catch (e) {
          setStatusMessage(e instanceof ApiError ? e.message : "Failed to remove line");
          return;
        }
      }
      cartRef.current = nextCart;
      setCart(nextCart);
      if (isPreviousOrderEditSession(cart) && !cart.offline) {
        persistPreviousOrderLocalDraft(nextCart, { immediate: true });
      }
      if (clearsEditing) clearLineEntry();
      clearClassicLineSelection();
      if (isPreviousOrderEditSession(cart)) {
        const label =
          targets.length === 1
            ? targets[0]?.product_name || targets[0]?.product_code || "Item"
            : `${targets.length} items`;
        if (standalone && instantAutoEditSync) {
          setStatusMessage(
            `${label} removed from Cash Sales #${formatPosBrowseLabel(cart)} — syncing…`,
          );
        } else if (!standalone) {
          setStatusMessage(
            `${label} removed from revised Cash Sales #${formatPosBrowseLabel(cart)}. Saved locally — syncing…`,
          );
        }
      }
      return;
    }

    setBusy(true);
    try {
      let nextCart = cart;
      for (const line of targets) {
        const lineRef = cartLineRef(line);
        if (!lineRef) continue;
        nextCart = await apiRequest(`/sales/carts/${cart.id}/lines/${lineRef}`, {
          method: "DELETE",
        });
      }
      if (shouldApplyServerCartMutation(cart.id)) {
        cartRef.current = nextCart;
        setCart(nextCart);
      }
      if (clearsEditing) clearLineEntry();
      clearClassicLineSelection();
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to remove line");
    } finally {
      setBusy(false);
    }
  }

  async function removeSelectedLine() {
    if (!selectedLineId) return;
    await removeCartLinesByIds([selectedLineId]);
  }

  async function removeSelectedLines() {
    const ids = [...selectedLineIds];
    if (!ids.length && selectedLineId) {
      await removeCartLinesByIds([selectedLineId]);
      return;
    }
    await removeCartLinesByIds(ids);
  }

  async function clearAllLines() {
    if (!cart?.id || !cart?.lines?.length) return;
    if (
      !(await confirm({
        title: "Clear cart",
        message: cart.held_order_num
          ? instantAutoEditSync
            ? "Clear all items? This cancels the order and records a full return once payment breakdown is entered."
            : "Clear all items? Enter the return, then Alt+P to cancel this order and record the refund."
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
      if (isPreviousOrderEditSession(cart) || cart.offline) {
        let nextCart = withEditDraftDirty({ ...cart, lines: [] });
        if (cart.offline) {
          const saved = await saveLocalPosCart({
            ...nextCart,
            lines: [],
          });
          nextCart = presentLocalOfflineCart(saved);
        }
        cartRef.current = nextCart;
        setCart(nextCart);
        if (isPreviousOrderEditSession(cart) && !cart.offline) {
          persistPreviousOrderLocalDraft(nextCart, { immediate: true });
        }
        clearLineEntry();
        setSelectedLineId(null);
        setStatusMessage(
          isPreviousOrderEditSession(cart)
            ? instantAutoEditSync
              ? "Lines cleared — recording full return and cancelling order…"
              : "Lines cleared — enter the return, then Alt+P to cancel this order."
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
    replacingLineIdRef.current = null;
    swapDraftRef.current = null;
    setSwapDraft(null);
    swapCommitInFlightRef.current = false;
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

  /**
   * After a local hold: unlock the till immediately with an empty workspace,
   * then clear the old TemporaryCart / bootstrap the next cart in the background
   * (same pattern as F10 / post-checkout).
   *
   * Critical: await TemporaryCart line DELETE and fetch with applyState:false so
   * loadCashierCart cannot re-paint held lines over the empty placeholder.
   */
  async function clearWorkspaceAfterLocalHold(activeCart) {
    setSaveOrderOpen(false);
    setSaveOrderError(null);
    setPaymentOpen(false);
    setPaymentError(null);
    setHeldOrdersOpen(false);
    setLeaveGuardOpen(false);
    setAutoHeldPrompt(null);
    clearPosUiDraft();
    clearLineEntry();
    setSelectedLineId(null);
    clearClassicLineSelection();
    void clearPreviousOrderEditDraft().catch(() => {});

    // Holding parks IndexedDB only — invalidate any in-flight held restore materialize.
    // (applyFreshWorkspacePlaceholder also bumps this.)
    const serverId = isServerPosCartId(activeCart?.id) ? Number(activeCart.id) : null;
    const quickPeek = resolveFreshWorkspacePosNum(
      activeCart,
      sessionPosOrders,
      null,
      null,
      floatSessionId,
    );
    applyFreshWorkspacePlaceholder(activeCart, quickPeek);

    if (classicLayout) {
      focusClassicProductSearch();
    } else {
      window.requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
    }

    if (serverId) {
      markServerCartConsumed(serverId);
    }

    const clearPromise =
      serverId != null
        ? apiRequest(`/sales/carts/${serverId}/lines`, {
            method: "DELETE",
            loading: false,
            reportIssues: false,
          }).catch(() => null)
        : Promise.resolve(null);

    void clearLocalPosCart().catch(() => {});

    const generation = ++freshWorkspaceGenerationRef.current;
    void (async () => {
      try {
        await clearPromise;
        const next = await loadCashierCart({
          skipEditDraftRestore: true,
          applyState: false,
        });
        if (generation !== freshWorkspaceGenerationRef.current) return;
        const live = cartRef.current;
        if (
          !isFreshWorkspacePlaceholder(live) &&
          ((live?.lines?.length ?? 0) > 0 || live?.held_order_num || live?.offline_client_sale_uuid)
        ) {
          return;
        }
        if (!next || !isServerPosCartId(next.id)) return;

        // Never reattach the held TemporaryCart's lines (DELETE race / same cart id).
        let cleaned = stripOfflineSaleMarkers(next);
        if (
          serverId != null &&
          (Number(cleaned?.id) === Number(serverId) || isServerCartConsumed(cleaned.id))
        ) {
          cleaned = {
            ...cleaned,
            lines: [],
            held_order_num: null,
            superseded_sale_id: null,
            order_discount: 0,
            payment_adjustments: undefined,
            _editDraftDirty: undefined,
          };
        }
        if ((cleaned.lines?.length ?? 0) > 0 && serverId != null) {
          cleaned = { ...cleaned, lines: [] };
        }

        const merged = mergeFreshWorkspaceCart(cleaned, quickPeek);
        cartRef.current = merged;
        setCart(merged);
        if (merged.next_pos_order_num != null) {
          setEditOrderNo(String(merged.next_pos_order_num));
        } else if (quickPeek != null) {
          setEditOrderNo(String(quickPeek));
        }
      } catch {
        if (generation !== freshWorkspaceGenerationRef.current) return;
        const live = cartRef.current;
        if (
          !isFreshWorkspacePlaceholder(live) &&
          ((live?.lines?.length ?? 0) > 0 || live?.held_order_num)
        ) {
          return;
        }
        try {
          const empty = await loadOrCreateLocalPosCart({
            branch_id: activeCart?.branch_id ?? user?.branch_id ?? null,
            till_id: activeCart?.till_id ?? null,
            float_session_id: activeCart?.float_session_id ?? floatSessionId ?? null,
          });
          if (generation !== freshWorkspaceGenerationRef.current) return;
          const presented = presentLocalOfflineCart(empty);
          cartRef.current = presented;
          setCart(presented);
        } catch {
          /* placeholder remains — next scan will ensureCart */
        }
      }
    })();
  }

  /** Classic: hold open sale automatically when leaving POS (Light Stores AutomaticHold). */
  async function holdCartAndLeave() {
    const href = pendingLeaveHrefRef.current;
    const activeCart = cartRef.current ?? cart;
    if (!activeCart?.lines?.length) {
      completeLeaveNavigation(href);
      return;
    }
    setLeaveGuardBusy(true);
    setStatusMessage(null);
    try {
      const park = await parkCartLocally(activeCart, {
        walkIn: true,
        walkInName: prefilledEditCustomerName.trim() || "Walk-in (auto-held)",
        cashierId: user?.id ?? null,
        branchId: activeCart.branch_id ?? user?.branch_id ?? null,
        tillId: activeCart.till_id ?? null,
        floatSessionId: activeCart.float_session_id ?? floatSessionId ?? null,
      });
      rememberAutoHeldOrder({
        localHeldId: park.id,
        holdLabel: park.hold_label,
      });
      await clearWorkspaceAfterLocalHold(activeCart);
      void loadHeldOrdersCount();
      completeLeaveNavigation(href);
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : e?.message || "Failed to hold sale before leaving");
      setLeaveGuardOpen(false);
    } finally {
      setLeaveGuardBusy(false);
    }
  }

  async function handleAutoHeldRestore() {
    if (!autoHeldPrompt?.localHeldId && !autoHeldPrompt?.saleId) return;
    setAutoHeldBusy(true);
    closeProductSearchDropdown();
    searchInputRef.current?.blur?.();
    try {
      if (autoHeldPrompt.localHeldId && isLocalHeldId(autoHeldPrompt.localHeldId)) {
        const { cart: localCart, park } = await restoreLocalHeldOrder(autoHeldPrompt.localHeldId, {
          branch_id: user?.branch_id ?? null,
          till_id: cart?.till_id ?? null,
          float_session_id: floatSessionId ?? null,
        });
        if (offlineMode) {
          const saved = await saveLocalPosCart({ ...localCart, offline: true });
          applyRestoredHeldCart(presentLocalOfflineCart(saved), park);
        } else {
          applyRestoredHeldCart(localCart, park);
          scheduleLocalHeldMaterialize(localCart, park);
        }
        setHeldOrdersOpen(false);
        notifySuccess("Held sale restored — complete when ready.");
        return;
      }
      beginPreviousOrderLoading("Restoring held order…");
      try {
        await restoreHeldSaleToNewCart(autoHeldPrompt.saleId, { replace: true });
      } finally {
        endPreviousOrderLoading();
      }
      setHeldOrdersOpen(false);
      notifySuccess("Held sale restored — complete when ready.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not restore held sale");
    } finally {
      setAutoHeldBusy(false);
    }
  }

  async function handleAutoHeldDelete() {
    if (!autoHeldPrompt?.localHeldId && !autoHeldPrompt?.saleId) return;
    setAutoHeldBusy(true);
    try {
      if (autoHeldPrompt.localHeldId && isLocalHeldId(autoHeldPrompt.localHeldId)) {
        await deleteLocalHeldOrder(autoHeldPrompt.localHeldId);
      } else {
        await apiRequest(`/sales/orders/${autoHeldPrompt.saleId}/cancel-held`, {
          method: "POST",
        });
      }
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
    // Warn on leave when there are reserved lines, or whenever offline/slow
    // (toolbar reload / close would risk losing sell capability).
    const networkDown =
      offlineMode || networkStatus === "offline" || networkStatus === "slow";
    const blockUnload =
      (cartHasReservedItems || networkDown) && !leaveGuardOpen;
    if (!blockUnload) return undefined;

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
  }, [standalone, cartHasReservedItems, leaveGuardOpen, offlineMode, networkStatus]);

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
      setSellWholesaleMode(!isRetailLine);
      setSelectedProductCode(line.product_code);
      setSelectedProduct(product);
      setSearchQuery(product.product_name ?? line.product_code);
      setUnitPriceTouched(true);
      const entryQty = posEntryQtyFromCartLine(line, product, retailPackage);
      const perUnitDiscount = cartLineEnteredDiscountPerUnit(line, product, retailPackage);
      // Retail Price field is wholesale/kg (markup on amount). Prefer stored display;
      // fall back to catalog wholesale so amortized unit_price is never used as override.
      const retailUnit =
        Number(line.display_unit_price) > 0
          ? Number(line.display_unit_price)
          : Number(line.unit_price) > 0
            ? Number(line.unit_price)
            : applyComputedPrice(
              product,
              entryQty,
              String(perUnitDiscount),
              null,
              isRetailLine,
              !isRetailLine,
            ).displayUnitPrice;
      setLineForm({
        product_code: line.product_code,
        description: line.product_name ?? product.product_name ?? "",
        package: line.uom ?? "",
        quantity: entryQty,
        discount: String(perUnitDiscount),
        unit_price: String(
          isRetailLine
            ? retailUnit
            : cartLineDisplayUnitPrice(line, product.uom, isRetailLine, {
                cashRound: enablePosCashRounding,
              }),
        ),
      });
      setStatusMessage(`Editing line #${line.line_no ?? line.id} (${posCartLineTypeLabel(line)}).`);
      window.requestAnimationFrame(() => {
        qtyInputRef.current?.focus({ preventScroll: true });
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
      return {};
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
    return next;
  }

  function applyLiveCartCatalogPrices(productMeta, { announce = true } = {}) {
    const activeCart = cartRef.current;
    if (!activeCart?.lines?.length || !productMeta || !Object.keys(productMeta).length) {
      return 0;
    }
    // Keep sold prices when revising / appending to an existing order, or while a
    // local-first / offline cart is still open after reconnect.
    if (
      activeCart.held_order_num ||
      activeCart.superseded_sale_id ||
      activeCart.offline ||
      activeCart.offline_client_sale_uuid
    ) {
      return 0;
    }
    const mergedProducts = { ...productByCodeRef.current, ...productMeta };
    const { cart: pricedCart, updatedCount, changes } = applyCatalogPricesToCart(activeCart, {
      productByCode: mergedProducts,
      retailByCode: retailByCodeRef.current,
      sellWholesale: sellWholesaleRef.current,
      cashRound: enablePosCashRounding,
    });
    if (updatedCount <= 0) return 0;
    cartRef.current = pricedCart;
    setCart(pricedCart);
    const sample = changes
      .slice(0, 2)
      .map((c) => `${c.product_name}: ${formatSaleKes(c.from)} → ${formatSaleKes(c.to)}`)
      .join("; ");
    const suffix = changes.length > 2 ? ` (+${changes.length - 2} more)` : "";
    const message = `Prices updated — ${updatedCount} cart item${updatedCount === 1 ? "" : "s"}${sample ? `: ${sample}${suffix}` : ""}.`;
    if (announce) {
      setStatusMessage(message);
      if (standalone) notifySuccess(message);
    }
    return updatedCount;
  }
  applyLiveCartCatalogPricesRef.current = applyLiveCartCatalogPrices;

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
        const productMeta = await reloadCartProductMeta(
          codes.map((product_code) => ({ product_code })),
          uomMap,
          vatMap,
        );
        await ensureRetailPackages(codes);
        const updatedCount = applyLiveCartCatalogPrices(productMeta, { announce: false });
        setStatusMessage(
          updatedCount > 0
            ? `Refreshed — ${updatedCount} cart price${updatedCount === 1 ? "" : "s"} updated.`
            : "Refreshed — search cleared and prices updated.",
        );
        if (updatedCount > 0 && standalone) {
          notifySuccess(`${updatedCount} cart price${updatedCount === 1 ? "" : "s"} updated.`);
        }
      } else {
        setStatusMessage("Refreshed — search cleared and prices updated.");
      }
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

  const preparingNextOrderRef = useRef(false);
  const prepareNextOrderInFlightRef = useRef(null);
  /** Guards overlapping F8 clears so a stale background cart load cannot overwrite a newer session. */
  const freshWorkspaceGenerationRef = useRef(0);
  /** Prevents a second F8 while confirm / bootstrap from the first press is still running. */
  const freshWorkspaceInFlightRef = useRef(false);
  /** Shared TemporaryCart create after optimistic F8 clear (first scan reuses this). */
  const freshCartBootstrapRef = useRef(null);

  /** Clear workspace and load the next reserved POS ticket # (post-checkout / F8). */
  const prepareNextPosOrderAfterSale = useCallback(
    async ({
      focusScan = true,
      force = false,
      pendingSale = null,
      keepPaymentOpen = false,
      onProgress = null,
    } = {}) => {
      const report = (pct) => {
        if (typeof onProgress === "function") onProgress(pct);
      };
      if (!standalone) return;
      if (preparingNextOrderRef.current) {
        if (!force) return;
        if (prepareNextOrderInFlightRef.current) {
          await prepareNextOrderInFlightRef.current.catch(() => {});
        }
      }
      preparingNextOrderRef.current = true;
      report(8);
      closeProductSearchDropdown();
      searchInputRef.current?.blur?.();
      if (!keepPaymentOpen) {
        setPaymentOpen(false);
        // Don't clear receiptPrintStatus here — print may still be in flight.
      }
      setPaymentError(null);
      setEditSourceSale(null);
      orderNoUserEditedRef.current = false;
      setEditBrowseIndex(0);
      setSelectedLineId(null);
      clearLineEntry();
      void clearPreviousOrderEditDraft().catch(() => {});

      const saleForPeek = pendingSale ?? completedSaleRef.current;
      const checkoutCart = cartRef.current;
      const checkoutCartId =
        isServerPosCartId(checkoutCart?.id) && !isServerCartConsumed(checkoutCart.id)
          ? Number(checkoutCart.id)
          : null;

      // Drop to an empty shell immediately — do not wait on peek / POST cart.
      const quickPeek = resolveFreshWorkspacePosNum(
        checkoutCart,
        sessionPosOrders,
        saleForPeek,
        null,
        floatSessionId,
      );
      applyFreshWorkspacePlaceholder(checkoutCart, quickPeek);
      setStatusMessage("New order — scan or search a product.");
      report(28);

      if (checkoutCartId) {
        markServerCartConsumed(checkoutCartId);
        void apiRequest(`/sales/carts/${checkoutCartId}/lines`, {
          method: "DELETE",
          loading: false,
          reportIssues: false,
        }).catch(() => {});
      }
      if (standalone && !offlineMode) {
        void clearLocalPosCart().catch(() => {});
      }

      const generation = ++freshWorkspaceGenerationRef.current;
      const cartPromise = loadCashierCart({ skipEditDraftRestore: true });

      const peekNextPos = await resolveNextPosTicketForWorkspace(
        cartRef.current,
        sessionPosOrders,
        saleForPeek,
        { skipServerReseed: true, floatSessionId },
      );
      if (
        peekNextPos != null &&
        Number(peekNextPos) !== Number(cartRef.current?.next_pos_order_num ?? quickPeek)
      ) {
        applyFreshWorkspacePlaceholder(cartRef.current, peekNextPos);
      }
      report(45);

      const task = (async () => {
        try {
          if (generation !== freshWorkspaceGenerationRef.current) return cartRef.current;

          const next = await cartPromise;
          report(78);
          if (generation !== freshWorkspaceGenerationRef.current) return next;

          const live = cartRef.current;
          const liveIsStaleCheckout =
            isStalePostCheckoutWorkspace(live, saleForPeek) ||
            (isServerPosCartId(live?.id) && isServerCartConsumed(live.id));
          // Cashier already scanned into the next cart while bootstrap ran — keep their work.
          // Never restore the consumed checkout cart or the sale that just completed.
          if (
            live &&
            !liveIsStaleCheckout &&
            isServerPosCartId(live.id) &&
            (live.lines?.length ?? 0) > 0 &&
            !live?.held_order_num &&
            !live?.superseded_sale_id
          ) {
            const nextLen = next?.lines?.length ?? 0;
            const liveLen = live.lines?.length ?? 0;
            if (
              live.id !== next?.id ||
              liveLen > nextLen ||
              cartHasOptimisticLines(live)
            ) {
              report(100);
              return live;
            }
          }

          const merged = mergeFreshWorkspaceCart(
            stripOfflineSaleMarkers(stripPreviousOrderEditSession(next)),
            peekNextPos,
          );
          cartRef.current = merged;
          setCart(merged);
          const displayPos =
            resolvePosNextBrowseNumber(merged) ??
            (peekNextPos != null ? peekNextPos : null);
          setEditOrderNo(displayPos != null ? String(displayPos) : "");
          if (enablePosOrderEdit) {
            void loadCompletedPosOrders();
          }
          report(100);
          if (focusScan) {
            if (classicLayout) {
              focusClassicProductSearch();
            } else {
              window.requestAnimationFrame(() =>
                searchInputRef.current?.focus({ preventScroll: true }),
              );
            }
          }
          return merged;
        } catch (e) {
          if (generation !== freshWorkspaceGenerationRef.current) return cartRef.current;
          const message = e instanceof ApiError ? e.message : "Failed to start next order";
          setStatusMessage(message);
          notifyError(message);
          if (isMissingTemporaryCartError(e)) {
            try {
              const recovered = await recoverMissingServerCart();
              if (generation === freshWorkspaceGenerationRef.current && recovered) {
                const merged = mergeFreshWorkspaceCart(
                  stripOfflineSaleMarkers(stripPreviousOrderEditSession(recovered)),
                  peekNextPos,
                );
                cartRef.current = merged;
                setCart(merged);
                report(100);
                return merged;
              }
            } catch {
              /* keep placeholder — next scan will ensureCart */
            }
          }
          throw e;
        } finally {
          if (freshCartBootstrapRef.current === task) {
            freshCartBootstrapRef.current = null;
          }
        }
      })();
      // Share with ensureCart so the first scan awaits this POST, not a second cart create.
      freshCartBootstrapRef.current = task;
      prepareNextOrderInFlightRef.current = task;
      try {
        return await task;
      } finally {
        if (prepareNextOrderInFlightRef.current === task) {
          prepareNextOrderInFlightRef.current = null;
        }
        preparingNextOrderRef.current = false;
      }
    },
    [
      standalone,
      channel,
      user?.branch_id,
      tillId,
      floatSessionId,
      loadCashierCart,
      classicLayout,
      enablePosOrderEdit,
      loadCompletedPosOrders,
      focusClassicProductSearch,
      sessionPosOrders,
    ],
  );

  function queuePrepareNextPosOrderAfterSale(options = {}) {
    if (!standalone) return;
    void prepareNextPosOrderAfterSale(options);
  }

  const schedulePosReceiptPrint = useCallback(
    (sale, { onSettled } = {}) => {
      if (!sale?.id || !posSalesConfig.showCheckoutOnCreate) {
        setReceiptPrintStatus(null);
        onSettled?.();
        return;
      }
      setReceiptPrintStatus("pending");
      const documentType =
        resolveOrderPrintDocumentType(capabilities?.module_settings) ?? "receipt";
      const skipKraQr =
        Boolean(sale?._skip_kra_qr) ||
        Boolean(sale?.kra_skipped) ||
        ["failed", "skipped"].includes(
          String(sale?.kra_response?.status ?? sale?.kraResponse?.status ?? "").toLowerCase(),
        );
      void printSaleOrder(
        sale,
        fastPosPrintOptions(sale, {
        capabilities,
        organization,
        organizationName: capabilities?.profile_label,
        uomById,
          productByCode,
        user,
        preparedBy: user?.full_name ?? user?.username ?? null,
        documentType,
          // Checkout returns kra_response for immediate thermal QR print.
          // Soft-failed KRA sales print a normal receipt without waiting for QR.
          kraReceipt: skipKraQr ? null : (sale.kra_response ?? sale.kraResponse ?? null),
          allowKraNetwork: skipKraQr ? false : undefined,
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
        })
        .finally(() => {
          onSettled?.();
        });
    },
    [posSalesConfig.showCheckoutOnCreate, capabilities, organization, uomById, productByCode, user],
  );

  function afterSaleCheckoutComplete(sale, options = {}) {
    const shouldPrint =
      !options.skipPrint && sale?.id && posSalesConfig.showCheckoutOnCreate;

    void clearPreviousOrderEditDraft().catch(() => {});

    // Print receipt only — keep payment on ORDER COMPLETE until cashier presses OK.
    // Next workspace is prepared on OK (with progress) so the till never sticks on
    // the completed sale lines.
    if (shouldPrint) {
      schedulePosReceiptPrint(sale);
    } else {
      setReceiptPrintStatus(null);
    }
  }

  async function runPrepareNextOrderOverlay(task) {
    closeProductSearchDropdown();
    searchInputRef.current?.blur?.();
    setPreparingNextProgress(0);
    setPreparingNextOpen(true);
    await new Promise((r) => window.requestAnimationFrame(() => r()));
    try {
      await task(setPreparingNextProgress);
      setPreparingNextProgress(100);
      await new Promise((r) => window.setTimeout(r, 120));
    } finally {
      setPreparingNextOpen(false);
      setPreparingNextProgress(0);
      if (classicLayout) {
        focusClassicProductSearch();
      } else {
        window.requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
      }
    }
  }

  async function handleContinueNextOrder() {
    setReceiptPrintStatus(null);
    if (standalone) {
      clearPosUiDraft();
      setPaymentOpen(false);
      setPaymentError(null);
      try {
        await runPrepareNextOrderOverlay(async (report) => {
          await prepareNextPosOrderAfterSale({
            force: true,
            focusScan: false,
            keepPaymentOpen: false,
            pendingSale: completedSaleRef.current,
            onProgress: report,
          });
        });
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Failed to start next order";
        setStatusMessage(message);
      }
      return;
    }
    setPaymentOpen(false);
    setPaymentError(null);
    clearLineEntry();
    setBusy(true);
    try {
      await loadCashierCart();
      setStatusMessage(
        completedSale?.order_num
          ? `Ready for next order — previous Cash Sales #${formatPosBrowseLabel(completedSale)}.`
          : "Ready for next order.",
      );
    } catch (e) {
      setStatusMessage(e instanceof ApiError ? e.message : "Failed to start next order");
    } finally {
      setBusy(false);
      window.requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
    }
  }

  async function handlePosKraProductUpload() {
    if (!kraUploadPrompt?.productCodes?.length) return;
    setKraUploadBusy(true);
    setKraUploadError(null);
    try {
      await registerProductsOnKraDevice({
        productCodes: kraUploadPrompt.productCodes,
        moduleSettings: capabilities?.module_settings,
        capabilities,
      });
      const retry = kraCheckoutRetryRef.current;
      setKraUploadPrompt(null);
      kraCheckoutRetryRef.current = null;
      setPaymentError(null);
      notifySuccess("Products uploaded to KRA — completing sale…");
      if (retry?.body) {
        await handleCheckout(retry.body, retry.options ?? {});
      }
    } catch (e) {
      setKraUploadError(
        e instanceof ApiError
          ? e.message
          : "KRA upload failed. Try again or contact a supervisor.",
      );
    } finally {
      setKraUploadBusy(false);
    }
  }

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
      !activeCart.offline_client_sale_uuid &&
      !activeCart.superseded_sale_id &&
      !isServerPosCartId(activeCart.id)
    ) {
      setPaymentError(
        "Reconnect to load this previous order for editing, then you can finish offline.",
      );
      return null;
    }

    const isQueuedOfflineEdit = Boolean(activeCart.offline_client_sale_uuid);
    const isPreviousOrderCashEdit = Boolean(
      activeCart.held_order_num && activeCart.superseded_sale_id,
    );

    if (isPreviousOrderCashEdit) {
      if (!editedOrderHasLocalDraftChanges(activeCart)) {
        setPaymentError(
          "No updates on this receipt — close payment and print with Alt+P, or edit qty/items first.",
        );
        return null;
      }
      try {
        // F10 payment panel already collected the delta as tenders — convert to
        // payment_adjustments and skip the separate breakdown dialog.
        if (body?.__previous_order_edit_adjustment) {
          const delta = computePreviousOrderEditPaymentDelta(editSourceSale, activeCart, {
            cashRound: enablePosCashRounding,
          });
          if (delta.type && Number(delta.amount) > 0) {
            const adjustments = buildPaymentAdjustmentsFromCheckoutBody(body, delta);
            if (adjustments.length) {
              const next = withEditDraftDirty({
                ...activeCart,
                payment_adjustments: adjustments,
              });
              cartRef.current = next;
              setCart(next);
              void savePreviousOrderEditDraft(next).catch(() => {});
            }
          }
        } else {
          await ensurePreviousOrderPaymentAdjustment(activeCart);
        }
      } catch (e) {
        setPaymentError(
          e instanceof Error
            ? e.message
            : "Enter how the refund or top-up was paid before completing this edit.",
        );
        return null;
      }
    }

    const pendingPosSlot =
      standalone && !isPreviousOrderCashEdit
        ? await peekNextPosOfflineOrderSlot().catch(() => null)
        : null;
    // Org S# may come from the reserved pool for offline; Cash Sales # is never
    // taken from that pool (assigned per cashier 1,2,3… at sale time).
    const checkoutCartFields = posCheckoutCartFields(activeCart, editSourceSale, {
      editOrderNo,
      pendingSlot: pendingPosSlot
        ? { ...pendingPosSlot, pos_order_num: null }
        : null,
    });

    // Local cash + outbox when:
    // - truly offline / slow (offlineMode), or
    // - this workspace continued locally after an outage (cart.offline), or
    // - revising a queued pending-sync sale (offline_client_sale_uuid).
    // Mid-sale outage carts keep offline:true after reconnect (we do not rematerialize),
    // so cart.offline must take this path or F10 would hit TemporaryCart with id "active".
    if (
      standalone &&
      (offlineMode ||
        Boolean(activeCart.offline) ||
        Boolean(activeCart.offline_client_sale_uuid)) &&
      (!activeCart.held_order_num || isQueuedOfflineEdit || isPreviousOrderCashEdit)
    ) {
      const method = String(body?.payment_method_code ?? "").toUpperCase();
      const cashPay = Number(body?.pay_now ?? summary?.amountDue ?? 0);
      const offlineCashTendered = Number(body?.__cash_tendered ?? 0);
      const isOfflineCredit = Boolean(body?.is_credit_sale);
      // Non-credit tenders (Cash / M-Pesa / Equity / KCB / bank / cheque) must cover the bill.
      // Only credit may complete unpaid or partially paid. Previous-order edits settle via
      // payment_adjustments (pay_now is 0) — skip this gate for those.
      if (
        !isOfflineCredit &&
        !isPreviousOrderCashEdit &&
        cashPay + 0.01 < Number(summary?.amountDue ?? 0)
      ) {
        setPaymentError(
          "Full payment required for Cash, M-Pesa, bank, and cheque. Select a credit customer to leave a balance unpaid or partially paid.",
        );
        return null;
      }
      if (isOfflineCredit && !(Number(body?.customer_num) > 0)) {
        setPaymentError("Credit sales require a registered customer.");
        return null;
      }
      setBusy(true);
    setPaymentError(null);
    setReceiptPrintStatus(null);
    try {
        const checkoutCart = cartRef.current ?? activeCart;
        const local = {
          id: isServerPosCartId(activeCart.id) ? activeCart.id : "active",
          lines: (checkoutCart.lines ?? []).map((l) => ({
            ...l,
            client_line_id: l.client_line_id ?? l.id,
          })),
          branch_id: checkoutCart.branch_id ?? user?.branch_id,
          till_id: tillId ?? checkoutCart.till_id,
          float_session_id: floatSessionId ?? checkoutCart.float_session_id,
          customer_num: body?.customer_num ?? checkoutCart.customer_num,
          customer_name_override:
            body?.customer_name_override ?? checkoutCart.customer_name_override,
          ...(String(body?.customer_kra_pin ?? "").trim()
            ? { customer_kra_pin: String(body.customer_kra_pin).trim() }
            : {}),
          held_order_num: checkoutCart.held_order_num ?? null,
          offline_client_sale_uuid: checkoutCart.offline_client_sale_uuid ?? null,
          offline_edit_snapshot:
            checkoutCart.offline_edit_snapshot ?? editSourceSale ?? null,
          superseded_sale_id: checkoutCart.superseded_sale_id ?? null,
          order_discount: Number(checkoutCart.order_discount ?? 0) || 0,
          payment_method_code:
            body?.payment_method_code ??
            checkoutCart.payment_method_code ??
            editSourceSale?.payment_method_code ??
            null,
          ...(Array.isArray(checkoutCart.payment_adjustments) && checkoutCart.payment_adjustments.length
            ? { payment_adjustments: checkoutCart.payment_adjustments }
            : {}),
          ...checkoutCartFields,
        };
        const { sale: offlineSale } = await completeOfflineCashSale({
          cart: local,
          user,
          organization,
          cashAmount: isOfflineCredit
            ? cashPay
            : cashPay > 0
              ? cashPay
              : summarizeLocalPosCart(local, {
                  cashRound: enablePosCashRounding,
                }).amountDue,
          paymentMethodCode: method || body?.payment_method_code || "CASH",
          paymentSplits: Array.isArray(body?.payment_splits) ? body.payment_splits : null,
          isCreditSale: isOfflineCredit,
          paymentReference: body?.payment_reference ?? null,
          paymentDate: body?.payment_date ?? null,
          workflowStatus: body?.status ?? null,
          floatSessionId,
          cashRound: enablePosCashRounding,
        });
        const sale = annotateSaleWithReceiptTenders(
          offlineCashTendered > 0
            ? mergeSaleWithCheckoutPosTicket(
                offlineSale,
                activeCart,
                checkoutCartFields,
              )
            : mergeSaleWithCheckoutPosTicket(offlineSale, activeCart, checkoutCartFields),
          isPreviousOrderCashEdit ? null : body?.__receipt_tenders,
          isPreviousOrderCashEdit ? 0 : offlineCashTendered,
        );
        markSaleForReprint(sale);
        if (!(standalone && !options.skipAutoNextOrder)) {
          setCart(null);
        }
        setSelectedLineId(null);
        clearPosUiDraft();
        clearLineEntry();
        setStatusMessage(`Sale #${sale.order_num} saved — printing receipt…`);
        markServerCartConsumed(activeCart.id);
        if (isPreviousOrderCashEdit && standalone) {
          queueOutboxAfterSale(sale.order_num);
          await printRevisedPreviousOrderAndFocusNewOrder(sale);
          return { ...sale, _previous_order_edit_finished: true };
        }
        afterSaleCheckoutComplete(sale, options);
        queueOutboxAfterSale(sale.order_num);
        return sale;
      } catch (e) {
        setPaymentError(e?.message ?? "Offline checkout failed.");
        return null;
      } finally {
        setBusy(false);
      }
    }

    // Online External POS: sell → print → save local → background sync.
    // New sales with KRA on stay server-first (eTIMS QR). Previous-order edits always
    // use the IndexedDB outbox path below (or the dedicated block after this) so a
    // reprinted receipt cannot outrun the upload.
    const kraFiscalizeOnCheckout = shouldSubmitKraOnCheckout(
      capabilities?.module_settings,
      capabilities,
      summary?.total ?? summary?.amountDue,
    );
    if (
      standalone &&
      !offlineMode &&
      !activeCart.offline &&
      !activeCart.offline_client_sale_uuid &&
      (!kraFiscalizeOnCheckout || isPreviousOrderCashEdit) &&
      isLocalFirstCashCheckout(body) &&
      (!activeCart.held_order_num || isPreviousOrderCashEdit)
    ) {
      const cashPay = Number(body?.pay_now ?? summary?.amountDue ?? 0);
      const cashTendered = Number(body?.__cash_tendered ?? 0);
      const isLocalFirstCredit = Boolean(body?.is_credit_sale);
      if (
        !isLocalFirstCredit &&
        !isPreviousOrderCashEdit &&
        cashPay + 0.01 < Number(summary?.amountDue ?? 0)
      ) {
        setPaymentError(
          "Full payment required for Cash, M-Pesa, bank, and cheque. Select a credit customer to leave a balance unpaid or partially paid.",
        );
        return null;
      }
      setBusy(true);
      setPaymentError(null);
      setReceiptPrintStatus(null);
      try {
        const checkoutCart = cartRef.current ?? activeCart;
        const local = {
          id: isPreviousOrderCashEdit && isServerPosCartId(checkoutCart.id)
            ? checkoutCart.id
            : "active",
          lines: (checkoutCart.lines ?? []).map((l) => ({
            ...l,
            client_line_id: l.client_line_id ?? l.id,
          })),
          branch_id: checkoutCart.branch_id ?? user?.branch_id,
          till_id: tillId ?? checkoutCart.till_id,
          float_session_id: floatSessionId ?? checkoutCart.float_session_id,
          customer_num: body?.customer_num ?? checkoutCart.customer_num,
          customer_name_override:
            body?.customer_name_override ?? checkoutCart.customer_name_override,
          ...(String(body?.customer_kra_pin ?? "").trim()
            ? { customer_kra_pin: String(body.customer_kra_pin).trim() }
            : {}),
          held_order_num: checkoutCart.held_order_num ?? null,
          superseded_sale_id: checkoutCart.superseded_sale_id ?? null,
          offline_edit_snapshot:
            checkoutCart.offline_edit_snapshot ?? editSourceSale ?? null,
          order_discount: Number(checkoutCart.order_discount ?? 0) || 0,
          payment_method_code:
            body?.payment_method_code ??
            checkoutCart.payment_method_code ??
            editSourceSale?.payment_method_code ??
            null,
            ...(Array.isArray(checkoutCart.payment_adjustments) && checkoutCart.payment_adjustments.length
              ? { payment_adjustments: checkoutCart.payment_adjustments }
              : {}),
            ...checkoutCartFields,
          };
          const { sale: localSale } = await completeOfflineCashSale({
            cart: local,
            user,
            organization,
            cashAmount: isLocalFirstCredit
              ? cashPay
              : cashPay > 0
                ? cashPay
                : summarizeLocalPosCart(local, {
                    cashRound: enablePosCashRounding,
                  }).amountDue,
            paymentMethodCode: body?.payment_method_code || "CASH",
            paymentSplits: Array.isArray(body?.payment_splits) ? body.payment_splits : null,
            isCreditSale: isLocalFirstCredit,
            paymentReference: body?.payment_reference ?? null,
            paymentDate: body?.payment_date ?? null,
            workflowStatus: body?.status ?? null,
            floatSessionId,
            cashRound: enablePosCashRounding,
          });
          const sale = annotateSaleWithReceiptTenders(
            mergeSaleWithCheckoutPosTicket(localSale, activeCart, checkoutCartFields),
            isPreviousOrderCashEdit ? null : body?.__receipt_tenders,
            isPreviousOrderCashEdit ? 0 : cashTendered,
          );
          // New sales: release online cart line reservations. Previous-order edits keep
          // the edit cart so sync can PUT lines + checkout under the same order #.
          if (!isPreviousOrderCashEdit && isServerPosCartId(activeCart.id)) {
            markServerCartConsumed(activeCart.id);
            void apiRequest(`/sales/carts/${activeCart.id}/lines`, {
              method: "DELETE",
              loading: false,
              reportIssues: false,
            }).catch(() => {});
          }
          markSaleForReprint(sale);
          if (!(standalone && !options.skipAutoNextOrder)) {
            setCart(null);
          }
          setSelectedLineId(null);
          clearPosUiDraft();
          clearLineEntry();
          void clearPreviousOrderEditDraft().catch(() => {});
          if (isPreviousOrderCashEdit && standalone) {
            queueOutboxAfterSale(sale.order_num);
            await printRevisedPreviousOrderAndFocusNewOrder(sale);
            return { ...sale, _previous_order_edit_finished: true };
          }
          afterSaleCheckoutComplete(sale, options);
          queueOutboxAfterSale(sale.order_num);
          return sale;
        } catch (e) {
          // Previous-order edits must not fall through to TemporaryCart checkout —
          // that path can print the local draft without writing IndexedDB, so reopen
          // still shows the pre-edit receipt.
          if (isPreviousOrderCashEdit) {
            console.warn("Previous-order local outbox write failed", e);
            setPaymentError(
              e instanceof Error
                ? e.message
                : "Could not save this order edit for sync. Try again.",
            );
            return null;
          }
          // Fall through to normal online checkout if local-first fails.
          console.warn("Local-first cash checkout failed; using online checkout", e);
        } finally {
          setBusy(false);
        }
    }

    // Standalone previous-order finish must use IndexedDB outbox (never TemporaryCart).
    if (isPreviousOrderCashEdit && standalone) {
      setBusy(true);
      setPaymentError(null);
      setReceiptPrintStatus(null);
      try {
        const checkoutCart = cartRef.current ?? activeCart;
        const cashPay = Number(body?.pay_now ?? summary?.amountDue ?? 0);
        const isLocalFirstCredit = Boolean(body?.is_credit_sale);
        const local = {
          id: isServerPosCartId(checkoutCart.id) ? checkoutCart.id : "active",
          lines: (checkoutCart.lines ?? []).map((l) => ({
            ...l,
            client_line_id: l.client_line_id ?? l.id,
          })),
          branch_id: checkoutCart.branch_id ?? user?.branch_id,
          till_id: tillId ?? checkoutCart.till_id,
          float_session_id: floatSessionId ?? checkoutCart.float_session_id,
          customer_num: body?.customer_num ?? checkoutCart.customer_num,
          customer_name_override:
            body?.customer_name_override ?? checkoutCart.customer_name_override,
          ...(String(body?.customer_kra_pin ?? "").trim()
            ? { customer_kra_pin: String(body.customer_kra_pin).trim() }
            : {}),
          held_order_num: checkoutCart.held_order_num ?? null,
          superseded_sale_id: checkoutCart.superseded_sale_id ?? null,
          offline_edit_snapshot:
            checkoutCart.offline_edit_snapshot ?? editSourceSale ?? null,
          order_discount: Number(checkoutCart.order_discount ?? 0) || 0,
          payment_method_code:
            body?.payment_method_code ??
            checkoutCart.payment_method_code ??
            editSourceSale?.payment_method_code ??
            null,
          ...(Array.isArray(checkoutCart.payment_adjustments) &&
          checkoutCart.payment_adjustments.length
            ? { payment_adjustments: checkoutCart.payment_adjustments }
            : {}),
          ...checkoutCartFields,
        };
        const { sale: localSale } = await completeOfflineCashSale({
          cart: local,
          user,
          organization,
          cashAmount: isLocalFirstCredit
            ? cashPay
            : cashPay > 0
              ? cashPay
              : summarizeLocalPosCart(local, {
                  cashRound: enablePosCashRounding,
                }).amountDue,
          paymentMethodCode: body?.payment_method_code || "CASH",
          paymentSplits: Array.isArray(body?.payment_splits) ? body.payment_splits : null,
          isCreditSale: isLocalFirstCredit,
          paymentReference: body?.payment_reference ?? null,
          paymentDate: body?.payment_date ?? null,
          workflowStatus: body?.status ?? null,
          floatSessionId,
          cashRound: enablePosCashRounding,
        });
        const sale = annotateSaleWithReceiptTenders(
          mergeSaleWithCheckoutPosTicket(localSale, activeCart, checkoutCartFields),
          null,
          0,
        );
        markSaleForReprint(sale);
        if (!(standalone && !options.skipAutoNextOrder)) {
          setCart(null);
        }
        setSelectedLineId(null);
        clearPosUiDraft();
        clearLineEntry();
        void clearPreviousOrderEditDraft().catch(() => {});
        queueOutboxAfterSale(sale.order_num);
        await printRevisedPreviousOrderAndFocusNewOrder(sale);
        return { ...sale, _previous_order_edit_finished: true };
      } catch (e) {
        setPaymentError(
          e instanceof Error
            ? e.message
            : "Could not save this order edit for sync. Try again.",
        );
        return null;
      } finally {
        setBusy(false);
      }
    }

    setBusy(true);
    setPaymentError(null);
    setReceiptPrintStatus(null);
    try {
      // Previous-order edits stay local until pay — flush once here (one PUT), then checkout.
      if (
        isPreviousOrderEditSession(activeCart) &&
        !activeCart.offline &&
        !activeCart.offline_client_sale_uuid &&
        editedOrderHasLocalDraftChanges(activeCart)
      ) {
        const flushed = await flushEditedOrderDraftToServer();
        if (!flushed?.id) {
          setPaymentError("Could not save order changes before checkout. Try again.");
          return null;
        }
      }

      // Cash Sales #: do not send stale reserved-block tickets. Server allocates
      // saleMax+1 for this cashier/day (1,2,3…). Previous-order edits keep theirs.
      const onlinePosFields = isPreviousOrderCashEdit
        ? checkoutCartFields
        : {
            ...checkoutCartFields,
            pos_order_num: null,
            pos_order_date: checkoutCartFields.pos_order_date ?? todayPosOrderDate(),
          };

      const liveCart = cartRef.current ?? activeCart;
      const submitKra =
        options.forceSubmitKra != null
          ? Boolean(options.forceSubmitKra)
          : shouldSubmitKraOnCheckout(
              capabilities?.module_settings,
              capabilities,
              summary?.total,
            );
      if (liveCart?.held_order_num) {
        if (body.customer_num) {
          rememberPosOrderCustomer(liveCart.held_order_num, {
            name: body.customer_name_override,
            customerNum: body.customer_num,
          });
        } else if (body.customer_name_override) {
          rememberPosOrderCustomerName(liveCart.held_order_num, body.customer_name_override);
        }
      }

      const {
        __force_submit_kra: _ignoredForceKra,
        __cash_tendered: cashTendered,
        __receipt_tenders: receiptTenders,
        __previous_order_edit_adjustment: _editAdjFlag,
        ...checkoutInput
      } = body ?? {};
      // Do not send submit_kra:false — stale POS capabilities were skipping server-side
      // "Use KRA device for sales". Omit the field and let the API apply org finance policy;
      // only send true so the KRA wait UI still matches an expected fiscalized checkout.
      let checkoutBody = await attachDiscountApprovalReasonToCheckoutBody({
        ...checkoutInput,
        sales_workspace: salesWorkspace,
        ...(submitKra ? { submit_kra: true } : {}),
        ...(liveCart?.held_order_num ? { order_num: liveCart.held_order_num } : {}),
        ...(floatSessionId ? { float_session_id: floatSessionId } : {}),
        ...(onlinePosFields.pos_order_num != null
          ? { pos_order_num: onlinePosFields.pos_order_num }
          : {}),
        ...(onlinePosFields.pos_order_date && onlinePosFields.pos_order_num != null
          ? { pos_order_date: onlinePosFields.pos_order_date }
          : {}),
      });
      if (
        isPreviousOrderCashEdit &&
        kraFiscalizeOnPosCheckout &&
        body?.__previous_order_edit_adjustment
      ) {
        const delta = computePreviousOrderEditPaymentDelta(editSourceSale, liveCart, {
          cashRound: enablePosCashRounding,
        });
        checkoutBody = {
          ...checkoutBody,
          pay_now: 0,
          payment_adjustments: buildPaymentAdjustmentsFromCheckoutBody(checkoutBody, delta),
        };
      } else if (
        Array.isArray(liveCart?.payment_adjustments) &&
        liveCart.payment_adjustments.length
      ) {
        checkoutBody = {
          ...checkoutBody,
          payment_adjustments: liveCart.payment_adjustments,
        };
      }
      if (!checkoutBody) {
        setPaymentError("Enter a discount reason to save this order for manager approval.");
        return null;
      }
      const checkoutRequest = () =>
        apiRequest(`/sales/carts/${liveCart.id}/checkout`, {
          method: "POST",
          body: checkoutBody,
        });
      // Always use the blocking wait for online checkout. Server fiscalizes when
      // "Use KRA device for sales" is on even if this till's cached capabilities
      // still think KRA is off (previously that raced a short timeout and failed).
      let sale = await runBlockingTask(checkoutRequest, {
            message: "Completing sale…",
        detail: submitKra
          ? "Submitting receipt to the KRA device. Please wait."
          : "Please wait.",
        settleMs: 0,
      });
      sale = mergeSaleWithCheckoutPosTicket(sale, liveCart, onlinePosFields);
      if (sale?.pos_order_num != null) {
        void purgeReservedPosTicketsUpTo(sale.pos_order_num, sale.pos_order_date).catch(() => {});
        // Keep local Cash Sales counter aligned with server after online sale.
        void seedLocalPosTicketSeqFromSale(sale, floatSessionId).catch(() => {});
      }
      // Annotate with cashier-entered tenders + change so the receipt is correct
      // even when aligned payment_splits stored net (post-change) cash on the sale.
      // Keep payment_adjustments on the sale so top-up/return change resolves exactly.
      sale = annotateSaleWithReceiptTenders(
        checkoutBody.payment_adjustments?.length
          ? { ...sale, payment_adjustments: checkoutBody.payment_adjustments }
          : sale,
        receiptTenders,
        cashTendered,
      );

      // KRA soft-fail: sale is saved; print without fiscal QR and warn the cashier.
      const kraRow = sale?.kra_response ?? sale?.kraResponse;
      const kraStatus = String(kraRow?.status ?? "").toLowerCase();
      const kraSoftFailed =
        Boolean(sale?.kra_skipped) ||
        Boolean(sale?.kra_warning) ||
        kraStatus === "failed" ||
        kraStatus === "skipped";
      if (kraSoftFailed) {
        sale = { ...sale, _skip_kra_qr: true };
        const kraMsg =
          sale.kra_warning ||
          (kraStatus === "skipped"
            ? "Sale created without KRA (skipped)."
            : "Sale created without KRA due to an error with KRA device.");
        setStatusMessage(kraMsg);
        notifyError(kraMsg);
      }

      if (sale?.fulfillment_meta?.same_day_customer_append) {
        const label = formatPosBrowseLabel(sale);
        setStatusMessage(`Items added to customer order #${label}.`);
        if (standalone) {
          notifySuccess(`Items added to existing order #${label} for this customer.`);
        }
      }
      // Kick print before cart-clear state churn so HTML build starts immediately.
      markServerCartConsumed(liveCart?.id);
      if (isPreviousOrderCashEdit && standalone) {
        // Unreachable when the IndexedDB finish path above succeeds; keep as a
        // safety net so TemporaryCart checkout never prints without an outbox row.
        const live = cartRef.current;
        if (live && !editedOrderHasLocalDraftChanges(live)) {
          const dirty = withEditDraftDirty(live);
          cartRef.current = dirty;
          setCart(dirty);
        }
        markSaleForReprint(sale);
        setSelectedLineId(null);
        clearPosUiDraft();
        clearLineEntry();
        void clearPreviousOrderEditDraft().catch(() => {});
        setEditSourceSale(null);
        await printRevisedPreviousOrderAndFocusNewOrder(sale);
        return { ...sale, _previous_order_edit_finished: true };
      }
      afterSaleCheckoutComplete(sale, options);
      markSaleForReprint(sale);
      if (!(standalone && !options.skipAutoNextOrder)) {
        setCart(null);
      }
      setSelectedLineId(null);
      clearPosUiDraft();
      clearLineEntry();
      void clearPreviousOrderEditDraft().catch(() => {});
      if (!kraSoftFailed) {
        setStatusMessage(`Order #${sale.order_num} completed.`);
      }
      if (liveCart?.held_order_num) {
        setEditSourceSale(null);
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
        isKraProductNotRegisteredError(message) &&
        isKraDeviceConfigured(capabilities?.module_settings, capabilities)
      ) {
        const liveCart = cartRef.current ?? activeCart;
        const productCodes = productCodesFromCartLines(liveCart);
        if (productCodes.length) {
          kraCheckoutRetryRef.current = { body, options };
          const productLabels = [
            ...new Set(
              (liveCart?.lines ?? [])
                .filter((line) => line?.product_code)
                .map((line) => {
                  const code = String(line.product_code);
                  const name = String(line.product_name ?? "").trim();
                  return name ? `${code} — ${name}` : code;
                }),
            ),
          ];
          setKraUploadPrompt({ productCodes, productLabels });
          setKraUploadError(null);
        }
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

  /**
   * Write the current previous-order edit into the local outbox (awaited).
   * Does not wait for network upload — callers flush in the background.
   * @param {{ force?: boolean }} [options] force — queue even when leaving (F8 / browse)
   *   has set skipEditAutosaveRef (normal autosave stays skipped).
   * @returns {Promise<number|null>} held order num when queued
   */
  async function queuePreviousOrderEditOutboxNow({ force = false } = {}) {
    if (!standalone) return null;
    if (!force && skipEditAutosaveRef.current) return null;
    const cartNow = cartRef.current;
    if (!cartNow?.held_order_num || !cartNow?.superseded_sale_id) return null;
    if (isFreshWorkspacePlaceholder(cartNow)) return null;
    if (cartNow.offline || cartNow.offline_client_sale_uuid) return null;
    if (!editedOrderHasLocalDraftChanges(cartNow)) return null;
    const lines = (cartNow.lines ?? []).filter(
      (l) => Number(l.quantity ?? 0) > 0 && l.product_code,
    );
    const allowEmptyRevision =
      Boolean(cartNow._editDraftDirty) && (cartNow.lines?.length ?? 0) === 0;
    if (!lines.length && !allowEmptyRevision) return null;

    let cartForSync = cartNow;
    cartForSync = await ensurePreviousOrderPaymentAdjustment(cartNow);

    const local = {
      ...cartForSync,
      id: isServerPosCartId(cartForSync.id) ? cartForSync.id : cartForSync.id,
      lines: (cartForSync.lines ?? [])
        .filter((l) => Number(l.quantity ?? 0) > 0 && l.product_code)
        .map((l) => ({
          ...l,
          client_line_id: l.client_line_id ?? l.id,
        })),
      branch_id: cartForSync.branch_id ?? user?.branch_id,
      till_id: cartForSync.till_id ?? tillId,
      float_session_id: floatSessionId ?? cartForSync.float_session_id,
      order_discount: Number(cartForSync.order_discount ?? 0) || 0,
      customer_num:
        cartForSync.customer_num ??
        editSourceSale?.customer_num ??
        editSourceSale?.customer?.customer_num ??
        null,
      customer_name_override:
        String(
          cartForSync.customer_name_override ??
            editSourceSale?.customer_name_override ??
            editSourceSale?.customer?.customer_name ??
            "",
        ).trim() || null,
      payment_method_code:
        cartForSync.payment_method_code ??
        editSourceSale?.payment_method_code ??
        null,
    };
    await upsertPreviousOrderEditOutbox({
      cart: local,
      user,
      organization,
      floatSessionId,
      cashAmount: summarizeLocalPosCart(local, {
        cashRound: enablePosCashRounding,
      }).amountDue,
      cashRound: enablePosCashRounding,
    });
    {
      const live = cartRef.current;
      if (live && isServerPosCartId(live.id)) {
        const detached = detachPreviousOrderEditCartId(live);
        cartRef.current = detached;
        setCart(detached);
        void savePreviousOrderEditDraft(detached).catch(() => {});
      }
    }
    void refreshOfflineCounts();
    return cartNow.held_order_num;
  }

  /**
   * Background outbox flush + optional cart refresh if still on the same edit.
   */
  function flushPreviousOrderEditOutboxInBackground(queuedHeldOrderNum, workspaceGeneration) {
    if (queuedHeldOrderNum == null) return;
    void (async () => {
      try {
        const { results } = await flushOutboxAfterSale();
        for (const row of results ?? []) {
          if (skipEditAutosaveRef.current) break;
          if (
            workspaceGeneration != null &&
            freshWorkspaceGenerationRef.current !== workspaceGeneration
          ) {
            break;
          }
          if (
            row?.ok &&
            row.sync_kind === "previous_order_edit" &&
            row.sale?.id &&
            (Number(row.order_num) === Number(queuedHeldOrderNum) ||
              Number(row.printed_order_num) === Number(queuedHeldOrderNum) ||
              Number(row.sale?.order_num) === Number(queuedHeldOrderNum))
          ) {
            await refreshPreviousOrderEditCartAfterSync(row.sale, { workspaceGeneration });
          }
        }
        const afterCart = cartRef.current;
        if (
          skipEditAutosaveRef.current ||
          (workspaceGeneration != null &&
            freshWorkspaceGenerationRef.current !== workspaceGeneration) ||
          isFreshWorkspacePlaceholder(afterCart)
        ) {
          return;
        }
        if (
          afterCart?.held_order_num != null &&
          Number(afterCart.held_order_num) === Number(queuedHeldOrderNum) &&
          !editedOrderHasLocalDraftChanges(afterCart)
        ) {
          const syncedMsg = previousOrderEditModeMessages(queuedHeldOrderNum, {
            kraFiscalize: shouldSubmitKraOnCheckout(
              capabilities?.module_settings,
              capabilities,
              summarizeLocalPosCart(afterCart)?.total ??
                summarizeLocalPosCart(afterCart)?.amountDue,
            ),
          }).synced;
          if (syncedMsg) {
            posSnackbar(syncedMsg);
          }
        }
      } catch (e) {
        console.warn("Previous-order edit background sync failed", e);
      }
    })();
  }

  /**
   * Previous-order edits: debounce local outbox upsert (~30s after last change), then
   * flush in the background. Never blocks the till on network/KRA upload.
   */
  function scheduleEditedOrderAutosave({ immediate = false } = {}) {
    if (!standalone) return;
    if (skipEditAutosaveRef.current) return;
    const activeCart = cartRef.current;
    if (!activeCart?.held_order_num || !activeCart?.superseded_sale_id) return;
    if (activeCart.offline || activeCart.offline_client_sale_uuid) return;

    if (!editedOrderHasLocalDraftChanges(activeCart)) return;
    const hasPositiveLines = (activeCart.lines ?? []).some(
      (l) => Number(l.quantity ?? 0) > 0 && l.product_code,
    );
    const allowEmptyRevision =
      Boolean(activeCart._editDraftDirty) && (activeCart.lines?.length ?? 0) === 0;
    if (!hasPositiveLines && !allowEmptyRevision) return;

    if (editAutosaveTimerRef.current) {
      window.clearTimeout(editAutosaveTimerRef.current);
      editAutosaveTimerRef.current = null;
    }

    if (editAutosaveInFlightRef.current) {
      editAutosaveRerunRef.current = { immediate };
      return;
    }

    const delayMs = immediate ? 0 : PREVIOUS_ORDER_EDIT_SYNC_DEBOUNCE_MS;
    const runEditedOrderAutosave = () => {
      void (async () => {
        const workspaceGeneration = freshWorkspaceGenerationRef.current;
        if (skipEditAutosaveRef.current) return;

        editAutosaveInFlightRef.current = true;
        setEditAutosaveBusy(true);
        let queuedHeldOrderNum = null;
        try {
          queuedHeldOrderNum = await queuePreviousOrderEditOutboxNow();
          if (queuedHeldOrderNum != null) {
            const cartLabel = formatPosBrowseLabel(
              cartRef.current ?? { held_order_num: queuedHeldOrderNum },
            );
            setStatusMessage(
              `Cash Sales #${cartLabel} queued — syncing in background (Alt+P to reprint)`,
            );
          }
        } catch (e) {
          if (!(e instanceof Error && /cancel/i.test(e.message))) {
            console.warn("Previous-order edit autosave failed", e);
            setStatusMessage(
              e?.message
                ? `Could not queue order sync: ${e.message}`
                : "Could not queue order sync.",
            );
          }
        } finally {
          editAutosaveInFlightRef.current = false;
          setEditAutosaveBusy(false);
          const rerun = editAutosaveRerunRef.current;
          editAutosaveRerunRef.current = null;
          if (rerun && !skipEditAutosaveRef.current) {
            scheduleEditedOrderAutosave(rerun);
          }
        }

        flushPreviousOrderEditOutboxInBackground(queuedHeldOrderNum, workspaceGeneration);
      })();
    };

    if (delayMs <= 0) {
      runEditedOrderAutosave();
      return;
    }

    editAutosaveTimerRef.current = window.setTimeout(() => {
      editAutosaveTimerRef.current = null;
      runEditedOrderAutosave();
    }, delayMs);
  }

  /**
   * After previous-order payment methods are chosen: reprint the revised receipt,
   * then clear to a blank new order and focus scan. Sync continues in the background.
   * Callers must already have written the IndexedDB outbox (completeOfflineCashSale /
   * queuePreviousOrderEditOutboxNow) before invoking this — print alone does not persist.
   */
  async function printRevisedPreviousOrderAndFocusNewOrder(saleLike = null) {
    // Capture edit identity up front — queue/detach/sync must not prevent the clear.
    const editCartSnapshot = cartRef.current;
    const wasPreviousOrderEdit = Boolean(
      editCartSnapshot?.held_order_num && editCartSnapshot?.superseded_sale_id,
    );
    const finishGeneration = wasPreviousOrderEdit
      ? ++freshWorkspaceGenerationRef.current
      : freshWorkspaceGenerationRef.current;
    if (wasPreviousOrderEdit) {
      skipEditAutosaveRef.current = true;
    }

    // Last-resort: if the workspace is still a dirty previous-order edit, persist
    // before printing/clearing so reopen cannot show the pre-edit receipt.
    if (
      standalone &&
      wasPreviousOrderEdit &&
      editedOrderHasLocalDraftChanges(editCartSnapshot)
    ) {
      try {
        // Allow the forced outbox write even though skipEditAutosaveRef is latched.
        const queuedHeldOrderNum = await queuePreviousOrderEditOutboxNow({ force: true });
        if (queuedHeldOrderNum == null) {
          skipEditAutosaveRef.current = false;
          notifyError(
            "Could not save this order edit for sync. Receipt was not printed.",
          );
          return;
        }
        flushPreviousOrderEditOutboxInBackground(queuedHeldOrderNum, finishGeneration);
      } catch (e) {
        skipEditAutosaveRef.current = false;
        notifyError(
          e instanceof Error
            ? e.message
            : "Could not save this order edit for sync. Receipt was not printed.",
        );
        return;
      }
    }

    const editSnapshot =
      editCartSnapshot?.held_order_num && editCartSnapshot?.superseded_sale_id
        ? buildPreviousOrderEditPrintSale(editCartSnapshot, {
            user,
            organization,
            sourceSale: editSourceSale,
          })
        : cartRef.current?.held_order_num && cartRef.current?.superseded_sale_id
          ? buildPreviousOrderEditPrintSale(cartRef.current, {
              user,
              organization,
              sourceSale: editSourceSale,
            })
          : null;
    const sale = editSnapshot ?? saleLike;
    const cashSalesLabel = formatCashSalesNumber(sale);
    const orderLabel =
      cashSalesLabel !== "—"
        ? cashSalesLabel
        : sale?.order_num
          ? `#${sale.order_num}`
          : "";

    setReceiptPrintStatus("pending");
    const loadingToastId = toast.loading(
      orderLabel ? `Printing receipt ${orderLabel}…` : "Printing revised receipt…",
    );
    try {
      if (sale?.id || sale?.order_num || sale?.items?.length) {
        const skipKraQr =
          Boolean(sale?._skip_kra_qr) ||
          Boolean(sale?.kra_skipped) ||
          kraEditBackgroundFiscalize;
        const result = await printSaleOrder(
          sale?._skip_kra_qr || kraEditBackgroundFiscalize
            ? { ...sale, _skip_kra_qr: true }
            : sale,
          fastPosPrintOptions(sale, {
            capabilities,
            organization,
            organizationName: capabilities?.profile_label,
            uomById,
            productByCode,
            user,
            preparedBy: user?.full_name ?? user?.username ?? null,
            documentType:
              resolveOrderPrintDocumentType(capabilities?.module_settings) ?? "receipt",
            kraReceipt: skipKraQr ? null : (sale.kra_response ?? sale.kraResponse ?? null),
            allowKraNetwork: false,
          }),
        );
        if (!result) {
          setReceiptPrintStatus("failed");
          toast.error("Print cancelled or no format was selected.", { id: loadingToastId });
        } else {
          setReceiptPrintStatus("printed");
          toast.success(
            orderLabel
              ? `Receipt ${orderLabel} printed. Ready for next order.`
              : "Revised receipt printed. Ready for next order.",
            { id: loadingToastId },
          );
        }
      } else {
        toast.dismiss(loadingToastId);
      }
    } catch (e) {
      setReceiptPrintStatus("failed");
      toast.error(e instanceof Error ? e.message : "Receipt print failed", {
        id: loadingToastId,
      });
    }

    setPaymentOpen(false);
    setPaymentError(null);
    if (standalone && wasPreviousOrderEdit) {
      await clearWorkspaceAfterPreviousOrderPrint({
        force: true,
        heldOrderNum: editCartSnapshot.held_order_num,
        supersededSaleId: editCartSnapshot.superseded_sale_id,
        workspaceGeneration: finishGeneration,
      });
    } else if (classicLayout) {
      focusClassicProductSearch();
    } else {
      focusProductSearch();
    }
  }

  /**
   * After Alt+P finishes a previous-order edit: clear to a blank new order without
   * another confirm. Sync (already queued) continues in the background.
   */
  async function clearWorkspaceAfterPreviousOrderPrint(options = {}) {
    const {
      force = false,
      heldOrderNum = null,
      supersededSaleId = null,
      workspaceGeneration = null,
    } = options;
    const activeCart = cartRef.current ?? cart;
    const held = activeCart?.held_order_num ?? heldOrderNum;
    const superseded = activeCart?.superseded_sale_id ?? supersededSaleId;
    if (!force && (!held || !superseded)) return;
    if (!held && !superseded && !force) return;

    skipEditAutosaveRef.current = true;
    if (editAutosaveTimerRef.current) {
      window.clearTimeout(editAutosaveTimerRef.current);
      editAutosaveTimerRef.current = null;
    }

    const deleteCartId = isServerPosCartId(activeCart?.id) ? Number(activeCart.id) : null;
    if (deleteCartId) markServerCartConsumed(deleteCartId);

    // Refresh today's session tickets before picking the next Cash Sales # — otherwise
    // we land on last issued (e.g. 19) instead of last+1 (20) and cashiers must F8.
    let ordersForSeq = sessionPosOrders;
    try {
      const refreshed = await loadCompletedPosOrders();
      if (Array.isArray(refreshed) && refreshed.length) {
        ordersForSeq = refreshed;
      }
    } catch {
      /* keep current browse list */
    }

    // Sequence as a blank workspace — the edit cart's pos_order_num / TemporaryCart
    // next_pos_order_num must not pin the next ticket to the wrong number.
    const sequencingCart = {
      id: "pending-fresh",
      lines: [],
      channel: activeCart?.channel,
      order_source: activeCart?.order_source,
      branch_id: activeCart?.branch_id,
      till_id: activeCart?.till_id,
      float_session_id: activeCart?.float_session_id ?? floatSessionId,
    };
    const peekNextPos = await resolveNextPosTicketForWorkspace(
      sequencingCart,
      ordersForSeq,
      null,
      { skipServerReseed: true, floatSessionId },
    );
    const contextNext =
      offlineNextPosOrderNum != null && Number(offlineNextPosOrderNum) > 0
        ? Number(offlineNextPosOrderNum)
        : null;
    const nextPos =
      [peekNextPos, contextNext]
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
        .reduce((max, n) => (n > max ? n : max), 0) || peekNextPos;
    // Invalidate in-flight previous-order sync refresh so it cannot repaint this edit.
    const generation =
      workspaceGeneration != null &&
      Number(workspaceGeneration) === Number(freshWorkspaceGenerationRef.current)
        ? Number(workspaceGeneration)
        : ++freshWorkspaceGenerationRef.current;

    setEditSourceSale(null);
    setCompletedSale(null);
    setOrderEditError(null);
    setEditBrowseIndex(0);
    clearClassicLineSelection();
    clearLineEntry();
    orderNoUserEditedRef.current = false;
    applyFreshWorkspacePlaceholder(activeCart, nextPos);
    setStatusMessage("New order — previous edits sync in the background.");
    void clearPreviousOrderEditDraft().catch(() => {});
    void clearLocalPosCart().catch(() => {});

    // Await line clear before bootstrap so TemporaryCart cannot reload the edited receipt.
    const clearPromise =
      deleteCartId != null
        ? apiRequest(`/sales/carts/${deleteCartId}/lines`, {
            method: "DELETE",
            loading: false,
            reportIssues: false,
          }).catch(() => null)
        : Promise.resolve(null);

    void flushOutboxNow();

    // Soft bootstrap — do not block the till; first scan creates/loads a TemporaryCart.
    void (async () => {
      try {
        await clearPromise;
        if (generation !== freshWorkspaceGenerationRef.current) return;
        const next = await loadCashierCart({
          skipEditDraftRestore: true,
          applyState: false,
        });
        if (generation !== freshWorkspaceGenerationRef.current) return;
        let cleaned = stripOfflineSaleMarkers(stripPreviousOrderEditSession(next));
        if (
          deleteCartId != null &&
          (Number(cleaned?.id) === Number(deleteCartId) ||
            (isServerPosCartId(cleaned?.id) && isServerCartConsumed(cleaned.id)))
        ) {
          cleaned = {
            ...cleaned,
            lines: [],
            held_order_num: null,
            superseded_sale_id: null,
            order_discount: 0,
            payment_adjustments: undefined,
            _editDraftDirty: undefined,
          };
        }
        // Never reattach a previous-order session after a successful edit print.
        cleaned = stripPreviousOrderEditSession({
          ...cleaned,
          lines: Array.isArray(cleaned?.lines) ? cleaned.lines : [],
          payment_adjustments: undefined,
          _editDraftDirty: undefined,
        });
        if ((cleaned.lines?.length ?? 0) > 0) {
          cleaned = { ...cleaned, lines: [] };
        }
        const live = cartRef.current;
        if (generation !== freshWorkspaceGenerationRef.current) return;
        // Sync refresh may have repainted the old edit over the placeholder — wipe again.
        if (
          live &&
          !isFreshWorkspacePlaceholder(live) &&
          ((live.lines?.length ?? 0) > 0 ||
            live.held_order_num ||
            live.superseded_sale_id ||
            live.offline_client_sale_uuid)
        ) {
          const stillSameEdit =
            (held != null && Number(live.held_order_num) === Number(held)) ||
            (superseded != null && Number(live.superseded_sale_id) === Number(superseded));
          if (stillSameEdit || isPreviousOrderEditSession(live)) {
            applyFreshWorkspacePlaceholder(live, nextPos);
          } else if ((live.lines?.length ?? 0) > 0) {
            // Cashier already started a real new order — leave it.
            return;
          }
        }
        const merged = mergeFreshWorkspaceCart(
          isFreshWorkspacePlaceholder(cartRef.current)
            ? cleaned
            : stripPreviousOrderEditSession({ ...cleaned, lines: [] }),
          nextPos,
        );
        if (generation !== freshWorkspaceGenerationRef.current) return;
        cartRef.current = merged;
        setCart(merged);
        const displayPos =
          resolvePosNextBrowseNumber(merged) ??
          (nextPos != null ? nextPos : null);
        setEditOrderNo(displayPos != null ? String(displayPos) : "");
      } catch {
        /* placeholder remains — next scan will ensureCart */
      } finally {
        if (generation === freshWorkspaceGenerationRef.current) {
          skipEditAutosaveRef.current = false;
        }
      }
    })();

    if (classicLayout) {
      focusClassicProductSearch();
    } else {
      focusProductSearch();
    }
  }

  /**
   * Push draft cart lines to the open edit cart on the server in one PUT.
   * Returns the refreshed cart, or null on failure.
   */
  async function flushEditedOrderDraftToServer() {
    const activeCart = cartRef.current;
    if (!activeCart?.held_order_num || !isPreviousOrderEditSession(activeCart)) return null;
    const draftLines = (activeCart.lines ?? []).filter(
      (line) => Number(line.quantity ?? 0) > 0 && line.product_code,
    );
    if (!draftLines.length && !(activeCart.lines ?? []).some((line) => line.product_code)) {
      flashPosShortcutMessage("Add items before completing this order.");
      return null;
    }

    setLineBusy(true);
    try {
      const targetCartId = await resolvePreviousOrderEditServerCartId(activeCart);
      if (!targetCartId) {
        flashPosShortcutMessage("Could not open the server cart for this edit. Try again.");
        return null;
      }
      const updated = await apiRequest(`/sales/carts/${targetCartId}/lines`, {
        method: "PUT",
        body: {
          lines: draftLines.map((line) => {
            const qty = Math.max(0.0001, Number(line.quantity) || 0);
            const unitPrice = Number(line.unit_price ?? line.price ?? 0);
            return {
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
              amount: line.amount != null ? Number(line.amount) : undefined,
            };
          }),
          order_discount: Number(activeCart.order_discount ?? 0) || 0,
        },
        ...POS_CART_REQUEST,
      });
      const nextCart = stripPreviousOrderDraftMarkers({
        ...applyCartMutationResponse(
          { ...activeCart, id: targetCartId },
          updated,
        ),
        held_order_num: activeCart.held_order_num,
        superseded_sale_id: activeCart.superseded_sale_id,
      });
      cartRef.current = nextCart;
      setCart(nextCart);
      void clearPreviousOrderEditDraft().catch(() => {});
      return nextCart;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Could not save order changes");
      return null;
    } finally {
      setLineBusy(false);
    }
  }

  async function handleMpesaOrderComplete(updatedCart, options = {}) {
    if (standalone && (offlineMode || cartRef.current?.offline)) {
      flashPosShortcutMessage(
        "M-Pesa prompt is unavailable offline. Enter cash amount manually to complete the sale.",
      );
      setPaymentOpen(true);
      return null;
    }
    const payNow = Number(updatedCart?.mpesa_payment_amount ?? cartRef.current?.mpesa_payment_amount ?? 0);
    if (payNow <= 0) return null;

    const summary = cartSummaryRef.current ?? cartSummary;
    const total =
      Number(summary?.total ?? 0) > 0
        ? Number(summary.total)
        : Number(summary?.amountDue ?? 0) + payNow;
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
      payment_reference: updatedCart?.mpesa_transaction_code ?? cartRef.current?.mpesa_transaction_code ?? null,
      status,
      is_credit_sale: false,
      deduct_stock: true,
    };

    const mpesaCustomerName = String(options.customerName ?? "").trim();
    if (mpesaCustomerName) {
      body.customer_name_override = mpesaCustomerName;
    } else if (posSalesConfig.enableCheckoutCustomerName) {
      body.customer_name_override = "Walk-in";
    }

    const sale = await handleCheckout(body);
    if (sale) {
      if (!standalone) {
        clearLineEntry();
        await loadCashierCart();
        setStatusMessage(
          `Order #${sale.order_num} completed — M-Pesa ${formatSaleKes(payNow)} received. Ready for next order.`,
        );
        window.requestAnimationFrame(() => {
          searchInputRef.current?.focus({ preventScroll: true });
        });
      }
    }
    return sale ?? null;
  }

  async function handleSaveOrder({
    walkIn,
    walkInName,
    customer,
    hold = false,
    heldAmountPaid,
    heldPaymentMethodCode,
  } = {}) {
    const activeCartEarly = cartRef.current ?? cart;
    if (!(activeCartEarly?.lines?.length > 0)) {
      const message = hold
        ? "Add items before holding this order."
        : "Add items before saving this order.";
      setSaveOrderError(message);
      flashPosShortcutMessage(message);
      return;
    }
    if (!hold && !activeCartEarly?.id) {
      const message = "Add items before saving this order.";
      setSaveOrderError(message);
      flashPosShortcutMessage(message);
      return;
    }
    if (!hold && posSalesConfig.showCheckoutOnCreate) {
      setSaveOrderError("Save order is disabled while checkout on create order is enabled.");
      return;
    }

    // Hold parks IndexedDB from the live workspace — do not wait on line POSTs
    // (that only matters for server checkout / save-order).
    if (!hold) {
      await waitForCartLineSavesToFinish();
    }

    setBusy(true);
    setSaveOrderError(null);
    setStatusMessage(null);
    try {
      const activeCart = cartRef.current ?? cart;
      if (!(activeCart?.lines?.length > 0)) {
        const message = hold
          ? "Add items before holding this order."
          : "Add items before saving this order.";
        setSaveOrderError(message);
        flashPosShortcutMessage(message);
        return;
      }

      // Hold stays on this till (IndexedDB) — offline-safe, no sale order_num.
      if (hold) {
        const holdWalkInName = walkInName?.trim()
          ? walkInName.trim().toUpperCase()
          : "Walk-in";
        const park = await parkCartLocally(activeCart, {
          walkIn: Boolean(walkIn) || !customer,
          walkInName: holdWalkInName,
          customer: walkIn ? null : customer,
          cashierId: user?.id ?? null,
          branchId: activeCart.branch_id ?? user?.branch_id ?? null,
          tillId: activeCart.till_id ?? null,
          floatSessionId: activeCart.float_session_id ?? floatSessionId ?? null,
          ...(heldAmountPaid != null
            ? {
                heldAmountPaid,
                heldPaymentMethodCode: heldPaymentMethodCode || "CASH",
              }
            : {}),
        });
        // Unlock till immediately — server DELETE / next cart bootstrap run in background.
        setBusy(false);
        await clearWorkspaceAfterLocalHold(activeCart);
        const who = walkIn
          ? holdWalkInName
          : customer?.customer_name;
        const whoSuffix = who ? ` for ${who}` : "";
        const successText = `Order held${whoSuffix} — ${park.hold_label}. Ready for next sale.`;
        if (standalone) {
          notifySuccess(successText);
        } else {
          setStatusMessage(successText);
        }
        void loadHeldOrdersCount();
        return;
      }

      if (!activeCart?.id) return;

      const body = {
        status: resolveSaveOrderStatus({ channel, workflow: channelWorkflow }),
        pay_now: 0,
        is_credit_sale: false,
        deduct_stock: true,
        save_only: true,
      };
      if (walkIn) {
        body.customer_name_override = walkInName?.trim()
          ? walkInName.trim().toUpperCase()
          : "Walk-in";
      } else if (customer) {
        body.customer_num = customer.customer_num;
        body.customer_name_override = customer.customer_name;
      }
      if (activeCart?.held_order_num) {
        if (walkIn) {
          rememberPosOrderCustomerName(activeCart.held_order_num, body.customer_name_override);
        } else if (customer) {
          rememberPosOrderCustomer(activeCart.held_order_num, {
            name: customer.customer_name,
            customerNum: customer.customer_num,
          });
        }
      }
      const checkoutBody = await attachDiscountApprovalReasonToCheckoutBody({
        ...body,
        sales_workspace: salesWorkspace,
        ...(activeCart?.held_order_num ? { order_num: activeCart.held_order_num } : {}),
        ...(floatSessionId ? { float_session_id: floatSessionId } : {}),
      });
      if (!checkoutBody) {
        setSaveOrderError("Enter a discount reason to save this order for manager approval.");
        return;
      }
      const sale = await apiRequest(`/sales/carts/${activeCart.id}/checkout`, {
        method: "POST",
        body: checkoutBody,
      });
      markSaleForReprint(sale);
      setSaveOrderOpen(false);
      clearPosUiDraft();
      clearLineEntry();
      setSelectedLineId(null);
      setCart(null);
      cartRef.current = null;
      void clearPreviousOrderEditDraft().catch(() => {});

      const who = walkIn
        ? walkInName?.trim()
          ? walkInName.trim().toUpperCase()
          : "Walk-in"
        : customer?.customer_name;
      const whoSuffix = who ? ` for ${who}` : "";
      const successText = `Order saved${whoSuffix} — #${sale.order_num} (${sale.status}). Ready for next sale.`;
      if (standalone) {
        notifySuccess(successText);
      } else {
        setStatusMessage(successText);
      }

      // Unblock the till immediately — refresh next cart in the background.
      void (async () => {
        try {
          await loadCashierCart();
        } catch {
          /* next scan / F8 still works; cart remounts on demand */
        }
      })();
    } catch (e) {
      if (isAbortError(e)) return;
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
    const activeCart = cartRef.current ?? cart;
    if (!(activeCart?.lines?.length > 0)) {
      flashPosShortcutMessage(
        mode === "hold"
          ? "Add items before holding this order."
          : "Add items before saving this order.",
      );
      return;
    }
    setSaveOrderError(null);
    // Drop Alt grace immediately — openSaveOrderDialog is reached via Alt+H and the
    // next keystrokes are often the walk-in name (H/P must not re-fire shortcuts).
    clearPosAltLatch();
    // External POS only: org setting off → hold/save immediately as Walk-in.
    // Backoffice Create order always prompts for walk-in name or existing customer.
    if (standalone && !posSalesConfig.enableCheckoutCustomerName) {
      void handleSaveOrder({
        walkIn: true,
        walkInName: "Walk-in",
        hold: mode === "hold",
      });
      return;
    }
    setOrderDialogMode(mode);
    // Sync ref before paint so a latched P/H before re-render cannot fire Alt+P/H.
    posShortcutStateRef.current = {
      ...posShortcutStateRef.current,
      saveOrderOpen: true,
    };
    setSaveOrderOpen(true);
  }

  const focusProductSearchRef = useRef(() => {});
  focusProductSearchRef.current = () => {
    // Keep cart lines; only reset the entry/scan row and focus Scan code.
    clearLineEntry();
    focusClassicProductSearch();
  };
  const focusProductSearch = useCallback(() => {
    focusProductSearchRef.current();
  }, []);

  /**
   * F8 / empty-space double-click: clear workspace and focus scan for a new order.
   * Esc during previous-order edit: `{ discardPreviousOrderEdit: true }` — abandon the
   * draft (no outbox sync), leave the original receipt as sold, open a blank workspace.
   */
  async function startFreshWorkspace(options = {}) {
    const discardPreviousOrderEdit = Boolean(options.discardPreviousOrderEdit);
    if (paymentOpen) {
      const message = "Close the payment dialog first (complete or cancel), then start a new order.";
      setStatusMessage(message);
      if (standalone) notifyError(message);
      return;
    }
    // Overlapping prepare-next from checkout — wait for it, then this F8 is a no-op on blank cart.
    if (preparingNextOpen) {
      return;
    }
    if (freshWorkspaceInFlightRef.current) return;
    freshWorkspaceInFlightRef.current = true;
    try {
    // Finish in-flight line saves first (same as F10). A silent return while lineBusy
    // made F8 look like it needed two presses right after a scan.
    // Discard-Esc skips waiting — TemporaryCart is deleted and autosave is suppressed.
    if (lineBusyRef.current && !discardPreviousOrderEdit) {
      try {
        await runBlockingTask(waitForCartLineSavesToFinish, {
          message: "Saving cart changes…",
          detail: "Please wait while the current line finishes saving.",
        });
      } catch {
        return;
      }
    }

    const hasLines = (cartRef.current?.lines?.length ?? cart?.lines?.length ?? 0) > 0;
    const activeCart = cartRef.current ?? cart;
    const editingPrevious = Boolean(activeCart?.held_order_num && activeCart?.superseded_sale_id);
    const activeOfflineEdit = isActiveOfflineEditSession(activeCart);
    const editingQueuedOfflineSale = Boolean(
      activeOfflineEdit &&
        activeCart?.offline_client_sale_uuid &&
        !activeCart?.superseded_sale_id,
    );

    // Esc discard only applies while a previous-order edit is open.
    if (discardPreviousOrderEdit && !editingPrevious) {
      return;
    }

    // Don't block "leave previous order / clear lines" on unrelated busy flags — that
    // forced cashiers to press F8 twice. Checkout already gates on paymentOpen above.
    if (
      busy &&
      !editAutosaveInFlightRef.current &&
      !offlineSyncing &&
      !hasLines &&
      !editingPrevious &&
      !activeOfflineEdit
    ) {
      const message = "POS is busy — try New order (F8) again in a moment.";
      setStatusMessage(message);
      if (standalone) notifyError(message);
      return;
    }
    if (editAutosaveTimerRef.current) {
      window.clearTimeout(editAutosaveTimerRef.current);
      editAutosaveTimerRef.current = null;
    }
    skipEditAutosaveRef.current = true;
    setPendingSyncOpen(false);

    const issuedPosMax = await peekIssuedPosTicketMax(null, floatSessionId).catch(() => null);
    const hasPendingOutbox = pendingSync > 0 || failedSyncOrders.length > 0;

    // Already on a blank new order at last+1 (e.g. after F10) — F8 must not bump again.
    // When outbox still holds a ticket, always run bootstrap so the # advances past it.
    if (!hasLines && !editingPrevious && !activeOfflineEdit && !hasPendingOutbox) {
      const expectedNext = resolveFreshWorkspacePosNum(
        activeCart,
        sessionPosOrders,
        null,
        issuedPosMax,
      );
      const showing =
        resolvePosNextBrowseNumber(activeCart) ?? resolvePosBrowseNumber(activeCart);
      if (
        expectedNext != null &&
        showing != null &&
        Number(showing) === Number(expectedNext)
      ) {
        skipEditAutosaveRef.current = false;
        clearLineEntry();
        focusProductSearch();
        setStatusMessage("New order — scan or search a product.");
        return;
      }
    }

    if (discardPreviousOrderEdit && editingPrevious) {
      if (editedOrderHasLocalDraftChanges(activeCart)) {
        const orderLabel = activeCart.held_order_num != null
          ? String(activeCart.held_order_num)
          : "";
        const ok = await confirm({
          title: "Cancel previous-order edit",
          message: orderLabel
            ? `Discard changes to order ${orderLabel}? Items and quantities stay as on the original receipt, and a new order workspace opens.`
            : "Discard changes to this previous order? Items and quantities stay as on the original receipt, and a new order workspace opens.",
          confirmLabel: "Discard edits",
          cancelLabel: "Keep editing",
          destructive: true,
        });
        if (!ok) {
          skipEditAutosaveRef.current = false;
          return;
        }
      }
      // Drop local draft + any queued previous_order_edit so Esc never uploads the revise.
      const orderNum = Number(activeCart.held_order_num);
      const editUuid =
        activeCart.offline_client_sale_uuid != null &&
        String(activeCart.offline_client_sale_uuid).trim()
          ? String(activeCart.offline_client_sale_uuid).trim()
          : null;
      const prevEditUuid =
        Number.isFinite(orderNum) && orderNum > 0 ? `prev-edit-${orderNum}` : null;
      if (editUuid) await idbDeleteOutboxSale(editUuid).catch(() => {});
      if (prevEditUuid && prevEditUuid !== editUuid) {
        await idbDeleteOutboxSale(prevEditUuid).catch(() => {});
      }
      await clearPreviousOrderEditDraft().catch(() => {});
      setReplacingLineId(null);
      replacingLineIdRef.current = null;
    } else if (hasLines || editingPrevious || activeOfflineEdit) {
      const editSummary = summarizeLocalPosCart(activeCart);
      const kraFiscalize = editingPrevious
        ? shouldSubmitKraOnCheckout(
            capabilities?.module_settings,
            capabilities,
            editSummary?.total ?? editSummary?.amountDue,
          )
        : false;
      const leaveMsgs = editingPrevious
        ? previousOrderEditModeMessages(activeCart.held_order_num, {
            kraFiscalize,
            offline: activeOfflineEdit,
          })
        : null;
      const ok = await confirm({
        title: "New order",
        message: editingPrevious
          ? leaveMsgs?.leaveConfirm ??
            "Clear this order from the workspace and start a new order? Queued saves keep syncing in the background."
          : hasPendingOutbox
            ? "Clear this workspace and start a new order? The pending sync stays in the queue — use Sync when ready."
            : "Clear this workspace and start a new order?",
        confirmLabel: "Start New Order",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!ok) {
        skipEditAutosaveRef.current = false;
        return;
      }

      // Same finish step as Alt+P — only when this previous order was actually changed.
      if (editingPrevious && editedOrderHasLocalDraftChanges(activeCart)) {
        try {
          if (kraFiscalize || lineBusyRef.current) {
            await runBlockingTask(waitForCartLineSavesToFinish, {
              message: kraFiscalize ? "Preparing revised receipt…" : "Saving cart changes…",
              detail: kraFiscalize
                ? "Please wait before payment breakdown."
                : "Please wait while the current line finishes saving.",
            });
          } else {
            await waitForCartLineSavesToFinish();
          }
          await ensurePreviousOrderPaymentAdjustment(cartRef.current ?? activeCart);
        } catch (e) {
          skipEditAutosaveRef.current = false;
          if (e instanceof Error && /cancel/i.test(e.message)) return;
          const message =
            e instanceof Error
              ? e.message
              : "Enter how the refund or top-up was paid before starting a new order.";
          setStatusMessage(message);
          if (standalone) notifyError(message);
          return;
        }

        if (!activeOfflineEdit) {
          // skipEditAutosaveRef is already true — force-queue so F8 / double-click leave
          // still syncs (and background-fiscalizes) without requiring Alt+P.
          try {
            const queuedHeldOrderNum = await queuePreviousOrderEditOutboxNow({ force: true });
            flushPreviousOrderEditOutboxInBackground(
              queuedHeldOrderNum,
              freshWorkspaceGenerationRef.current,
            );
          } catch (e) {
            console.warn("Could not queue previous-order edit before new order", e);
          }
        }
      }
    }

    // Always clear the TemporaryCart when leaving a previous-order / lined workspace.
    // Skipping DELETE while outbox was pending re-loaded the same cart lines and made F8
    // feel like it needed two presses. Outbox already holds the edit payload.
    const deleteCartId =
      isServerPosCartId(activeCart?.id) &&
      (hasLines || Boolean(activeCart?.held_order_num) || editingPrevious)
        ? Number(activeCart.id)
        : null;
    const abandonCart =
      editingQueuedOfflineSale && activeCart?.offline_edit_snapshot ? activeCart : null;
    const clearOfflineCart = Boolean(activeCart?.offline && !editingQueuedOfflineSale);
    // Mark abandoned before placeholder/bootstrap so late line saves cannot repaint it.
    if (deleteCartId) markServerCartConsumed(deleteCartId);
    const immediateNextPos = resolveFreshWorkspacePosNum(
      activeCart,
      sessionPosOrders,
      null,
      issuedPosMax,
    );

    const completeFreshWorkspaceBootstrap = async ({
      generation,
      peekNextPos,
      report = () => {},
      cartPromise = null,
    }) => {
      void clearPreviousOrderEditDraft().catch(() => {});
      report(42);
      void clearLocalPosCart().catch(() => {});
      if (abandonCart) {
        await abandonOfflineSaleEdit(abandonCart);
      } else if (clearOfflineCart) {
        await clearLocalPosCart();
      }
      report(58);
      if (standalone) void flushOutboxNow();

      if (generation !== freshWorkspaceGenerationRef.current) return cartRef.current;

      report(72);
      const next = cartPromise
        ? await cartPromise
        : await loadCashierCart({ skipEditDraftRestore: true });
      if (generation !== freshWorkspaceGenerationRef.current) return next;
      const live = cartRef.current;
      const liveIsAbandoned =
        (deleteCartId != null && Number(live?.id) === Number(deleteCartId)) ||
        (isServerPosCartId(live?.id) && isServerCartConsumed(live.id));
      // Cashier already scanned into the *next* cart while bootstrap ran — keep their work.
      // Never restore the TemporaryCart F8 just abandoned (same race as post-checkout prepare).
      if (
        live &&
        !liveIsAbandoned &&
        isServerPosCartId(live.id) &&
        (live.lines?.length ?? 0) > 0 &&
        !live?.held_order_num &&
        !live?.superseded_sale_id
      ) {
        const nextLen = next?.lines?.length ?? 0;
        const liveLen = live.lines?.length ?? 0;
        if (
          live.id !== next?.id ||
          liveLen > nextLen ||
          cartHasOptimisticLines(live)
        ) {
          report(100);
          return live;
        }
      }
      let cleaned = stripOfflineSaleMarkers(stripPreviousOrderEditSession(next));
      // GET/POST cart often returns before DELETE finishes — never re-paint abandoned lines
      // or previous-order markers into the new blank workspace.
      if (
        deleteCartId != null &&
        (Number(cleaned?.id) === Number(deleteCartId) ||
          (isServerPosCartId(cleaned?.id) && isServerCartConsumed(cleaned.id)))
      ) {
        cleaned = {
          ...cleaned,
          lines: [],
          held_order_num: null,
          superseded_sale_id: null,
          order_discount: 0,
          payment_adjustments: undefined,
          _editDraftDirty: undefined,
        };
      }
      const merged = mergeFreshWorkspaceCart(cleaned, peekNextPos);
      cartRef.current = merged;
      setCart(merged);
      orderNoUserEditedRef.current = false;
      const displayPos =
        resolvePosNextBrowseNumber(merged) ??
        (peekNextPos != null ? peekNextPos : null);
      setEditOrderNo(displayPos != null ? String(displayPos) : "");
      if (enablePosOrderEdit && standalone) {
        void loadCompletedPosOrders();
      }
      report(100);
      return merged;
    };

    const runFreshWorkspaceBootstrap = async (report) => {
      report(8);
      const generation = ++freshWorkspaceGenerationRef.current;

      closeProductSearchDropdown();
      searchInputRef.current?.blur?.();
      setPaymentOpen(false);
      setPaymentError(null);
      // Keep completedSale / last receipt — clearing workspace must not disable Reprint.
      setEditSourceSale(null);
      setCartLineSaveFailed(false);
      setReplacingLineId(null);
      clearClassicLineSelection();
      setEditingLineId(null);
      setEditingLineRef(null);
      orderNoUserEditedRef.current = false;
      setOrderEditError(null);
      setEditBrowseIndex(0);
      clearLineEntry();
      setStatusMessage(
        discardPreviousOrderEdit
          ? "Previous-order edit cancelled — original receipt unchanged. Scan for a new order."
          : editingPrevious && pendingSync > 0
            ? "New order — previous edits keep syncing in the background."
            : "New order — scan or search a product.",
      );
      // Instant blank workspace — do not wait on network before the till looks cleared.
      applyFreshWorkspacePlaceholder(activeCart, immediateNextPos);

      report(18);
      // Clear TemporaryCart (lines + previous-order markers + reinstate) before reloading
      // so firstOrCreate does not hand back the abandoned receipt.
      let clearPromise = Promise.resolve();
      if (deleteCartId) {
        markServerCartConsumed(deleteCartId);
        clearPromise = apiRequest(`/sales/carts/${deleteCartId}/lines`, {
          method: "DELETE",
          loading: false,
          reportIssues: false,
        }).catch(() => {});
      }
      await clearPromise;
      report(28);

      const cartPromise = loadCashierCart({ skipEditDraftRestore: true });
      const peekNextPos = await resolveNextPosTicketForWorkspace(
        activeCart,
        sessionPosOrders,
        null,
        { skipServerReseed: true, floatSessionId },
      );
      applyFreshWorkspacePlaceholder(cartRef.current ?? activeCart, peekNextPos);
      report(32);

      return completeFreshWorkspaceBootstrap({
        generation,
        peekNextPos,
        report,
        cartPromise,
      });
    };

    if (standalone) {
      try {
        await runPrepareNextOrderOverlay(async (report) => {
          try {
            await runFreshWorkspaceBootstrap(report);
            notifySuccess(
              discardPreviousOrderEdit
                ? "Edit cancelled — original receipt unchanged. Ready for a new order."
                : editingPrevious && pendingSync > 0
                  ? "Workspace cleared — ready for a new order (sync continues in background)."
                  : "Workspace cleared — ready for a new order.",
            );
          } catch (e) {
            if (freshWorkspaceGenerationRef.current) {
              const message = e instanceof ApiError ? e.message : "Failed to start new order";
              setStatusMessage(message);
              notifyError(message);
              const generation = freshWorkspaceGenerationRef.current;
              if (isMissingTemporaryCartError(e)) {
                try {
                  const recovered = await recoverMissingServerCart();
                  if (recovered) {
                    const peekNextPos = await resolveNextPosTicketForWorkspace(
                      cartRef.current,
                      sessionPosOrders,
                      null,
                      { floatSessionId },
                    );
                    const merged = mergeFreshWorkspaceCart(
                      stripOfflineSaleMarkers(stripPreviousOrderEditSession(recovered)),
                      peekNextPos,
                    );
                    cartRef.current = merged;
                    setCart(merged);
                    report(100);
                    return merged;
                  }
                } catch {
                  /* placeholder remains — next scan will ensureCart */
                }
              }
            }
            throw e;
          } finally {
            skipEditAutosaveRef.current = false;
            if (freshCartBootstrapRef.current) {
              freshCartBootstrapRef.current = null;
            }
          }
        });
      } catch {
        /* surfaced via notifyError inside bootstrap */
      }
      return;
    }

    const peekNextPos = await resolveNextPosTicketForWorkspace(activeCart, sessionPosOrders, null, {
      floatSessionId,
    });
    const generation = ++freshWorkspaceGenerationRef.current;

    setPaymentOpen(false);
    setPaymentError(null);
    setEditSourceSale(null);
    setCartLineSaveFailed(false);
    setReplacingLineId(null);
    clearClassicLineSelection();
    setEditingLineId(null);
    setEditingLineRef(null);
    orderNoUserEditedRef.current = false;
    setOrderEditError(null);
    setEditBrowseIndex(0);
    clearLineEntry();
    setStatusMessage(
      discardPreviousOrderEdit
        ? "Previous-order edit cancelled — original receipt unchanged. Scan for a new order."
        : editingPrevious && pendingSync > 0
          ? "New order — previous edits keep syncing in the background."
          : "New order — scan or search a product.",
    );
    applyFreshWorkspacePlaceholder(activeCart, peekNextPos);
    focusProductSearch();

    const bootstrap = (async () => {
      try {
        if (deleteCartId) {
          markServerCartConsumed(deleteCartId);
          await apiRequest(`/sales/carts/${deleteCartId}/lines`, {
            method: "DELETE",
            loading: false,
            reportIssues: false,
          }).catch(() => {});
        }
        await completeFreshWorkspaceBootstrap({ generation, peekNextPos });
      } catch (e) {
        if (generation !== freshWorkspaceGenerationRef.current) return cartRef.current;
        const message = e instanceof ApiError ? e.message : "Failed to start new order";
        setStatusMessage(message);
        if (isMissingTemporaryCartError(e)) {
          try {
            const recovered = await recoverMissingServerCart();
            if (generation === freshWorkspaceGenerationRef.current && recovered) {
              const merged = mergeFreshWorkspaceCart(
                stripOfflineSaleMarkers(stripPreviousOrderEditSession(recovered)),
                peekNextPos,
              );
              cartRef.current = merged;
              setCart(merged);
              return merged;
            }
          } catch {
            /* placeholder remains — next scan will ensureCart */
          }
        }
        return cartRef.current;
      } finally {
        skipEditAutosaveRef.current = false;
        if (freshCartBootstrapRef.current === bootstrap) {
          freshCartBootstrapRef.current = null;
        }
      }
    })();
    freshCartBootstrapRef.current = bootstrap;
    await bootstrap;
    } finally {
      freshWorkspaceInFlightRef.current = false;
    }
  }

  async function handleNewOrder() {
    await startFreshWorkspace();
  }

  async function handlePrintFailedOfflineReceipt(failedSale) {
    let sale = failedSale;
    if (!sale?.order_num && !sale?.items?.length) {
      try {
        const rows = await listFailedOutboxSales();
        sale = rows[0] ?? null;
      } catch {
        sale = null;
      }
    }
    if (!sale?.order_num && !(sale?.items?.length > 0)) {
      notifyError("No failed offline receipt to print.");
      return;
    }
    const orderLabel = formatPosBrowseLabel(sale);
    const loadingToastId = toast.loading(
      orderLabel !== "—" ? `Printing failed receipt ${orderLabel}…` : "Printing failed receipt…",
    );
    try {
      const result = await printSaleOrder(
        sale,
        offlinePrintOptions(sale, {
          capabilities,
          organization,
          organizationName: capabilities?.profile_label,
          uomById,
          productByCode,
          user,
          preparedBy: user?.full_name ?? user?.username ?? null,
          documentType:
            resolveOrderPrintDocumentType(capabilities?.module_settings) ?? "receipt",
        }),
      );
      if (!result) {
        toast.error("Print cancelled or no format was selected.", { id: loadingToastId });
        return;
      }
      toast.success(
        orderLabel !== "—" ? `Printed failed receipt ${orderLabel}.` : "Printed failed receipt.",
        { id: loadingToastId },
      );
    } catch (e) {
      console.error("Failed offline receipt print failed", e);
      toast.error(e?.message ?? "Could not print failed receipt.", { id: loadingToastId });
    }
  }

  async function handlePrintReceipt() {
    // Finishing a previous-order edit: prep → payment breakdown → print (no KRA wait).
    // With KRA on, fiscalization / credit-note balancing runs on background outbox sync.
    // Untouched browse/reprint of a *completed* sale (not in edit session) must NOT
    // prompt for payment or queue a duplicate sale.
    //
    // Detect edit session from cartRef (not React state) so a stale render cannot
    // skip the print→clear finish path.
    const activeEditCart = cartRef.current;
    const inPreviousOrderEdit = Boolean(
      activeEditCart?.held_order_num && activeEditCart?.superseded_sale_id,
    );
    const dirtyPreviousOrderEdit =
      inPreviousOrderEdit && editedOrderHasLocalDraftChanges(activeEditCart);
    // Invalidate stale sync refresh before queuing so background upload cannot
    // repaint this edit after we clear to a new order.
    const finishGeneration = inPreviousOrderEdit
      ? ++freshWorkspaceGenerationRef.current
      : freshWorkspaceGenerationRef.current;
    if (dirtyPreviousOrderEdit) {
      const editSummary = summarizeLocalPosCart(cartRef.current);
      const kraFiscalize = shouldSubmitKraOnCheckout(
        capabilities?.module_settings,
        capabilities,
        editSummary?.total ?? editSummary?.amountDue,
      );

      // Prep wait while queued line saves settle (KRA-on always shows overlay).
      if (kraFiscalize || lineBusyRef.current) {
        await runBlockingTask(waitForCartLineSavesToFinish, {
          message: kraFiscalize ? "Preparing revised receipt…" : "Saving cart changes…",
          detail: kraFiscalize
            ? "Please wait before payment breakdown."
            : "Please wait while the current line finishes saving.",
        });
      } else {
        await waitForCartLineSavesToFinish();
      }

      try {
        await ensurePreviousOrderPaymentAdjustment(cartRef.current, {
          confirmLabel: "Save & reprint",
        });
      } catch (e) {
        if (e instanceof Error && /cancel/i.test(e.message)) return;
        notifyError(
          e instanceof Error
            ? e.message
            : "Enter how the refund or top-up was paid before reprinting.",
        );
        return;
      }

      // Await local outbox write only — network/KRA upload continues in the background.
      try {
        const queuedHeldOrderNum = await queuePreviousOrderEditOutboxNow({ force: true });
        if (queuedHeldOrderNum == null) {
          notifyError(
            "Could not save this order edit for sync. Keep the order open and try Alt+P again.",
          );
          return;
        }
        flushPreviousOrderEditOutboxInBackground(queuedHeldOrderNum, finishGeneration);
      } catch (e) {
        if (e instanceof Error && /cancel/i.test(e.message)) return;
        notifyError(
          e instanceof Error
            ? e.message
            : "Could not queue this order for background sync.",
        );
        return;
      }
    }

    const editSnapshot =
      inPreviousOrderEdit && cartRef.current
        ? buildPreviousOrderEditPrintSale(cartRef.current, {
            user,
            organization,
            sourceSale: editSourceSale,
          })
        : null;
    let sale = resolvePosReprintSale({
      isCartEditSession: inPreviousOrderEdit,
      editSourceSale,
      completedSale,
      sessionPosOrders,
      lastReceiptFallback: readPosLastReceipt(user?.id, user?.branch_id),
      editCartSnapshot: editSnapshot,
    });
    if (!sale?.id && !sale?.order_num) {
      const message = inPreviousOrderEdit
        ? "Add items to this order before printing."
        : "No completed order to print. Complete payment first (F10).";
      notifyError(message);
      if (!standalone) setStatusMessage(message);
      return;
    }

    // Any previous-order edit session: print revised receipt then blank new order.
    if (inPreviousOrderEdit && standalone) {
      if (kraEditBackgroundFiscalize) {
        sale = { ...sale, _skip_kra_qr: true };
      }
      await printRevisedPreviousOrderAndFocusNewOrder(sale);
      return;
    }

    if (receiptPrintStatus === "pending") return;

    setReceiptPrintStatus("pending");
    const cashSalesLabel = formatCashSalesNumber(sale);
    const orderLabel =
      cashSalesLabel !== "—"
        ? cashSalesLabel
        : sale.order_num
          ? `#${sale.order_num}`
          : "";
    const loadingToastId = toast.loading(
      orderLabel ? `Printing receipt ${orderLabel}…` : "Printing receipt…",
    );
    if (!standalone) {
      setStatusMessage(
        orderLabel ? `Printing receipt ${orderLabel}…` : "Printing receipt…",
      );
    }

    try {
      const skipKraQr = Boolean(sale?._skip_kra_qr);
      const result = await printSaleOrder(
        sale,
        fastPosPrintOptions(sale, {
        capabilities,
        organization,
        organizationName: capabilities?.profile_label,
        uomById,
          productByCode,
        user,
        preparedBy: user?.full_name ?? user?.username ?? null,
          documentType:
            resolveOrderPrintDocumentType(capabilities?.module_settings) ?? "receipt",
          kraReceipt: skipKraQr ? null : (sale.kra_response ?? sale.kraResponse ?? null),
          allowKraNetwork: skipKraQr ? false : undefined,
        }),
      );
      if (!result) {
        setReceiptPrintStatus("failed");
        toast.error("Print cancelled or no format was selected.", { id: loadingToastId });
        if (!standalone) setStatusMessage("Print cancelled.");
        return;
      }
      setReceiptPrintStatus("printed");
      const message = orderLabel
        ? skipKraQr && kraEditBackgroundFiscalize
          ? `Receipt ${orderLabel} sent to printer. KRA syncs in the background.`
          : `Receipt ${orderLabel} sent to printer.`
        : "Receipt sent to printer.";
      toast.success(message, { id: loadingToastId });
      if (!standalone) setStatusMessage(message);

      if (classicLayout) {
        focusClassicProductSearch();
      }
    } catch (e) {
      setReceiptPrintStatus("failed");
      const message = e instanceof Error ? e.message : "Receipt print failed";
      toast.error(message, { id: loadingToastId });
      if (!standalone) setStatusMessage("Receipt print failed.");
    }
  }

  /**
   * Drop a restored held park from device / prompt memory (idempotent).
   */
  async function forgetRestoredHeldFromMemory({ localHeldId = null } = {}) {
    const localId =
      localHeldId != null && isLocalHeldId(localHeldId) ? String(localHeldId) : null;
    if (localId) {
      try {
        await forgetLocalHeldOrder(localId);
      } catch {
        /* already gone */
      }
    }
    // Any held restore dismisses the classic auto-held prompt so shortcuts work again.
    clearAutoHeldOrder();
    setAutoHeldPrompt(null);
    void loadHeldOrdersCount();
  }

  /**
   * Apply a restored held/draft sale as a normal new cart (not previous-order edit).
   */
  function applyRestoredHeldCart(restoredCart, sourceSale = null) {
    const enrichedSource = resolveRestoredSourceSale(
      restoredCart,
      sourceSale,
      sourceSale?.id ?? restoredCart?.restored_from_sale?.id,
    );
    let cartData =
      stripPreviousOrderDraftMarkers(normalizeCartResponse(restoredCart) ?? restoredCart ?? null);
    if (cartData && enrichedSource) {
      const next = { ...cartData };
      if (next.customer_num == null && enrichedSource.customer_num != null) {
        next.customer_num = Number(enrichedSource.customer_num);
      }
      if (
        !String(next.customer_name_override ?? "").trim() &&
        String(enrichedSource.customer_name_override ?? enrichedSource.customer_display_name ?? "").trim()
      ) {
        next.customer_name_override = String(
          enrichedSource.customer_name_override ?? enrichedSource.customer_display_name,
        ).trim();
      }
      cartData = next;
    }
    if (cartData) {
      // Keep partial tenders from the held park (M-Pesa / voucher / points) after restore.
      const paySource = restoredCart ?? sourceSale ?? enrichedSource;
      const payFields = [
        "payment_method_code",
        "cash_payment_amount",
        "mpesa_payment_amount",
        "mpesa_transaction_code",
        "mpesa_phone",
        "voucher_payment_amount",
        "points_payment_amount",
        "equity_payment_amount",
        "kcb_payment_amount",
        "cheque_payment_amount",
        "bank_payment_amount",
        "amount_paid",
      ];
      const withPay = { ...cartData };
      for (const key of payFields) {
        if (
          (withPay[key] == null || withPay[key] === "" || Number(withPay[key]) === 0) &&
          paySource?.[key] != null &&
          paySource[key] !== ""
        ) {
          withPay[key] = paySource[key];
        }
      }
      cartData = withPay;
    }
    cartRef.current = cartData;
    setCart(cartData);
    setEditSourceSale(null);
    setSelectedLineId(null);
    setEditingLineId(null);
    setEditingLineRef(null);
    setReplacingLineId(null);
    setPaymentOpen(false);
    setPaymentError(null);
    setOrderEditError(null);
    setSaveOrderOpen(false);
    setSaveOrderError(null);
    clearClassicLineSelection();
    clearLineEntry();
    orderNoUserEditedRef.current = false;
    void clearPreviousOrderEditDraft().catch(() => {});
    if (cartData?.next_pos_order_num != null) {
      setEditOrderNo(String(cartData.next_pos_order_num));
    } else {
      setEditOrderNo("");
    }
    const customerMemory = extractSaleCustomerMemory(enrichedSource ?? sourceSale);
    const rememberKey =
      cartData?.next_pos_order_num ?? cartData?.next_order_num ?? sourceSale?.order_num;
    if (rememberKey != null && (customerMemory.name || customerMemory.customerNum != null)) {
      rememberPosOrderCustomer(rememberKey, customerMemory);
    }

    // Restoring consumes the held park — ensure it is gone from local held memory.
    const localHeldId =
      cartData?.restored_from_local_held_id ??
      (isLocalHeldId(sourceSale?.id) ? sourceSale.id : null);
    void forgetRestoredHeldFromMemory({ localHeldId });
  }

  /**
   * Paint held lines immediately, then push onto TemporaryCart in the background.
   * First scan/checkout awaits the shared materialize promise via ensureCart.
   */
  function scheduleLocalHeldMaterialize(localCart, sourceSale) {
    const generation = ++heldRestoreGenerationRef.current;
    const heldId = localCart?.restored_from_local_held_id ?? sourceSale?.id ?? null;
    void (async () => {
      try {
        const serverCart = await materializeOfflineCartOnServer(
          { ...localCart, offline: false },
          { applyToWorkspace: false },
        );
        if (generation !== heldRestoreGenerationRef.current) return;
        const live = cartRef.current;
        const stillOnRestore =
          live &&
          (live.restored_from_local_held_id === heldId ||
            (!isServerPosCartId(live.id) &&
              (live.lines?.length ?? 0) > 0 &&
              !isFreshWorkspacePlaceholder(live)));
        if (!stillOnRestore) return;
        const pendingOptimistic = (live.lines ?? []).filter((line) => line?._optimistic);
        const enriched = {
          ...serverCart,
          customer_num: localCart.customer_num ?? serverCart.customer_num ?? null,
          customer_name_override:
            localCart.customer_name_override ??
            serverCart.customer_name_override ??
            "Walk-in",
          mpesa_payment_amount: localCart.mpesa_payment_amount ?? 0,
          mpesa_transaction_code: localCart.mpesa_transaction_code ?? null,
          mpesa_phone: localCart.mpesa_phone ?? null,
          voucher_payment_amount: localCart.voucher_payment_amount ?? 0,
          points_payment_amount: localCart.points_payment_amount ?? 0,
          amount_paid: localCart.amount_paid ?? 0,
          restored_from_hold_label: localCart.restored_from_hold_label ?? null,
          restored_from_local_held_id: heldId,
        };
        if (pendingOptimistic.length) {
          enriched.lines = mergePreservedOptimisticLines(
            enriched.lines,
            pendingOptimistic,
          );
        }
        applyRestoredHeldCart(enriched, sourceSale);
      } catch {
        if (generation !== heldRestoreGenerationRef.current) return;
        try {
          const saved = await saveLocalPosCart({ ...localCart, offline: false });
          if (generation !== heldRestoreGenerationRef.current) return;
          applyRestoredHeldCart(
            { ...presentLocalOfflineCart(saved), offline: false },
            sourceSale,
          );
        } catch {
          /* keep painted local cart */
        }
      }
    })();
  }

  /** Resume a parked held sale into the till as a new in-progress order. */
  async function restoreHeldSaleToNewCart(saleId, { replace = false, saleSnapshot = null } = {}) {
    if (saleId == null || saleId === "") {
      throw new Error("No held order selected.");
    }

    const hasOpenLines = (cart?.lines?.length ?? 0) > 0;
    if (hasOpenLines && !replace) {
      const ok = await confirm({
        title: "Restore held order",
        message: "Your workspace has an open order. Replace it with this held order?",
        confirmLabel: "Replace",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!ok) return null;
      replace = true;
    }

    const restoredRaw = await apiRequest(`/sales/orders/${saleId}/restore-to-cart`, {
      method: "POST",
      body: { replace },
    });
    applyRestoredHeldCart(
      restoredRaw,
      resolveRestoredSourceSale(restoredRaw, saleSnapshot, saleId),
    );
    return restoredRaw;
  }

  async function restoreOrderForEdit(saleId, { replace = false, saleSnapshot = null, keepEditing = false } = {}) {
    if (saleId == null || saleId === "") {
      const message = "No order selected to edit.";
      setOrderEditError(message);
      setStatusMessage(message);
      return;
    }

    // Leaving a dirty previous-order edit (←/→ / open another receipt) without Alt+P:
    // still queue + background-sync so the online order matches what was edited.
    const outgoing = cartRef.current ?? cart;
    const leavingDirtyPrevious =
      Boolean(outgoing?.held_order_num && outgoing?.superseded_sale_id) &&
      editedOrderHasLocalDraftChanges(outgoing) &&
      Number(outgoing.superseded_sale_id) !== Number(saleId) &&
      !outgoing?.offline &&
      !outgoing?.offline_client_sale_uuid;
    if (leavingDirtyPrevious) {
      try {
        if (lineBusyRef.current) {
          await waitForCartLineSavesToFinish();
        }
        await ensurePreviousOrderPaymentAdjustment(cartRef.current ?? outgoing);
        const queuedHeldOrderNum = await queuePreviousOrderEditOutboxNow({ force: true });
        flushPreviousOrderEditOutboxInBackground(
          queuedHeldOrderNum,
          freshWorkspaceGenerationRef.current,
        );
      } catch (e) {
        if (e instanceof Error && /cancel/i.test(e.message)) return;
        const message =
          e instanceof Error
            ? e.message
            : "Enter how the refund or top-up was paid before opening another order.";
        setOrderEditError(message);
        setStatusMessage(message);
        if (standalone) notifyError(message);
        return;
      }
    }

    // Held/draft parks are unfinished sales — restore as a new cart, not previous-order edit.
    const snapshotStatus = String(saleSnapshot?.status ?? "").toLowerCase();
    if (snapshotStatus === "held" || snapshotStatus === "draft") {
      setBusy(true);
      beginPreviousOrderLoading();
      setOrderEditError(null);
      try {
        await restoreHeldSaleToNewCart(saleId, { replace, saleSnapshot });
        setStatusMessage("Held order restored — ready to complete as a new sale.");
        if (standalone) notifySuccess("Held order restored — complete when ready.");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not restore held order";
        setOrderEditError(message);
        setStatusMessage(message);
        if (standalone) notifyError(message);
      } finally {
        setBusy(false);
        endPreviousOrderLoading();
      }
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
      beginPreviousOrderLoading();
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
        setEditSourceSale(saleSnapshot?.id ? saleSnapshot : sale);
        orderNoUserEditedRef.current = false;
        const browseNum = resolvePosBrowseNumber({
          ...restoredCart,
          pos_order_num: restoredCart.pos_order_num ?? sale?.pos_order_num ?? saleSnapshot?.pos_order_num,
        });
        const orderNum = restoredCart?.held_order_num ?? sale?.order_num ?? saleSnapshot?.order_num;
        if (browseNum != null) {
          setEditOrderNo(String(browseNum));
          setSessionPosOrders((prev) => {
            const entry = {
              id: saleId,
              order_num: orderNum,
              pos_order_num:
                restoredCart.pos_order_num ?? sale?.pos_order_num ?? saleSnapshot?.pos_order_num ?? null,
              pos_order_date:
                restoredCart.pos_order_date ??
                sale?.pos_order_date ??
                saleSnapshot?.pos_order_date ??
                null,
              float_session_id:
                restoredCart.float_session_id ??
                sale?.float_session_id ??
                saleSnapshot?.float_session_id ??
                floatSessionId ??
                null,
              status: sale?.status ?? saleSnapshot?.status,
              offline_pending_sync: true,
            };
            const next = sortPosOrdersByNumberDesc([
              entry,
              ...prev.filter(
                (row) =>
                  String(row.id) !== String(saleId) &&
                  !sessionOrderMatchesBrowseNum(row, browseNum),
              ),
            ]);
            setEditBrowseIndex(
              Math.max(
                0,
                next.findIndex((row) => sessionOrderMatchesBrowseNum(row, browseNum)),
              ),
            );
            return next;
          });
        }
        const customerMemory = extractSaleCustomerMemory(saleSnapshot ?? sale);
        if (customerMemory.name || customerMemory.customerNum != null) {
          rememberPosOrderCustomer(browseNum ?? orderNum, customerMemory);
        }
        const displayNum = browseNum ?? orderNum;
        setStatusMessage(
          keepEditing
            ? `Editing offline order #${displayNum} — ${previousOrderEditWorkspaceHint({ offline: true })}`
            : `Loaded offline order #${displayNum} — ${previousOrderEditWorkspaceHint({ offline: true })}`,
        );
        if (standalone && displayNum != null) {
          notifySuccess(
            previousOrderEditModeMessages(displayNum, { offline: true }).loaded,
          );
        }
        void refreshOfflineCounts();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load offline order";
        setOrderEditError(message);
        setStatusMessage(message);
        if (standalone) notifyError(message);
      } finally {
        setBusy(false);
        endPreviousOrderLoading();
      }
      return;
    }

    // Already editing this sale on the till — skip KRA/network round-trip.
    const liveCart = cartRef.current ?? cart;
    const alreadyEditingSameSale =
      Number(liveCart?.superseded_sale_id) === Number(saleId) &&
      (liveCart?.lines?.length ?? 0) > 0 &&
      !liveCart?._optimistic_restore;
    if (alreadyEditingSameSale) {
      const sourceSale = saleSnapshot?.id ? saleSnapshot : editSourceSale;
      if (sourceSale) setEditSourceSale(sourceSale);
      const browseNum = resolvePosBrowseNumber(liveCart);
      const label = browseNum ?? liveCart?.held_order_num ?? saleId;
      const kraFiscalize = shouldSubmitKraOnCheckout(
        capabilities?.module_settings,
        capabilities,
        summarizeLocalPosCart(liveCart)?.total,
      );
      const editHint = previousOrderEditWorkspaceHint({ kraFiscalize });
      setOrderEditError(null);
      setStatusMessage(`Order #${label} already open for editing — ${editHint}`);
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

    const previousCartSnapshot = cartRef.current;
    const previousEditSource = editSourceSale;
    let paintedOptimistic = false;
    let restoreActive = true;
    let handoffToReplaceRetry = false;
    let unlockedEarly = false;
    let loadingBegun = false;

    const beginLoadingIfNeeded = () => {
      if (loadingBegun) return;
      loadingBegun = true;
      setBusy(true);
      beginPreviousOrderLoading("Loading previous order…", {
        detail: "Painting lines — stock and KRA finish in the background…",
        soft: true,
      });
    };

    const unlockTillEarly = (labelForStatus) => {
      if (unlockedEarly) return;
      unlockedEarly = true;
      setBusy(false);
      if (loadingBegun) endPreviousOrderLoading();
      if (labelForStatus != null) {
        const kraFiscalize = shouldSubmitKraOnCheckout(
          capabilities?.module_settings,
          capabilities,
          summarizeLocalPosCart(cartRef.current)?.total,
        );
        setStatusMessage(
          `Order #${labelForStatus} loaded — ${previousOrderEditWorkspaceHint({ kraFiscalize })}`,
        );
      }
    };

    const paintOptimisticFromSale = (source) => {
      if (!restoreActive) return false;
      const optimistic = buildOptimisticPreviousOrderCart(saleId, source, cartRef.current);
      if (!optimistic || (optimistic.lines?.length ?? 0) === 0) return false;
      cartRef.current = optimistic;
      setCart(optimistic);
      setEditSourceSale(source);
      setSelectedLineId(null);
      setEditingLineId(null);
      setEditingLineRef(null);
      setReplacingLineId(null);
      setPaymentOpen(false);
      orderNoUserEditedRef.current = false;
      const browseNum = resolvePosBrowseNumber(optimistic);
      if (browseNum != null) setEditOrderNo(String(browseNum));
      paintedOptimistic = true;
      // Unlock immediately — cashier can edit while restore/stock/KRA finish.
      unlockTillEarly(browseNum ?? optimistic.held_order_num ?? saleId);
      if (standalone) {
        const kraFiscalize = shouldSubmitKraOnCheckout(
          capabilities?.module_settings,
          capabilities,
          summarizeLocalPosCart(optimistic)?.total,
        );
        notifySuccess(
          previousOrderEditModeMessages(browseNum ?? optimistic.held_order_num ?? saleId, {
            kraFiscalize,
          }).loaded,
        );
      }
      return true;
    };

    const applyAuthoritativeRestoredCart = (restoredRaw) => {
      const sourceSale = resolveRestoredSourceSale(restoredRaw, saleSnapshot, saleId);
      const restoredCart = presentRestoredEditCart(restoredRaw, sourceSale);
      const live = cartRef.current;
      const sameEdit =
        live &&
        Number(live.superseded_sale_id) === Number(saleId) &&
        Boolean(live.held_order_num);
      const dirty = sameEdit && editedOrderHasLocalDraftChanges(live);
      // Swap/replace can be mid-flight before the draft is marked dirty — keep the
      // optimistic sale-item lines so the swap target id still resolves.
      const swapActive = Boolean(replacingLineIdRef.current || swapDraftRef.current);

      let nextCart = restoredCart;
      if (dirty || swapActive) {
        // Keep cashier edits / in-progress swap; bind to the real server cart id for sync.
        nextCart = {
          ...restoredCart,
          customer_num: live.customer_num ?? restoredCart.customer_num,
          customer_name_override:
            live.customer_name_override ?? restoredCart.customer_name_override,
          order_discount: live.order_discount ?? restoredCart.order_discount,
          lines: live.lines,
          ...(dirty ? { _editDraftDirty: true } : {}),
        };
      }
      const { _optimistic_restore: _omitOptimistic, ...clean } = nextCart;
      cartRef.current = clean;
      setCart(clean);
      persistPreviousOrderLocalDraft(clean, { immediate: dirty });
      setSelectedLineId(null);
      setEditingLineId(null);
      setEditingLineRef(null);
      if (!swapActive) {
        setReplacingLineId(null);
        replacingLineIdRef.current = null;
        swapDraftRef.current = null;
        setSwapDraft(null);
      }
      setPaymentOpen(false);
      setEditSourceSale(sourceSale);
      orderNoUserEditedRef.current = false;
      const browseNum = resolvePosBrowseNumber(clean);
      const orderNum = clean?.held_order_num ?? clean?.next_order_num;
      if (browseNum != null || orderNum != null) {
        if (browseNum != null) setEditOrderNo(String(browseNum));
        // Keep this ticket in the browse list while editing. Removing it made the
        // order look "deleted locally"; after sync the old sale id is superseded and
        // Cash Sales # lookup failed until the list refreshed with the new id.
        setSessionPosOrders((prev) => {
          const entry = {
            id: saleId,
            order_num: orderNum ?? sourceSale?.order_num ?? null,
            pos_order_num:
              clean.pos_order_num ?? sourceSale?.pos_order_num ?? null,
            pos_order_date:
              clean.pos_order_date ?? sourceSale?.pos_order_date ?? null,
            float_session_id:
              clean.float_session_id ??
              sourceSale?.float_session_id ??
              floatSessionId ??
              null,
            status: sourceSale?.status ?? "paid",
          };
          const next = sortPosOrdersByNumberDesc([
            entry,
            ...prev.filter(
              (row) =>
                String(row.id) !== String(saleId) &&
                (browseNum == null || !sessionOrderMatchesBrowseNum(row, browseNum)),
            ),
          ]);
          setEditBrowseIndex(
            Math.max(
              0,
              next.findIndex(
                (row) =>
                  String(row.id) === String(saleId) ||
                  (browseNum != null && sessionOrderMatchesBrowseNum(row, browseNum)),
              ),
            ),
          );
          return next;
        });

        const customerMemory = extractSaleCustomerMemory(sourceSale);
        if (customerMemory.name || customerMemory.customerNum != null) {
          rememberPosOrderCustomer(browseNum ?? orderNum, customerMemory);
        }
      }
      return { clean, sourceSale, browseNum, orderNum, restoredRaw };
    };

    setOrderEditError(null);

    try {
      // Always hydrate full sale tenders (browse rows omit cash/mpesa columns).
      // Paint lines ASAP from snapshot when present; merge payment columns when GET returns.
      const hydrateSaleTenders = (sale) => {
        if (!sale || typeof sale !== "object") return;
        // GET often finishes after restore-to-cart; still merge tenders if this edit is open.
        setEditSourceSale((prev) => {
          const live = cartRef.current;
          if (live && Number(live.superseded_sale_id) !== Number(saleId)) {
            return prev;
          }
          const merged = { ...(prev ?? {}), ...sale };
          const priorTotal = Math.round(
            Number(merged.order_total ?? merged.amount_paid ?? 0) * 100,
          ) / 100;
          if (live && Number(live.superseded_sale_id) === Number(saleId)) {
            const next = {
              ...live,
              original_order_total:
                live.original_order_total != null && Number(live.original_order_total) > 0.009
                  ? live.original_order_total
                  : priorTotal > 0.009
                    ? priorTotal
                    : live.original_order_total,
              offline_edit_snapshot: {
                ...(live.offline_edit_snapshot && typeof live.offline_edit_snapshot === "object"
                  ? live.offline_edit_snapshot
                  : {}),
                ...merged,
              },
              ...(merged.payment_method_code && !live.payment_method_code
                ? { payment_method_code: String(merged.payment_method_code).toUpperCase() }
                : {}),
            };
            cartRef.current = next;
            setCart(next);
            persistPreviousOrderLocalDraft(next, { immediate: false });
          }
          return merged;
        });
      };

      if (saleSnapshot?.items?.length) {
        paintOptimisticFromSale(saleSnapshot);
      } else {
        beginLoadingIfNeeded();
      }
      void apiRequest(`/sales/${saleId}`)
        .then((sale) => {
          if (paintedOptimistic) {
            hydrateSaleTenders(sale);
            return;
          }
          if (!restoreActive) {
            hydrateSaleTenders(sale);
            return;
          }
          paintOptimisticFromSale(sale);
          hydrateSaleTenders(sale);
        })
        .catch(() => {
          /* restore-to-cart still provides the authoritative cart */
        });

      if (!paintedOptimistic) beginLoadingIfNeeded();

      // Fast cart restore (stock + KRA finish afterResponse on the API).
      const restoredRaw = await apiRequest(`/sales/orders/${saleId}/restore-to-cart`, {
        method: "POST",
        body: { replace },
      });
      restoreActive = false;
      const applied = applyAuthoritativeRestoredCart(restoredRaw);
      const label = applied.browseNum ?? applied.clean?.held_order_num ?? saleId;
      const restoredSummary = summarizeLocalPosCart(applied.clean);
      const kraFiscalize = shouldSubmitKraOnCheckout(
        capabilities?.module_settings,
        capabilities,
        restoredSummary?.total ?? restoredSummary?.amountDue,
      );
      const editMsgs = previousOrderEditModeMessages(label, { kraFiscalize });
      const editHint = previousOrderEditWorkspaceHint({ kraFiscalize });
      const kraVoidPending = Boolean(restoredRaw?.kra_void_pending);
      if (!unlockedEarly) {
        setStatusMessage(
          keepEditing
            ? `Order #${label} updated — ${editHint}`
            : kraVoidPending
              ? `Order #${label} loaded — ${editHint} KRA void runs in the background.`
              : `Order #${label} loaded — ${editHint}`,
        );
        if (standalone) {
          notifySuccess(editMsgs.loaded);
        }
      } else if (kraVoidPending || restoredRaw?.stock_reverse_pending) {
        setStatusMessage(`Order #${label} ready — ${editHint}`);
      }
    } catch (e) {
      restoreActive = false;
      if (paintedOptimistic) {
        cartRef.current = previousCartSnapshot;
        setCart(previousCartSnapshot);
        setEditSourceSale(previousEditSource);
      }
      let message = dedupeErrorMessage(e instanceof ApiError ? e.message : "Could not load order for editing");
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
          handoffToReplaceRetry = true;
          return restoreOrderForEdit(saleId, { replace: true, saleSnapshot });
        }
        return;
      }
      // Rare: restore itself should not wait on KRA anymore; keep clear copy if device errors surface.
      if (/kra device rejected|not on the kra device|not registered on the kra|plu/i.test(message)) {
        message =
          `Could not complete KRA void for this receipt. ${message} ` +
          `Upload the order’s products to the device, then try again.`;
      }
      setOrderEditError(message);
      setStatusMessage(message);
      if (standalone) notifyError(message);
    } finally {
      if (handoffToReplaceRetry) {
        // Balance this attempt's begin*; the retry owns busy/loading.
        if (loadingBegun && !unlockedEarly) endPreviousOrderLoading();
      } else if (loadingBegun && !unlockedEarly) {
        setBusy(false);
        endPreviousOrderLoading();
      }
    }
  }

  async function handleEditByOrderNumber(orderNum) {
    const trimmed = String(orderNum ?? "").trim();
    if (!trimmed) return;

    setOrderEditError(null);
    const compact = trimmed.replace(/[\s#\-]+/g, "");
    const isCashSalesTicket = /^\d+$/.test(compact);
    const orgOrderMatch = compact.match(/^S0*(\d+)$/i);
    // External POS: cashiers think in Cash Sales #. "12" and "S0012" both try
    // pos_order_num first — S-prefix used to load the wrong org S00xx sale.
    const ticketNum = isCashSalesTicket
      ? compact
      : orgOrderMatch
        ? orgOrderMatch[1]
        : null;
    const orgOrderNum = orgOrderMatch ? orgOrderMatch[1] : null;

    try {
      try {
        const offlineOrders = await listOfflinePendingSalesForEdit();
        const offlineMatch =
          offlineOrders.find(
            (row) =>
              (ticketNum != null && String(row.pos_order_num) === ticketNum) ||
              sessionOrderMatchesBrowseNum(row, trimmed) ||
              (ticketNum != null && sessionOrderMatchesBrowseNum(row, ticketNum)),
          ) ??
          (orgOrderNum != null
            ? offlineOrders.find((row) => String(row.order_num) === orgOrderNum)
            : null);
        if (offlineMatch?.id) {
          await restoreOrderForEdit(offlineMatch.id, { saleSnapshot: offlineMatch });
          return;
        }
      } catch {
        /* fall through to server lookup */
      }

      // Synced previous-order edits leave a local outbox row with the new server sale id.
      // Prefer that over a blind Cash Sales # search (old sale is cancelled / ticket moved).
      if (ticketNum != null) {
        try {
          const syncedSaleId = await idbFindSyncedServerSaleIdByPosTicket(ticketNum);
          if (syncedSaleId) {
            await restoreOrderForEdit(syncedSaleId);
            return;
          }
        } catch {
          /* fall through */
        }
      }

      // Prefer today's Cash Sales # from the in-memory browse list (same as ← / →).
      if (ticketNum != null) {
        const sessionMatch = sessionPosOrders.find(
          (row) =>
            String(row.pos_order_num) === ticketNum &&
            !row?.fulfillment_meta?.superseded_by_edit &&
            !isOfflinePendingSaleId(row.id),
        );
        if (sessionMatch?.id) {
          await restoreOrderForEdit(sessionMatch.id, { saleSnapshot: sessionMatch });
          return;
        }
      }

      const today = todayPosOrderDate();
      const TOMBSTONE_MIN = 9_000_000;

      async function fetchPosEditRows(extra = {}, { q = "" } = {}) {
        const res = await apiRequest("/sales", {
          searchParams: buildPageParams({
            page: 1,
            perPage: 25,
            // Never send digit `q` for Cash Sales # — it also matches org order_num.
            q: q || undefined,
            extra: {
              for_pos_order_edit: 1,
              channel: "pos",
              order_source: "pos",
              with_items: 0,
              sort: "-created_at",
              ...extra,
            },
          }),
        });
        return Array.isArray(res?.data) ? res.data : [];
      }

      function pickEditableRow(rows, { matchPos = false, matchOrg = false } = {}) {
        const eligible = rows.filter(
          (row) =>
            row?.id != null &&
            Number(row.order_num) < TOMBSTONE_MIN &&
            !row?.fulfillment_meta?.superseded_by_edit,
        );
        if (matchPos && ticketNum != null) {
          return (
            eligible.find((row) => String(row.pos_order_num) === ticketNum) ?? null
          );
        }
        if (matchOrg && orgOrderNum != null) {
          return eligible.find((row) => String(row.order_num) === orgOrderNum) ?? null;
        }
        return eligible.find((row) => sessionOrderMatchesBrowseNum(row, trimmed)) ?? null;
      }

      let match = null;
      if (ticketNum != null) {
        // Cash Sales # resets daily — search today first, then widen.
        match = pickEditableRow(
          await fetchPosEditRows({
            filter_pos_order: ticketNum,
            from_date: today,
            to_date: today,
            date_field: "placed",
          }),
          { matchPos: true },
        );
        if (!match) {
          match = pickEditableRow(
            await fetchPosEditRows({
              filter_pos_order: ticketNum,
            }),
            { matchPos: true },
          );
        }
        // S0012 typed but meant org S# (rare) — only after Cash Sales miss.
        if (!match && orgOrderNum != null && !isCashSalesTicket) {
          match = pickEditableRow(
            await fetchPosEditRows({}, { q: `S${orgOrderNum}` }),
            { matchOrg: true },
          );
        }
      } else {
        match = pickEditableRow(await fetchPosEditRows({}));
      }

      if (!match?.id) {
        const message = `No POS order found with Cash Sales #${ticketNum ?? trimmed}.`;
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
    }
  }

  async function handleEditSelectedOrder() {
    const trimmed = editOrderNo.trim();
    if (!trimmed) {
      const message = "Enter an order number or customer name to load.";
      setOrderEditError(message);
      setStatusMessage(message);
      return;
    }

    // Customer name search — pick from matches (or run a fresh lookup on Enter).
    if (!looksLikePosOrderNumberLookup(trimmed)) {
      if (trimmed.length < 2) {
        const message = "Type at least 2 letters of the customer name.";
        setOrderEditError(message);
        setStatusMessage(message);
        return;
      }
      let matches = Array.isArray(orderNameResults) ? orderNameResults : null;
      if (!matches) {
        setOrderNameLoading(true);
        try {
          matches = await searchPosOrdersByCustomerName(trimmed);
          setOrderNameResults(matches);
          setOrderNameHighlight(0);
        } catch (e) {
          const message =
            e instanceof ApiError ? dedupeErrorMessage(e.message) : "Customer name lookup failed";
          setOrderEditError(message);
          setStatusMessage(message);
          if (standalone) notifyError(message);
          return;
        } finally {
          setOrderNameLoading(false);
        }
      }
      if (!matches.length) {
        const message = `No POS orders found for “${trimmed}”.`;
        setOrderEditError(message);
        setStatusMessage(message);
        return;
      }
      if (matches.length === 1) {
        clearOrderNameSearch();
        orderNoUserEditedRef.current = false;
        await restoreOrderForEdit(matches[0].id, { saleSnapshot: matches[0] });
        return;
      }
      setOrderNameResults(matches);
      setOrderNameHighlight(0);
      setStatusMessage(
        `${matches.length} orders match “${trimmed}”. Select one from the list.`,
      );
      return;
    }

    // Placeholder next ticket # (user has not typed): Enter opens the latest completed receipt.
    // If the cashier typed the same digits, look that Cash Sales # up instead of skipping to "current".
    if (
      !isCartEditSession &&
      !orderNoUserEditedRef.current &&
      (() => {
        const nextBrowse = resolvePosNextBrowseNumber(cart);
        return nextBrowse != null && String(nextBrowse) === trimmed;
      })()
    ) {
      await classicOpenCurrentOrder();
      return;
    }
    const fromSession = sessionPosOrders.find((row) => sessionOrderMatchesBrowseNum(row, trimmed));
    // Offline pending rows are restored from IndexedDB via restoreOrderForEdit.
    if (fromSession?.id != null && isOfflinePendingSaleId(fromSession.id)) {
      orderNoUserEditedRef.current = false;
      await restoreOrderForEdit(fromSession.id, { saleSnapshot: fromSession });
      return;
    }
    orderNoUserEditedRef.current = false;
    clearOrderNameSearch();
    await handleEditByOrderNumber(trimmed);
  }

  async function handleSelectOrderNameResult(row) {
    if (!row?.id || orderEditBusy) return;
    clearOrderNameSearch();
    orderNoUserEditedRef.current = false;
    setOrderEditError(null);
    setEditOrderNoFromSaleOrCart(row);
    await restoreOrderForEdit(row.id, { saleSnapshot: row });
  }

  /** Click the order # (while it shows the next number) → load the latest completed (“current”) order. */
  async function classicOpenCurrentOrder() {
    if (!enablePosOrderEdit || orderEditBusy) return;
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
    setEditOrderNoFromSaleOrCart(row);
    setOrderEditError(null);
    await restoreOrderForEdit(row.id, { saleSnapshot: row });
  }

  async function goPreviousOrder() {
    if (!canGoPreviousOrder || orderEditBusy) return;
    const nextIndex = editBrowseIndex + 1;
    const row = sessionPosOrders[nextIndex];
    if (!row?.id) return;
    orderNoUserEditedRef.current = false;
    setEditBrowseIndex(nextIndex);
    setEditOrderNoFromSaleOrCart(row);
    setOrderEditError(null);
    await restoreOrderForEdit(row.id, { replace: true, saleSnapshot: row });
  }

  async function goNextOrder() {
    if (!canGoNextOrder || orderEditBusy) return;
    const nextIndex = editBrowseIndex - 1;
    const row = sessionPosOrders[nextIndex];
    if (!row?.id) return;
    orderNoUserEditedRef.current = false;
    setEditBrowseIndex(nextIndex);
    setEditOrderNoFromSaleOrCart(row);
    setOrderEditError(null);
    await restoreOrderForEdit(row.id, { replace: true, saleSnapshot: row });
  }

  /** Classic caption arrows: load previous completed receipt / return toward new order. */
  const classicCanGoPrevious = Boolean(enablePosOrderEdit);
  const classicCanGoNext = enablePosOrderEdit && isCartEditSession;

  function setEditOrderNoFromSaleOrCart(saleOrCart) {
    const browse = resolvePosBrowseNumber(saleOrCart);
    if (browse != null) setEditOrderNo(String(browse));
  }

  async function classicGoPreviousOrder() {
    if (!enablePosOrderEdit || orderEditBusy) return;

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
    const browseNum = resolvePosBrowseNumber(cartRef.current ?? cart);
    // Walk older than the order currently being edited (list is newest-first by POS ticket).
    let startIndex = 0;
    if (browseNum != null) {
      const heldIdx = orders.findIndex((row) => sessionOrderMatchesBrowseNum(row, browseNum));
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
    setEditOrderNoFromSaleOrCart(row);
    await restoreOrderForEdit(row.id, { replace: true, saleSnapshot: row });
  }

  async function classicGoNextOrder() {
    if (!classicCanGoNext || orderEditBusy) return;
    if (editBrowseIndex > 0) {
      const nextIndex = editBrowseIndex - 1;
      const orders =
        sessionPosOrders.length > 0 ? sessionPosOrders : await loadCompletedPosOrders();
      const row = orders[nextIndex];
      if (!row) return;
      setEditBrowseIndex(nextIndex);
      setEditOrderNoFromSaleOrCart(row);
      await restoreOrderForEdit(row.id, { replace: true, saleSnapshot: row });
      return;
    }
    await handleNewOrder();
    orderNoUserEditedRef.current = false;
  }

  const classicOrderCaption = useMemo(() => {
    if (isCartEditSession) {
      const orderLabel = formatPosBrowseLabel(cart);
      const customer = prefilledEditCustomerName.trim();
      return customer
        ? `Previous Order, ${orderLabel} - ${customer}`
        : `Previous Order, ${orderLabel}`;
    }
    const rawNum =
      activeOrderNum ??
      (editOrderNo.trim() ? editOrderNo.trim() : null);
    const orderLabel = rawNum != null ? String(rawNum) : "—";
    return `New Order - ${orderLabel}`;
  }, [
    isCartEditSession,
    cart?.held_order_num,
    cart?.pos_order_num,
    prefilledEditCustomerName,
    activeOrderNum,
    editOrderNo,
  ]);

  function toggleRetailWholesaleMode() {
    if (!posSalesConfig.enableRetailPricing) {
      flashPosShortcutMessage(
        "Retail pricing is not enabled for this organization (Platform → Sales behaviour).",
      );
      return false;
    }
    setSellWholesaleMode((prev) => !prev);
    setUnitPriceTouched(false);
    return true;
  }

  function flashPosShortcutMessage(message, { error = true } = {}) {
    setStatusMessage(message);
    if (standalone) {
      if (error) notifyError(message);
      else notifySuccess(message);
    }
  }

  async function openCompletePayment() {
    if (openCompletePaymentInFlightRef.current) return;
    if (busy && !paymentOpen) {
      flashPosShortcutMessage("Checkout is still in progress — please wait.");
      return;
    }

    openCompletePaymentInFlightRef.current = true;
    try {
    // Finish queued add/qty/edit commits before dirty check (classic/previous-order
    // edits enqueue without lineBusy, so F10 right after a scan must wait here).
    await runBlockingTask(waitForCartLineSavesToFinish, {
      message: "Saving cart changes…",
      detail: "Please wait while the current line finishes saving.",
    });

    let activeCart = cartRef.current ?? cart;

    const isPreviousOrderEdit = Boolean(
      activeCart?.held_order_num && activeCart?.superseded_sale_id,
    );
    if (
      !isPreviousOrderEdit &&
      !lineBusyRef.current &&
      cartHasOptimisticLines(activeCart)
    ) {
      try {
        // Classic optimistic adds/qty edits can leave a transient pending marker even after
        // the commit chain settles. Refresh once so F10 can proceed on the real server cart
        // instead of false-failing with "Still saving cart lines".
        const refreshed = await loadCashierCart({ skipEditDraftRestore: true });
        if (refreshed?.id) {
          activeCart = refreshed;
        } else {
          activeCart = cartRef.current ?? activeCart;
        }
      } catch {
        activeCart = cartRef.current ?? activeCart;
      }
    }
    if (
      !isPreviousOrderEdit &&
      (lineBusyRef.current || cartHasOptimisticLines(activeCart))
    ) {
      flashPosShortcutMessage("Still saving cart lines — try again in a moment.");
      return;
    }

    if (isPreviousOrderEdit) {
      const summary = summarizeLocalPosCart(activeCart);
      const kraOn = shouldSubmitKraOnCheckout(
        capabilities?.module_settings,
        capabilities,
        summary?.total ?? summary?.amountDue,
      );
      const isOfflineEdit = Boolean(
        offlineMode || activeCart.offline || activeCart.offline_client_sale_uuid,
      );

      // Online previous-order edit: payment methods → reprint → new order (same as offline).
      // KRA fiscalization still runs on background sync after the outbox upload.
      if (!isOfflineEdit) {
        if (!editedOrderHasLocalDraftChanges(activeCart)) {
          if (pendingSync > 0 || editAutosaveBusy || offlineSyncing) {
            void flushOutboxAfterSale();
            flashPosShortcutMessage("Syncing saved changes to the server…", { error: false });
          } else {
            flashPosShortcutMessage(
              previousOrderEditModeMessages(activeCart.held_order_num, {
                kraFiscalize: kraOn,
              }).synced ?? "Order already saved — print with Alt+P.",
              { error: false },
            );
          }
          return;
        }
        if (!activeCart?.lines?.length) {
          flashPosShortcutMessage("Add items before completing this edit.");
          return;
        }
        if (cartStockBlocked) {
          flashPosShortcutMessage("Fix stock issues before completing this edit.");
          return;
        }
        // C/M payment only when the bill actually changed (top-up or return).
        const billDelta = computePreviousOrderEditSignedDelta(editSourceSale, activeCart, {
          cashRound: enablePosCashRounding,
        });
        if (!billDelta.type || !(Number(billDelta.amount) > 0)) {
          flashPosShortcutMessage(
            "Order updated — no payment change. Printing revised receipt…",
            { error: false },
          );
          void handlePrintReceipt();
          return;
        }
        setPaymentError(null);
        closeProductSearchDropdown();
        setPaymentOpen(true);
        return;
      }

      flashPosShortcutMessage(
        previousOrderEditModeMessages(activeCart.held_order_num, { offline: true }).f10,
        { error: false },
      );

      // Offline previous-order F10: payment panel only when the receipt was actually changed.
      if (!editedOrderHasLocalDraftChanges(activeCart)) {
        flashPosShortcutMessage(
          "No updates on this receipt — print with Alt+P, or edit qty/items first.",
          { error: false },
        );
        return;
      }

      {
        const billDelta = computePreviousOrderEditSignedDelta(editSourceSale, activeCart, {
          cashRound: enablePosCashRounding,
        });
        if (!billDelta.type || !(Number(billDelta.amount) > 0)) {
          flashPosShortcutMessage(
            "Order updated — no payment change. Printing revised receipt…",
            { error: false },
          );
          void handlePrintReceipt();
          return;
        }
      }

      setPaymentError(null);
      closeProductSearchDropdown();
      setPaymentOpen(true);
      return;
    }

    if (activeCart?.held_order_num) {
      if (!activeCart?.lines?.length) {
        flashPosShortcutMessage("Add items before completing payment (F10).");
        return;
      }

      if (cartStockBlocked) {
        flashPosShortcutMessage("Fix stock issues before completing payment.");
        return;
      }

      if (!editedOrderHasLocalDraftChanges(activeCart)) {
        flashPosShortcutMessage(
          "No updates on this receipt — print with Alt+P, or edit qty/items first.",
          { error: false },
        );
        return;
      }

      {
        const billDelta = computePreviousOrderEditSignedDelta(editSourceSale, activeCart, {
          cashRound: enablePosCashRounding,
        });
        if (!billDelta.type || !(Number(billDelta.amount) > 0)) {
          flashPosShortcutMessage(
            "Order updated — no payment change. Printing revised receipt…",
            { error: false },
          );
          void handlePrintReceipt();
          return;
        }
      }

      setPaymentError(null);
      closeProductSearchDropdown();
      setPaymentOpen(true);
      return;
    }

    if (!activeCart?.lines?.length) {
      flashPosShortcutMessage("Add items before completing payment (F10).");
      return;
    }
    if (cartStockBlocked) {
      flashPosShortcutMessage("Fix stock issues before completing payment.");
      return;
    }
    setPaymentError(null);
    closeProductSearchDropdown();
    setPaymentOpen(true);
    } finally {
      openCompletePaymentInFlightRef.current = false;
    }
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
    pendingSyncOpen,
    leaveGuardOpen,
    priceCheckerOpen,
    floatModalOpen: floatDeclareDialogOpen,
    floatDetailsOpen,
    xReportOpen,
    closeSessionOpen,
    zReportOpen,
    autoHeldPrompt: Boolean(autoHeldPrompt),
    discountReasonDialogOpen,
    preparingNextOpen,
    previousOrderLoading,
    autoHeldBusy: Boolean(autoHeldBusy),
    editAdjustmentDialogOpen: Boolean(editAdjustmentDialog),
    orderNameDropdownOpen: orderNameLoading || Array.isArray(orderNameResults),
    replacingLineId,
    selectedLineId,
    selectedLineCount,
    enableRetailPricing: posSalesConfig.enableRetailPricing,
    showCheckoutOnCreate: posSalesConfig.showCheckoutOnCreate,
    isCartEditSession: Boolean(cart?.held_order_num && cart?.superseded_sale_id),
    hasPendingLineEntry: Boolean(selectedProduct && lineForm.product_code),
    modernOrderEditLocked,
    lineCount: cart?.lines?.length ?? 0,
    cartStockBlocked,
    checkoutBlocked,
    activeSession: Boolean(activeSession),
  };
  posShortcutActionsRef.current = {
    flashPosShortcutMessage,
    toggleRetailWholesaleMode,
    cancelReplaceCartLine,
    focusProductSearch,
    focusScanCode,
    closeProductSearchDropdown,
    closePayment: () => {
      setPaymentOpen(false);
      setReceiptPrintStatus(null);
      setPaymentError(null);
    },
    handleNewOrder,
    startFreshWorkspace,
    handleRefresh,
    openSaveOrderDialog,
    openCompletePayment,
    handlePrintReceipt,
    removeSelectedLine,
    removeSelectedLines,
    confirm,
  };

  // External POS (/pos) only — not Backoffice Create order. Blocks DevTools chords +
  // browser right-click Inspect; does not affect Sales orders / LPO context menus.
  useEffect(() => {
    if (!standalone) return undefined;
    return installPosDevToolsLockdown();
  }, [standalone]);

  // Offline External POS: refuse Ctrl+R / F5 so a reload cannot wipe the live cart
  // or break local-first selling until the connection returns.
  const offlineModeRef = useRef(offlineMode);
  const networkStatusRef = useRef(networkStatus);
  offlineModeRef.current = offlineMode;
  networkStatusRef.current = networkStatus;

  useEffect(() => {
    if (!standalone) return undefined;
    return installPosOfflineReloadGuard({
      getShouldBlock: () => {
        const status = networkStatusRef.current;
        return status === "offline" || status === "slow" || Boolean(offlineModeRef.current);
      },
      onBlocked: () => {
        const message =
          "Reload is blocked while offline. Keep selling — sync when the connection returns.";
        flashPosShortcutMessage(message);
        setStatusMessage(message);
      },
    });
  }, [standalone]);

  useEffect(() => {
    function isConfirmDialogOpen() {
      // Only the app ConfirmDialog — not licence warnings / other alertdialogs.
      return Boolean(
        typeof document !== "undefined"
        && document.querySelector(
          '[role="alertdialog"][aria-modal="true"][aria-labelledby="confirm-dialog-title"]',
        ),
      );
    }

    function isModalOpen(state) {
      return (
        state.paymentOpen
        || state.saveOrderOpen
        || state.heldOrdersOpen
        || state.pendingSyncOpen
        || state.leaveGuardOpen
        || state.priceCheckerOpen
        || state.floatModalOpen
        || state.floatDetailsOpen
        || state.xReportOpen
        || state.closeSessionOpen
        || state.zReportOpen
        || state.autoHeldPrompt
        || state.discountReasonDialogOpen
        || state.preparingNextOpen
        || state.previousOrderLoading
        || state.autoHeldBusy
        || state.editAdjustmentDialogOpen
        || isConfirmDialogOpen()
      );
    }

    /** Human label for whichever dialog is blocking Alt shortcuts (null if clear). */
    function altShortcutBlockerLabel(state) {
      if (state.saveOrderOpen) return "hold/save order";
      if (state.heldOrdersOpen) return "held orders";
      if (state.leaveGuardOpen) return "leave confirmation";
      if (state.priceCheckerOpen) return "price checker";
      if (state.floatModalOpen) return "till float";
      if (state.floatDetailsOpen) return "float details";
      if (state.xReportOpen) return "X-report";
      if (state.closeSessionOpen) return "close session";
      if (state.zReportOpen) return "Z-report";
      if (state.autoHeldPrompt) return "auto-held order";
      if (state.discountReasonDialogOpen) return "discount reason";
      if (state.preparingNextOpen) return "preparing next order";
      if (state.previousOrderLoading) return "loading order";
      if (state.autoHeldBusy) return "auto-held order";
      if (state.editAdjustmentDialogOpen) return "payment breakdown";
      if (isConfirmDialogOpen()) return "confirmation";
      return null;
    }

    function isTypingTarget(el) {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable;
    }

    /** Keys handled on keydown — keyup only runs the action if the browser ate keydown. */
    const handledOnKeyDownAt = {
      F2: 0,
      F8: 0,
      F10: 0,
      F12: 0,
      AltH: 0,
      AltF: 0,
      AltP: 0,
    };

    /** Tracks Alt/Option physically down — some shells clear e.altKey on the letter key. */
    let altHeld = false;

    function runPosFunctionAction(key, state, actions) {
      actions.closeProductSearchDropdown?.();
      if (key === "F2") {
        // Classic: F2 = find/focus search. Retail/wholesale is F12.
        // Modern standalone: F2 can also toggle when retail pricing is on.
        if (state.enableRetailPricing && !state.classicLayout) {
          actions.toggleRetailWholesaleMode();
        } else {
          actions.focusProductSearch();
        }
        return;
      }
      if (key === "F8") {
        void (async () => {
          await actions.startFreshWorkspace();
          actions.focusProductSearch();
        })();
        return;
      }
      if (key === "F10") {
        if (isConfirmDialogOpen()) {
          actions.flashPosShortcutMessage?.(
            "Answer the open dialog first, then press F10.",
          );
          return;
        }
        void actions.openCompletePayment();
        return;
      }
      if (key === "F12") {
        actions.toggleRetailWholesaleMode();
      }
    }

    function focusScanAfterEsc(actions) {
      const attempt = () => {
        if (isModalOpen(posShortcutStateRef.current)) return false;
        actions.focusScanCode();
        return true;
      };
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (attempt()) return;
          // Confirm dialog / slow unmount — one more try after the overlay is gone.
          window.setTimeout(() => {
            attempt();
          }, 50);
        });
      });
    }

    function onPosKeyEvent(e, phase) {
      const state = posShortcutStateRef.current;
      const actions = posShortcutActionsRef.current;

      // Same event can hit multiple capture targets — only handle once.
      if (e.__centrixPosShortcutHandled) return;

      if (isPosAltKeyEvent(e)) {
        altHeld = phase === "keydown";
        notePosAltKeyEvent(e, phase);
        // Claim Alt on keydown so Windows/Chrome menu mnemonics (Alt then H/P)
        // cannot steal the chord before our letter handler runs.
        if (phase === "keydown") {
          e.preventDefault();
        }
        return;
      }

      const key = resolvePosShortcutKey(e);
      const isFn = isPosFunctionShortcutKey(key);

      if (isFn) {
        // Claim immediately so Chromium/PWA shells cannot open DevTools (F12) or menu (F10).
        claimPosFunctionKeyEvent(e);
        e.__centrixPosShortcutHandled = true;

        if (phase === "keyup") {
          // Bare F10/F12 sometimes only surface on keyup in PWAs after the shell ate keydown.
          if (Date.now() - (handledOnKeyDownAt[key] || 0) < 900) return;
        } else {
          handledOnKeyDownAt[key] = Date.now();
        }

        if (state.paymentOpen && key === "F10") {
          // F10 opens payment from the cart — once open, use Page Down inside the dialog.
          return;
        }

        // Function keys always run — never block behind modal/dialog guards.
        runPosFunctionAction(key, state, actions);
        return;
      }

      // Alt+H/F/P: claim immediately (like F-keys) so the browser menu / scan field
      // cannot swallow them. Right Alt is often AltGr (ctrl+alt). Works on all PosScreen
      // mounts (external /pos and in-app), classic + modern.
      const altOpts = { altHeld };
      const altLetter = resolvePosAltShortcutLetter(e, altOpts);
      if (altLetter) {
        const realAlt = isPosRealAltActive(e, altOpts);
        const blocker = altShortcutBlockerLabel(state);

        // After Alt+H opens Hold, the release-grace latch still matches bare H/P for a
        // moment. Claiming those keystrokes steals letters from the name field and
        // flashes a false "close the open dialog" error. Only block real Alt chords.
        if (blocker && !realAlt) {
          return;
        }

        claimPosFunctionKeyEvent(e);
        e.__centrixPosShortcutHandled = true;

        const altStampKey =
          altLetter === "h" ? "AltH" : altLetter === "f" ? "AltF" : "AltP";

        if (phase === "keyup") {
          // Some shells eat Alt+letter on keydown (browser Help / menu) — run on keyup once.
          if (Date.now() - (handledOnKeyDownAt[altStampKey] || 0) < 900) return;
        } else {
          handledOnKeyDownAt[altStampKey] = Date.now();
        }

        if (blocker) {
          // Alt+H while hold/save is already open — tell the cashier what to do.
          if (altLetter === "h" && state.saveOrderOpen) {
            actions.flashPosShortcutMessage?.(
              "Hold dialog is already open — enter the customer name, or press Esc to cancel.",
            );
            return;
          }
          if (altLetter === "p" && state.saveOrderOpen) {
            actions.flashPosShortcutMessage?.(
              "Finish or cancel the Hold dialog (Esc) before reprinting (Alt+P).",
            );
            return;
          }
          actions.flashPosShortcutMessage?.(
            `Close the ${blocker} dialog first (Esc), then try Alt+${altLetter.toUpperCase()} again.`,
          );
          return;
        }

        // Chord consumed — drop grace latch so the next typed H/P is not a shortcut.
        altHeld = false;
        clearPosAltLatch();

        actions.closeProductSearchDropdown?.();
        if (altLetter === "h") {
          // Same path as the Hold button — no extra confirm gate.
          actions.openSaveOrderDialog("hold");
          return;
        }
        if (altLetter === "f") {
          if (state.activeSession) setFloatDetailsOpen(true);
          else {
            actions.flashPosShortcutMessage?.(
              "Open a till session (declare float) before viewing float details.",
            );
          }
          return;
        }
        if (altLetter === "p") {
          void actions.handlePrintReceipt();
        }
        return;
      }

      if (e.key === "Escape") {
        const wasPaymentOpen = Boolean(state.paymentOpen);
        const modalOpen = isModalOpen(state);

        // Do not claim Esc while a non-payment dialog is open — our capture
        // listeners (window/document) otherwise stopImmediatePropagation and the
        // Hold / confirm / float dialogs never receive Esc, so their flags stay
        // true and Alt+H keeps saying "close the open dialog".
        if (modalOpen && !wasPaymentOpen) {
          return;
        }

        const escTarget = e.target;
        const onLineQtyInput =
          escTarget instanceof HTMLElement &&
          escTarget.classList.contains("classic-pos-line-qty-input");
        const onEntryQtyInput =
          escTarget instanceof HTMLElement &&
          (escTarget.classList.contains("classic-pos-cart-qty-input") ||
            escTarget === qtyInputRef.current);

        // Line qty Esc: restore the typed draft to the committed qty only —
        // do not claim (cell handler runs) and do not abandon previous-order edit.
        if (onLineQtyInput && !modalOpen) {
          return;
        }

        claimPosFunctionKeyEvent(e);
        e.__centrixPosShortcutHandled = true;
        // Mid-swap: Esc cancels the swap only (stay in previous-order edit if any).
        if (state.replacingLineId && !modalOpen) {
          actions.cancelReplaceCartLine();
          focusScanAfterEsc(actions);
          return;
        }
        // Payment has no reliable Esc handler under capture — close it ourselves.
        if (wasPaymentOpen) {
          actions.closePayment?.();
          focusScanAfterEsc(actions);
          return;
        }
        // Pending add (product selected, focus on qty): Esc cancels the entry row only.
        // The real previous-order edit is committed by Enter on qty — until then stay
        // on the loaded receipt.
        if ((onEntryQtyInput || state.hasPendingLineEntry) && !modalOpen) {
          actions.cancelPendingLineEntry?.();
          return;
        }
        // Previous-order edit already changed (or just browsing the restored cart):
        // Esc discards the draft (original receipt unchanged) and opens a blank workspace.
        if (state.isCartEditSession && !modalOpen) {
          void actions.startFreshWorkspace?.({ discardPreviousOrderEdit: true });
          return;
        }
        if (state.standalone) {
          actions.focusProductSearch();
          return;
        }
        // Open workspace: reset entry row and focus Scan code.
        actions.focusProductSearch();
        return;
      }

      if (isModalOpen(state)) {
        return;
      }

      const classicDelete =
        state.classicLayout &&
        e.key === "Delete" &&
        (state.selectedLineId || state.selectedLineCount > 0);

      if (!classicDelete && isTypingTarget(e.target)) return;

      if (phase === "keyup") return;

      if (classicDelete) {
        claimPosFunctionKeyEvent(e);
        e.__centrixPosShortcutHandled = true;
        actions.closeProductSearchDropdown?.();
        void actions.removeSelectedLines();
      }
    }

    function onKeyDown(e) {
      onPosKeyEvent(e, "keydown");
    }
    function onKeyUp(e) {
      onPosKeyEvent(e, "keyup");
    }
    function onWindowBlur() {
      // Always drop Alt state on focus loss — a missed Alt keyup otherwise leaves
      // posAltPhysicallyDown stuck and every H/P becomes a false shortcut.
      altHeld = false;
      clearPosAltLatch();
    }
    function onVisibilityChange() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        altHeld = false;
        clearPosAltLatch();
      }
    }

    // passive: false is required — otherwise preventDefault is ignored and F12 opens DevTools.
    const opts = { capture: true, passive: false };
    const captureTargets = [document.documentElement, window, document];
    for (const target of captureTargets) {
      target.addEventListener("keydown", onKeyDown, opts);
      target.addEventListener("keyup", onKeyUp, opts);
    }
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      for (const target of captureTargets) {
        target.removeEventListener("keydown", onKeyDown, opts);
        target.removeEventListener("keyup", onKeyUp, opts);
      }
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearPosAltLatch();
    };
  }, []);

  return (
    <div
      className={`pos-workspace relative flex min-h-0 flex-1 flex-col${
        standalone ? " h-full pos-workspace-standalone" : " h-full pos-workspace-backoffice p-4 md:p-6 lg:p-8"
      }${classicLayout ? " pos-workspace-classic" : ""}`}
      data-pos-layout={classicLayout ? "classic" : "modern"}
      data-classic-pos-theme={classicLayout ? classicThemeTemplate : undefined}
      style={classicThemeVars ?? undefined}
    >
      {standalone ? (
        <>
          <div className="pos-header shrink-0 shadow-sm">
            <div className="pos-header-bar flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 lg:px-5">
              <div className="pos-header-brand-wrap shrink-0">
                <CentrixLogoHeader
                  markSize={28}
                  title={PRODUCT_NAME}
                  orgSubtitle={organization?.org_name ?? organizationName}
                />
              </div>
              <div className="pos-header-actions flex min-w-0 flex-1 items-center justify-center gap-2 px-1">
                <button
                  type="button"
                  disabled={busy}
                  title="Held orders"
                  onClick={() => setHeldOrdersOpen(true)}
                  className={posHeaderBtnClassName}
                >
                  <span className="pos-header-btn-label" data-short="Held">
                  Held orders
                  </span>
                  {heldOrdersCount > 0 ? (
                    <span className="pos-header-action-badge">
                      {heldOrdersCount > 99 ? "99+" : heldOrdersCount}
                    </span>
                  ) : null}
                </button>
                {standalone && failedSyncOrders.length > 0 ? (
                  <button
                    type="button"
                    disabled={busy}
                    title={`${failedSyncOrders.length} offline order(s) failed to sync — open to retry`}
                    onClick={() => setPendingSyncOpen(true)}
                    className={posHeaderBtnClassName}
                  >
                    <span className="pos-header-btn-label" data-short="Failed">
                      Sync failed
                    </span>
                    <span className="pos-header-action-badge bg-amber-500">
                      {failedSyncOrders.length > 99 ? "99+" : failedSyncOrders.length}
                    </span>
                  </button>
                ) : null}
                {requireTillFloat && activeSession ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      title="Float details"
                      onClick={() => {
                        setSessionError(null);
                        setFloatDetailsOpen(true);
                      }}
                      className={posHeaderBtnClassName}
                    >
                      <span className="pos-header-btn-label" data-short="Float">
                      Float details
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || sessionBusy}
                      title="Record expense"
                      onClick={() => {
                        setSessionError(null);
                        setRecordExpenseOpen(true);
                      }}
                      className={posHeaderBtnClassName}
                    >
                      <span className="pos-header-btn-label" data-short="Expense">
                      Record expense
                      </span>
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={busy || !reprintSale?.id || receiptPrintStatus === "pending"}
                  title={
                    receiptPrintStatus === "pending"
                      ? "Printing receipt…"
                      : reprintSale?.order_num
                        ? `Reprint receipt #${reprintSale.order_num}`
                        : isCartEditSession
                          ? instantAutoEditSync
                            ? "Reprint revised receipt (Alt+P)"
                            : "Reprint this order"
                      : "Complete an order first"
                  }
                  onClick={() => void handlePrintReceipt()}
                  className={posHeaderBtnClassName}
                  aria-busy={receiptPrintStatus === "pending"}
                >
                  <span
                    className="pos-header-btn-label"
                    data-short={
                      receiptPrintStatus === "pending"
                        ? "Printing…"
                        : reprintSale?.order_num
                          ? `Reprint #${reprintSale.order_num}`
                          : "Reprint"
                    }
                  >
                    {receiptPrintStatus === "pending"
                      ? "Printing receipt…"
                      : reprintReceiptLabel}
                  </span>
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
                {failedSyncOrders.length > 0 ? (
                  <button
                    type="button"
                    disabled={offlineSyncing}
                    title={
                      failedSyncOrders[0]?.order_num != null
                        ? `Print receipt for failed offline order #${failedSyncOrders[0].order_num}`
                        : "Print receipt for the failed offline order"
                    }
                    onClick={() => void handlePrintFailedOfflineReceipt(failedSyncOrders[0])}
                    className={posHeaderBtnClassName}
                  >
                    Print failed
                    {failedSyncOrders[0]?.order_num != null
                      ? ` #${formatPosBrowseLabel(failedSyncOrders[0])}`
                      : ""}
                  </button>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <WorkspaceSwitcher
                  switchBlocked={false}
                  switchBlockedMessage="Offline sync continues in the background — you can switch workspaces."
                />
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
        open={floatDeclareDialogOpen}
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
        tillName={reportTillNo !== "—" ? reportTillNo : null}
        cashierName={posCashierName}
        showFloatBreakdown={requireTillFloat}
        organizationName={organizationName}
        moduleSettings={capabilities?.module_settings}
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
        onClose={handleZReportSignOut}
        onPrinted={handleZReportPrinted}
        payload={zReportPayload}
        organizationName={organizationName}
        showFloatBreakdown={requireTillFloat}
        fallbackCashierName={posCashierName}
        fallbackTillName={zReportTillName}
        moduleSettings={capabilities?.module_settings}
        embedded={!standalone}
        closeLabel="Sign out"
        signOutAfterFinish
      />

      <div
        className={`flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden${
          standalone ? " pos-standalone-frame" : " pos-backoffice-frame"
        }`}
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
                  Cash Sales #{activeOrderNum}
                </span>
              ) : null}
            </div>
            {standalone && cartBridgeStatus ? (
              <p
                className="mt-2 rounded-md border border-sky-300 bg-sky-100 px-2.5 py-2 text-xs font-semibold text-sky-950"
                role="status"
                aria-live="polite"
              >
                {cartBridgeStatus}
              </p>
            ) : null}
            {standalone && (offlineMode || failedSyncOrders.length > 0) ? (
              <div
                className={`mt-2 rounded-md border px-2.5 py-2 text-xs font-medium ${
                  offlineMode
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
              >
                {offlineMode ? (
                  <p>
                    {networkStatus === "slow"
                      ? "Slow connection — selling from local cache. Cash Sales # continues on this till."
                      : "Connection dropped — selling from local cache. Cash Sales # continues on this till."}
                  </p>
                ) : (
                  <p>
                    Sync failed for {failedSyncOrders.length} offline order
                    {failedSyncOrders.length === 1 ? "" : "s"}. Open{" "}
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => setPendingSyncOpen(true)}
                    >
                      Pending sync
                    </button>{" "}
                    to retry or reprint.
                  </p>
                )}
              </div>
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
                    onChange={() => toggleRetailWholesaleMode()}
                  />
                  Sell at retail prices
                  <span className="theme-subtext text-[10px] font-normal">(F12 — qty Enter applies per line)</span>
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
                    <SearchableSelect
                      className={`${SELECT_CLASS} min-w-[10rem] px-2 py-1 text-xs`}
                      value={selectedRouteId}
                      disabled={busy}
                      onChange={(value) => void handleRouteChange(value)}
                      placeholder="Select route…"
                      options={routes.map((route) => ({
                        value: String(route.id),
                        label:
                          route.route_name +
                          (Number(route.route_markup_price ?? 0) > 0
                            ? ` (+${Number(route.route_markup_price).toLocaleString()} markup)`
                            : ""),
                      }))}
                    />
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
                  busy={orderEditBusy}
                  loading={previousOrderLoading}
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
                  ref={productSearchRef}
                  inputRef={searchInputRef}
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  results={searchResults}
                  searching={searching}
                  selectedCode={selectedProductCode}
                  sellWholesale={sellWholesale}
                  retailByCode={retailByCode}
                  routeMarkupPerUnit={routeMarkupPerUnit}
                  onSelect={pickProduct}
                  onBarcodeEnter={handleBarcodeEnter}
                  barcodeEnabled={enableBarcodeScanner}
                  stockDisplayMode={stockDisplayMode}
                  posSalesConfig={posSalesConfig}
                  disabled={busy || posSearchSuspended}
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
                    if (e.repeat) return;
                    e.preventDefault();
                    lineFormQtyCommitRef.current = e.currentTarget.value;
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
                  onCompleteOrder={(updatedCart, options) =>
                    void handleMpesaOrderComplete(updatedCart, options)
                  }
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
          {instantAutoEditSync && isCartEditSession && !cartResubmitMessage ? (
            <div className={showCartToolbar ? "px-3 pt-3" : "px-3 pt-2"}>
              <div
                className={`mb-3 rounded-lg border px-3 py-2.5 text-sm ${
                  previousOrderEditReadyToPrint
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : kraEditBackgroundFiscalize
                      ? "border-amber-200 bg-amber-50 text-amber-950"
                      : "border-sky-200 bg-sky-50 text-sky-950"
                }`}
              >
                <p className="text-xs leading-relaxed">
                  {previousOrderEditReadyToPrint ? (
                    <>
                      Cash Sales #{formatPosBrowseLabel(cart)} saved on server.{" "}
                      <strong>Print the revised receipt</strong> — Alt+P or Reprint
                      {kraEditBackgroundFiscalize
                        ? " (without waiting for the fiscal QR)."
                        : "."}
                    </>
                  ) : kraEditBackgroundFiscalize ? (
                    <>
                      Revising Cash Sales #{formatPosBrowseLabel(cart)}. Edits sync in the
                      background — KRA credit notes balance when the order syncs online.{" "}
                      <strong>Alt+P</strong> (or Reprint): if the bill changed, enter the
                      top-up/return method, then print without the fiscal QR. F10 is not
                      required.
                      {editAutosaveBusy || pendingSync > 0
                        ? syncProgress?.message
                          ? ` ${syncProgress.message}`
                          : pendingSync > 0
                            ? " Syncing in background…"
                            : " Saving…"
                        : null}
                    </>
                  ) : (
                    <>
                      Revising Cash Sales #{formatPosBrowseLabel(cart)}. Edits save instantly —{" "}
                      <strong>F10 is not required</strong>. When finished, print with Alt+P or
                      Reprint.
                      {editAutosaveBusy || pendingSync > 0
                        ? syncProgress?.message
                          ? ` ${syncProgress.message}`
                          : pendingSync > 0
                            ? " Syncing in background…"
                            : " Saving…"
                        : null}
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : null}
          {isEditableResubmit || cartResubmitMessage ? (
            <div className={showCartToolbar ? "px-3 pt-3" : "px-3 pt-2"}>
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
            ref={cartLinesScrollRef}
            className={`pos-cart-table-wrap min-h-0 flex-1${
              classicLayout ? " overflow-hidden" : " overflow-auto"
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
                tableScrollRef={classicCartTableScrollRef}
                lines={cart?.lines ?? []}
                selectedLineId={selectedLineId}
                onSelectLine={(lineId) => handleClassicSelectLine(lineId)}
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
                  if (!String(value ?? "").trim() || looksLikePosOrderNumberLookup(value)) {
                    clearOrderNameSearch();
                  }
                }}
                onOrderNoSubmit={() => {
                  if (!enablePosOrderEdit) {
                    setStatusMessage(
                      "Enable “Allow editing completed POS orders” under Platform → Sales behaviour. Loading a previous receipt restores stock immediately; a KRA credit note is issued in the background when the original sale was fiscalized.",
                    );
                    return;
                  }
                  void handleEditSelectedOrder();
                }}
                orderNameResults={orderNameResults}
                orderNameLoading={orderNameLoading}
                orderNameHighlight={orderNameHighlight}
                onOrderNameHighlightChange={setOrderNameHighlight}
                onOrderNameSelect={(row) => void handleSelectOrderNameResult(row)}
                onOrderNameDismiss={() => {
                  if (!orderNameLoading) clearOrderNameSearch();
                }}
                orderNavError={orderEditError}
                showRetailModeHint={posSalesConfig.enableRetailPricing}
                sellAtRetail={retailPricingSession}
                onToggleRetailMode={() => toggleRetailWholesaleMode()}
                replacingLineId={replacingLineId}
                swapDraftLineId={swapDraft?.lineId ?? null}
                swapDraftQty={swapDraft?.quantity ?? ""}
                swapLinePreview={swapLinePreview}
                swapLineQtyRef={swapLineQtyRef}
                onScanCodeClick={(lineId) => beginReplaceCartLine(lineId)}
                selectionEnabled
                selectedLineIds={selectedLineIds}
                allLinesSelected={allCartLinesSelected((cart?.lines ?? []).map((l) => l.id))}
                someLinesSelected={someCartLinesSelected((cart?.lines ?? []).map((l) => l.id))}
                onToggleAllLines={(checked) =>
                  toggleAllCartLinesOnPage(checked, (cart?.lines ?? []).map((l) => l.id))
                }
                onToggleLineSelect={(lineId) => toggleCartLineSelect(lineId)}
                busy={cartInteractionBusy}
                lineBusy={lineBusy}
                showLineDiscount={showLineDiscountField}
                formatQty={(line) => {
                  const productMeta = productByCode[line.product_code];
                  const uom = productMeta?.uom;
                  return uom
                    ? formatSaleLineQtyDisplay(line.quantity, uom, {
                        isRetailLine: Number(line.on_wholesale_retail) === 1,
                      })
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
                onSetQty={(line, value) => void setCartLineEntryQuantity(line, value)}
                lineForceSameQtyCommit={(line) =>
                  Boolean(
                    posSalesConfig.enableRetailPricing &&
                      cartLineRetailStockFlag(line) !==
                        isPosRetailSession(sellWholesaleRef.current),
                  )
                }
                onSwapDraftQtyChange={(line, value) => handleSwapDraftQtyChange(line, value)}
                linePackage={(line) => {
                  const productMeta = productByCode[line.product_code];
                  const uom = productMeta?.uom;
                  return uom
                    ? uomCompactPackageLabel(uom)
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
                    cartLineDisplayUnitPrice(line, uom, isRetailLine, {
                      cashRound: enablePosCashRounding,
                    }),
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
                lineAmount={(line) =>
                  posDisplayCartLineAmount(
                    line.amount,
                    (cart?.lines ?? []).map((l) => l.amount),
                    {
                      cashRound: enablePosCashRounding,
                      orderDiscount: cartSummary.orderDiscount,
                    },
                  ).toLocaleString()
                }
                scanSearch={
                  <PosProductSearch
                    ref={productSearchRef}
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
                    routeMarkupPerUnit={routeMarkupPerUnit}
                    sellFromShop={sellFromShop}
                    onSelect={pickProduct}
                    onBarcodeEnter={handleBarcodeEnter}
                    onEscapeKey={replacingLineId ? cancelReplaceCartLine : null}
                    barcodeEnabled={enableBarcodeScanner}
                    stockDisplayMode={stockDisplayMode}
                    posSalesConfig={posSalesConfig}
                    disabled={busy || posSearchSuspended}
                  />
                }
                qtyRef={qtyInputRef}
                entryDescription={lineForm.description}
                entryPackage={lineForm.package}
                entryQty={lineForm.quantity}
                entryQtyUnit={qtyFieldMeta?.unit ?? ""}
                entryUnitPrice={lineForm.unit_price}
                entryAmount={
                  entryRowComputed
                    ? (enablePosCashRounding
                        ? roundLightStoresAmount(entryRowComputed.lineAmount)
                        : entryRowComputed.lineAmount)
                    : 0
                }
                entryReady={Boolean(selectedProduct && lineForm.product_code && !replacingLineId)}
                onEntryQtyChange={(value) =>
                  setLineForm((p) => ({ ...p, quantity: value }))
                }
                onEntryQtyCommit={() => {
                  if (qtyInputRef.current?.value != null) {
                    lineFormQtyCommitRef.current = qtyInputRef.current.value;
                  }
                  handleQuantityEnter();
                }}
                onEntryQtyKeyDown={(e) => {
                  if (isPosFunctionKeyEvent(e)) return;
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    focusProductSearch();
                    return;
                  }
                  if (e.key === "Enter") {
                    if (e.repeat) return;
                    e.preventDefault();
                    lineFormQtyCommitRef.current = e.currentTarget.value;
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
                            ? uomCompactPackageLabel(uom)
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
                                ? formatSaleLineQtyDisplay(line.quantity, uom, {
                                    isRetailLine: Number(line.on_wholesale_retail) === 1,
                                  })
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
                            cartLineDisplayUnitPrice(line, uom, isRetailLine, {
                              cashRound: enablePosCashRounding,
                            }),
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
                          {posDisplayCartLineAmount(
                            line.amount,
                            (cart?.lines ?? []).map((l) => l.amount),
                            {
                              cashRound: enablePosCashRounding,
                              orderDiscount: cartSummary.orderDiscount,
                            },
                          ).toLocaleString()}
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
                instantAutoEditSync && modernOrderEditLocked ? (
                  <PosActionButton
                    label={previousOrderEditReadyToPrint ? "Print receipt" : "Reprint"}
                    title={
                      previousOrderEditReadyToPrint
                        ? "Order saved — print the revised receipt (Alt+P)"
                        : "Reprint revised receipt (Alt+P)"
                    }
                    icon="🖨"
                    iconClass="pos-cart-action-icon--complete"
                    disabled={busy || !cart?.lines?.length || receiptPrintStatus === "pending"}
                    onClick={() => void handlePrintReceipt()}
                  />
                ) : (
                <PosActionButton
                  label="Complete"
                  title={
                      modernOrderEditLocked
                        ? "Complete payment and save this order (F10) — works even if lines are unchanged"
                        : checkoutBlocked
                      ? "Wait for the line to finish saving"
                      : "Complete payment (F10)"
                  }
                  icon="🛒"
                  iconClass="pos-cart-action-icon--complete"
                    disabled={
                      busy
                      || !cart?.lines?.length
                      || cartStockBlocked
                      || (!modernOrderEditLocked && (lineBusy || checkoutBlocked))
                    }
                  onClick={() => void openCompletePayment()}
                />
                )
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

      <PosEditPaymentAdjustmentDialog
        open={Boolean(editAdjustmentDialog)}
        delta={editAdjustmentDialog?.delta ?? null}
        orderNum={editAdjustmentDialog?.orderNum ?? null}
        confirmLabel={editAdjustmentDialog?.confirmLabel ?? "Save & continue"}
        onConfirm={(adjustments) => {
          resolveEditAdjustmentRef.current?.resolve(adjustments);
          resolveEditAdjustmentRef.current = null;
          setEditAdjustmentDialog(null);
        }}
        onCancel={() => {
          resolveEditAdjustmentRef.current?.reject(new Error("cancelled"));
          resolveEditAdjustmentRef.current = null;
          setEditAdjustmentDialog(null);
        }}
      />

      <PosKraProductUploadDialog
        open={Boolean(kraUploadPrompt)}
        productCodes={kraUploadPrompt?.productCodes ?? []}
        productLabels={kraUploadPrompt?.productLabels ?? []}
        busy={kraUploadBusy || busy}
        error={kraUploadError}
        onUpload={() => void handlePosKraProductUpload()}
        onClose={() => {
          if (kraUploadBusy) return;
          setKraUploadPrompt(null);
          setKraUploadError(null);
          kraCheckoutRetryRef.current = null;
        }}
      />

      <PosPaymentPanel
        open={paymentOpen}
        onClose={() => {
          setPaymentOpen(false);
          setReceiptPrintStatus(null);
          setKraUploadPrompt(null);
          setKraUploadError(null);
          kraCheckoutRetryRef.current = null;
        }}
        billTotal={paymentPanelBillTotal}
        previousOrderEditAdjustment={previousOrderEditAdjustment}
        channel={channel}
        workflow={channelWorkflow}
        paymentConfig={checkoutPaymentConfig}
        prefillMpesaAmount={cart?.mpesa_payment_amount}
        prefillMpesaCode={cart?.mpesa_transaction_code}
        prefillMpesaPhone={cart?.mpesa_phone}
        prefillCashAmount={cart?.cash_payment_amount}
        prefillEquityAmount={cart?.equity_payment_amount}
        prefillKcbAmount={cart?.kcb_payment_amount}
        prefillChequeAmount={cart?.cheque_payment_amount}
        prefillBankAmount={cart?.bank_payment_amount}
        prefillBankType={
          ["BANK", "OTHER", "ECOBANK", "CARD"].includes(
            String(cart?.payment_method_code ?? "").toUpperCase(),
          )
            ? String(cart.payment_method_code).toUpperCase()
            : ""
        }
        prefillWalkInCustomerName={prefilledEditCustomerName}
        lockMpesaFields={Number(cart?.mpesa_payment_amount ?? 0) > 0}
        cartId={cart?.id ?? null}
        enableStkPush={enableStkPushOnPos && !posNetworkPaymentsBlocked}
        onCartUpdated={(nextCart) => {
          if (!nextCart) return;
          cartRef.current = nextCart;
          setCart(nextCart);
        }}
        onStkFullyPaid={(updatedCart, options) => handleMpesaOrderComplete(updatedCart, options)}
        saving={busy}
        error={paymentError}
        onComplete={handleCheckout}
        onContinueNextOrder={handleContinueNextOrder}
        receiptPrintStatus={receiptPrintStatus}
        onReprintReceipt={() => void handlePrintReceipt()}
        embedded={!standalone}
        cashOnlyOffline={posNetworkPaymentsBlocked}
      />

      <PosSaveOrderDialog
        open={saveOrderOpen}
        mode={orderDialogMode}
        onClose={() => {
          posShortcutStateRef.current = {
            ...posShortcutStateRef.current,
            saveOrderOpen: false,
          };
          setSaveOrderOpen(false);
          setSaveOrderError(null);
        }}
        prefillWalkInName={prefilledEditCustomerName}
        prefillCustomerNum={prefilledEditCustomerNum}
        saving={busy}
        error={saveOrderError}
        onSave={handleSaveOrder}
        enableHeldAmountPaid={Boolean(posSalesConfig.enableHeldOrderAmountPaid)}
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
        workspaceHasLines={(cartRef.current?.lines?.length ?? cart?.lines?.length ?? 0) > 0}
        cartSeed={{
          branch_id: cart?.branch_id ?? user?.branch_id ?? null,
          till_id: cart?.till_id ?? null,
          float_session_id: cart?.float_session_id ?? floatSessionId ?? null,
        }}
        classicTheme={classicLayout}
        themeStyle={classicThemeBridgeVars}
        onRestored={async (restoredCart, sourceSale, meta = {}) => {
          setHeldOrdersOpen(false);
          setSaveOrderOpen(false);
          setPaymentOpen(false);

          // restore-to-cart already used replace:true on the same TemporaryCart — do not
          // DELETE /lines afterward (that wiped the just-restored cart and added latency).
          const prior = cartRef.current ?? cart;
          const restoredSameCart =
            isServerPosCartId(prior?.id) &&
            isServerPosCartId(restoredCart?.id) &&
            String(prior.id) === String(restoredCart.id);
          const clearPriorWorkspace = () => {
            if (
              restoredSameCart ||
              !isServerPosCartId(prior?.id) ||
              (prior?.lines?.length ?? 0) === 0
            ) {
              return;
            }
            markServerCartConsumed(prior.id);
            void apiRequest(`/sales/carts/${prior.id}/lines`, {
              method: "DELETE",
              loading: false,
              reportIssues: false,
            }).catch(() => {});
          };

          if (meta?.local || restoredCart?.offline || isLocalHeldId(sourceSale?.id)) {
            if (offlineMode) {
              const saved = await saveLocalPosCart({ ...restoredCart, offline: true });
              applyRestoredHeldCart(presentLocalOfflineCart(saved), sourceSale);
            } else {
              // Paint held lines immediately; TemporaryCart create runs in background.
              applyRestoredHeldCart(restoredCart, sourceSale);
              clearPriorWorkspace();
              scheduleLocalHeldMaterialize(restoredCart, sourceSale);
            }
          } else {
            clearPriorWorkspace();
            const enrichedSource = resolveRestoredSourceSale(
              restoredCart,
              sourceSale,
              sourceSale?.id,
            );
            applyRestoredHeldCart(restoredCart, enrichedSource);
          }
          setStatusMessage("Held order restored — ready to complete as a new sale.");
          if (standalone) {
            notifySuccess("Held order restored — complete when ready.");
          }
          if (classicLayout) {
            focusClassicProductSearch();
          }
        }}
        onRestoreFailed={(message) => {
          setHeldOrdersOpen(true);
          notifyError(message || "Failed to restore held order");
        }}
        embedded={!standalone}
      />

      <PosPendingSyncOverlay
        open={pendingSyncOpen}
        onClose={closePendingSyncOverlay}
        onCountChange={handlePendingSyncCountChange}
        syncing={offlineSyncing}
        canFlush={canFlushOutbox}
        syncProgress={syncProgress}
        lastSyncMessage={lastSyncMessage}
        onSyncAll={syncOfflineOrders}
        onSyncOrder={syncSingleOfflineOrder}
        onDiscarded={() => {
          // Count already applied via onCountChange; refresh in case ticket seq changed.
          void refreshOfflineCounts();
          const current = cartRef.current;
          if (
            current?.offline_client_sale_uuid ||
            (current?.offline && !(current?.lines?.length > 0))
          ) {
            void startFreshWorkspace();
          }
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
        holdLabel={autoHeldPrompt?.holdLabel}
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
        routeMarkupPerUnit={routeMarkupPerUnit}
        uomById={uomById}
        vatById={vatById}
        branchId={user?.branch_id}
        embedded={!standalone}
      />

      <PosPreviousOrderLoadingOverlay
        open={previousOrderLoading}
        message={previousOrderLoadingMessage}
        detail={previousOrderLoadingDetail}
        soft={previousOrderLoadingSoft}
      />
      <PosPrepareNextOrderOverlay
        open={preparingNextOpen}
        progress={preparingNextProgress}
      />

      {standalone ? (
        classicLayout ? (
          <>
            {(offlineSyncing && pendingSync > 0) || failedSyncOrders.length > 0 ? (
              <div className="classic-pos-offline-sync-strip shrink-0 border-t border-[var(--theme-border)] bg-sky-50 px-3 py-1.5 text-sky-950">
                {failedSyncOrders.length > 0 ? (
                  <p className="text-xs font-medium text-amber-950">
                    {failedSyncOrders.length} offline order
                    {failedSyncOrders.length === 1 ? "" : "s"} failed to sync.{" "}
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => setPendingSyncOpen(true)}
                    >
                      Open Pending sync
                    </button>{" "}
                    to retry.
                  </p>
                ) : (
                  <p className="text-xs font-medium text-sky-950">
                    {syncProgress?.message || "Syncing offline orders…"}
                  </p>
                )}
              </div>
            ) : null}
            <ClassicPosStatusFooter
              user={user}
              totals={cartSummary?.total ?? 0}
              heldCount={heldOrdersCount}
              version="1.0.0"
              currencySettings={classicCurrencySettings}
              statusMessage={
                offlineSyncing && pendingSync > 0 && syncProgress?.message
                  ? syncProgress.message
                  : cartBridgeStatus || statusMessage
              }
              connectionStatus={networkStatus}
            />
          </>
        ) : (
          <PosStatusFooter
            user={user}
            organization={organization ?? capabilities?.organization}
          />
        )
      ) : null}

      {checkoutWaitOverlay}

      {classicLayout && standalone ? (
        <BatchActionBar count={selectedLineCount} onClear={clearClassicLineSelection}>
          <BatchDeleteButton
            count={selectedLineCount}
            busy={busy || lineBusy}
            onClick={() => void removeSelectedLines()}
          />
        </BatchActionBar>
      ) : null}
    </div>
  );
}

export default PosScreen;
