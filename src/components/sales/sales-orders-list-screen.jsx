"use client";

import { createPortal } from "react-dom";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { mapWithConcurrency, fetchAllPages } from "@/lib/api-concurrency";
import { saleLineProductName } from "@/lib/sale-line-items";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListPageSize, useTableSort } from "@/lib/use-list-page-controls";
import { fetchBranchesCached, fetchRoutesAndUomsCached, fetchSalesCapableUsersCached } from "@/lib/reference-data-cache";
import { filterByOrganization } from "@/lib/admin";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { useAuth } from "@/contexts/auth-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { AiAnalyzeButton, AiInsightPanel } from "@/components/ai/ai-insight-panel";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { formatNavLabel } from "@/lib/nav-label-format";
import {
  getOrderWorkflow,
  getSalesOrderQueueWorkflow,
  isPaymentGatedWorkflowTransition,
  resolveSalesOrderQueue,
  saleBalanceDue,
  canCollectPaymentOnQueue,
  canConvertPaymentStatusOnQueue,
  canCancelOrder,
  canRestoreCancelledOrder,
  cancelledOrderRestoreTarget,
  canRestoreExpiredOrder,
  expiredOrderRestoreTarget,
  isPrintInvoiceVisible,
  isPrintProformaVisible,
  isCustomerReturnAllowedForOrder,
  workflowStatusFilterOptions,
  workflowStatusLabel,
} from "@/lib/order-workflow";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FilterToolbar,
  FILTER_CONTROL_CLASS,
  PaginationBar,
  SearchInput,
  SECONDARY_BTN_CLASS,
  ActiveSortChip,
} from "@/components/catalog/catalog-shared";
import {
  BatchActionBar,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";
import { defaultDateRange, isoDate } from "@/components/inventory/inventory-shared";
import { shouldShowSalesDiscountColumn, canApproveDiscountRequests, isMobileOrdersReturnsCardEnabled, isMobileOrdersPaymentsCardEnabled } from "@/lib/sales-settings";
import { MobileOrdersQuickActions } from "@/components/sales/mobile-orders-quick-actions";
import { orderTableColumnCount } from "@/components/sales/sales-orders-columns";
import {
  orderSourceFilterOptions,
  OrderContextMenu,
  OrderListTableHead,
  OrderListTableRow,
  OrderSummaryStats,
  buildOrderContextMenuItems,
  saleBranchLabel,
  normalizeOrdersListSummary,
  summarizeOrders,
} from "@/components/sales/sales-orders-shared";
import { printSaleOrder, resolveOrderPrintType, warmSalePrintBatch, prepareSaleOrderPrintJob, dispatchPreparedSalePrintJob } from "@/components/sales/sale-order-print";
import { requestOrderPrintType } from "@/lib/order-print-type-picker";
import { isExternalPosEnabled } from "@/lib/nav-feature-gates";
import { isPlatformWhatsappEnabled } from "@/lib/platform-org-features";
import { routeOrderSourcesText } from "@/lib/distribution-settings";
import {
  ORDER_LIST_COLUMN_OPTIONS,
  defaultOrderListPrintDocumentType,
  getOrdersListVisibleColumns,
  getOrdersListDefaultDateRange,
  getOrdersListSort,
  isOrgMobileSalesEnabled,
  normalizeOrdersListVisibleColumns,
  orderListDateRangeUsesArchive,
  ORDERS_HOT_WINDOW_DAYS,
  orderListPrintAriaLabel,
  sortOrdersForList,
} from "@/lib/sales-settings";
import {
  disposePrintWindow,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";
import {
  isSaleOrderBrowserPrintWindowRequired,
  openSaleOrderPrintWindow,
  shouldUsePrintAgentForDocument,
} from "@/lib/print-dispatch";
import { warmPrintAgentHealth } from "@/lib/print-agent";
import { useConfirm } from "@/lib/use-confirm";
import { DiscountRejectionDialog } from "@/components/discount-rejection-dialog";
import { discountApprovalLinesFromSource } from "@/lib/advised-discount-lines";
import { useFulfillmentTransition } from "@/lib/use-fulfillment-transition";
import {
  formatOrderNumber,
  isOrderEditActionVisible,
  normalizeSalesListSearchQuery,
  shouldOpenBackofficeOrderEdit,
  shouldRestoreOrderToCart,
  describeMobileOrderMergeSelection,
} from "@/lib/sales";
import { P } from "@/lib/permission-codes";
import {
  FulfillmentAssignmentDialog,
  PodCaptureDialog,
} from "@/components/fulfillment/fulfillment-assignment-dialog";
import { ProductWeightPromptDialog } from "@/components/fulfillment/product-weight-prompt-dialog";
import { BackofficeOrderEditModal } from "@/components/sales/backoffice-order-edit-modal";
import { SalePosPaymentPanel } from "@/components/sales/sale-pos-payment-panel";
import { ActionFeedbackBanner } from "@/components/shared/action-feedback-banner";
import { usePosSession } from "@/contexts/pos-session-context";

/** First click on these columns should show newest / highest first. */
const ORDERS_TABLE_SORT_FIRST_DIR = {
  created_at: "desc",
  order_num: "desc",
  order_total: "desc",
};

/** Fetch this many order details / HTML jobs in parallel before queueing the chunk. */
const BATCH_PRINT_CHUNK_SIZE = 5;
const ORDER_COLUMNS_STORAGE_PREFIX = "sales.orders.visibleColumns";

function chunkItems(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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

function summarizePrintFailures(failureReasons, failed) {
  if (failed <= 0) return null;
  const unique = [...new Set(failureReasons.filter(Boolean))];
  if (unique.length === 0) return `${failed} failed`;
  const sample = unique.slice(0, 2).join(" · ");
  return `${failed} failed (${sample}${unique.length > 2 ? "…" : ""})`;
}

/** Print jobs run in the background — do not freeze the table UI. */
function isPrintBatchBusy(busy) {
  return (
    busy === "print" ||
    busy === "print-load" ||
    busy === "print-all" ||
    busy === "print-all-load"
  );
}

function indexPaymentRefs(payments) {
  const map = new Map();
  for (const payment of payments ?? []) {
    const saleId = payment?.sale_id;
    if (saleId == null) continue;
    const ref = String(payment.reference_number ?? "").trim();
    if (!ref) continue;
    if (!map.has(saleId)) map.set(saleId, []);
    map.get(saleId).push(ref);
  }
  return map;
}

function buildOrdersColumnStorageKey(user, queueSlug = "all") {
  return [
    ORDER_COLUMNS_STORAGE_PREFIX,
    user?.organization_id ?? "org",
    user?.id ?? "user",
    queueSlug || "all",
  ].join(":");
}

function readStoredOrdersColumnIds(storageKey, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return normalizeOrdersListVisibleColumns(Array.isArray(parsed) ? parsed : fallback);
  } catch {
    return fallback;
  }
}

function ColumnsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
      <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
      <path d="M6 3v4M10 8v4M14 13v4" strokeLinecap="round" />
    </svg>
  );
}

function OrdersColumnsMenu({
  open,
  onOpen,
  onClose,
  visibleColumnIds,
  onToggleColumn,
  onReset,
  availableColumns,
}) {
  const [menuStyle, setMenuStyle] = useState(null);
  const [buttonNode, setButtonNode] = useState(null);

  useEffect(() => {
    if (!open || !buttonNode) return;
    const rect = buttonNode.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
      zIndex: 80,
    });
  }, [open, buttonNode]);

  return (
    <div className="relative shrink-0">
      <button
        ref={setButtonNode}
        type="button"
        onClick={open ? onClose : onOpen}
        className={`${SECONDARY_BTN_CLASS} gap-2 px-3 py-2.5`}
      >
        <ColumnsIcon />
        Columns
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[70] cursor-default"
                aria-label="Close columns"
                onClick={onClose}
              />
              <div
                style={menuStyle ?? undefined}
                className="theme-panel fixed z-[80] w-64 rounded-xl border p-3 shadow-lg"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="theme-subtext text-xs font-semibold uppercase tracking-wide">
                    Show columns
                  </p>
                  <button
                    type="button"
                    onClick={onReset}
                    className="text-xs font-medium text-blue-600 hover:text-blue-500"
                  >
                    Reset
                  </button>
                </div>
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                  {availableColumns.map((column) => {
                    const checked = visibleColumnIds.includes(column.id);
                    return (
                      <li key={column.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--theme-text-muted)] hover:bg-[var(--theme-hover)]">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={checked}
                            onChange={() => {
                              // Keep at least one column visible.
                              if (checked && visibleColumnIds.length <= 1) return;
                              onToggleColumn(column.id);
                            }}
                          />
                          {column.label}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

export default function SalesOrdersListScreen({
  queueSlug = null,
  routeOrdersOnly = false,
  routeOrdersDateRangeDays = 30,
  shopDebtorsOnly = false,
}) {
  const paymentQueueSlug = shopDebtorsOnly ? "unpaid" : queueSlug;
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const { user, capabilities, organization, hasPermission } = useAuth();
  const { floatSessionId } = usePosSession();
  const orgWorkflow = useMemo(
    () => getSalesOrderQueueWorkflow(capabilities, "backend"),
    [capabilities],
  );
  const includeMobileOrders = isOrgMobileSalesEnabled(capabilities);
  const includeWhatsappOrders = isPlatformWhatsappEnabled(capabilities);
  const showMobileReturnsCard =
    queueSlug === "mobile" && isMobileOrdersReturnsCardEnabled(capabilities);
  const showMobilePaymentsCard =
    queueSlug === "mobile" && isMobileOrdersPaymentsCardEnabled(capabilities);
  const queueConfig = useMemo(
    () =>
      resolveSalesOrderQueue(queueSlug, orgWorkflow, {
        includeMobile: includeMobileOrders,
        includeWhatsapp: includeWhatsappOrders,
        capabilities,
      }),
    [queueSlug, orgWorkflow, includeMobileOrders, includeWhatsappOrders, capabilities],
  );
  const ordersTabTitle = useMemo(() => {
    if (shopDebtorsOnly) return "Shop debtors";
    if (routeOrdersOnly) {
      return formatNavLabel(queueConfig?.title ?? "Route orders");
    }
    return formatNavLabel(queueConfig?.title ?? "All Orders");
  }, [shopDebtorsOnly, routeOrdersOnly, queueConfig?.title]);
  useTabTitle(ordersTabTitle);
  const statusOptions = useMemo(() => {
    const options = workflowStatusFilterOptions(orgWorkflow);
    if (queueConfig?.slug === "mobile") {
      return options.filter((o) => o.value !== "cancelled");
    }
    return options;
  }, [orgWorkflow, queueConfig?.slug]);
  const includeExternalPos = isExternalPosEnabled(capabilities);
  const sourceOptions = useMemo(() => {
    const options = orderSourceFilterOptions(
      includeMobileOrders && !shopDebtorsOnly,
      includeExternalPos,
      includeWhatsappOrders && !shopDebtorsOnly,
    );
    return options;
  }, [includeMobileOrders, includeExternalPos, includeWhatsappOrders, shopDebtorsOnly]);

  const [rows, setRows] = useState([]);
  const [orderSummary, setOrderSummary] = useState(null);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    const q = searchParams?.get?.("q");
    if (q != null && String(q).trim() !== "") {
      setSearch(String(q));
    }
  }, [searchParams]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [cashierFilter, setCashierFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFromDate, setAppliedFromDate] = useState("");
  const [appliedToDate, setAppliedToDate] = useState("");
  const [listScope, setListScope] = useState(null);
  const [listFiltersInitialized, setListFiltersInitialized] = useState(false);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10, { persist: false });
  const [detailsById, setDetailsById] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [transitionBusyId, setTransitionBusyId] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [uomById, setUomById] = useState(() => new Map());
  const [branches, setBranches] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [routeById, setRouteById] = useState(() => new Map());
  const [paymentRefsBySaleId, setPaymentRefsBySaleId] = useState(() => new Map());
  const [contextMenu, setContextMenu] = useState(null);
  const [batchBusy, setBatchBusy] = useState(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const defaultVisibleColumnIds = useMemo(
    () => getOrdersListVisibleColumns(capabilities?.module_settings, queueConfig?.slug ?? "all"),
    [capabilities?.module_settings, queueConfig?.slug],
  );
  const ordersColumnStorageKey = useMemo(
    () => buildOrdersColumnStorageKey(user, shopDebtorsOnly ? "shop-debtors" : queueSlug),
    [user, queueSlug, shopDebtorsOnly],
  );
  const [visibleColumnIds, setVisibleColumnIds] = useState(defaultVisibleColumnIds);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();
  const [editSale, setEditSale] = useState(null);
  const [paySale, setPaySale] = useState(null);
  const [rejectContext, setRejectContext] = useState(null);
  const [columnFilters, setColumnFilters] = useState({
    order: "",
    customer: "",
    amount: "",
    status: "",
    method: "",
    source: "",
    placed_by: "",
  });
  const debouncedColumnFilters = useDebouncedValue(columnFilters, 350);
  useEffect(() => {
    setVisibleColumnIds(readStoredOrdersColumnIds(ordersColumnStorageKey, defaultVisibleColumnIds));
  }, [ordersColumnStorageKey, defaultVisibleColumnIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ordersColumnStorageKey, JSON.stringify(visibleColumnIds));
  }, [ordersColumnStorageKey, visibleColumnIds]);

  const {
    sort: tableSort,
    sortDir: tableSortDir,
    sortActive: tableSortActive,
    toggleSort: toggleTableSort,
    clearSort: clearTableSort,
  } = useTableSort("sales-orders-table-sort", {
    firstDirByColumn: ORDERS_TABLE_SORT_FIRST_DIR,
  });

  const effectiveStatusFilter = queueConfig?.lockStatusFilter
    ? queueConfig.fixedStatusFilter
    : statusFilter;
  const effectiveSourceFilter = queueConfig?.lockSourceFilter
    ? queueConfig.fixedSourceFilter
    : sourceFilter;
  // Source is only useful on View All — queue pages (Mobile, Unpaid, Paid, …) already imply context.
  const showSourceFilter =
    !queueConfig?.lockSourceFilter &&
    (!queueConfig?.slug || queueConfig.slug === "all");
  const showRouteFilter = routeOrdersOnly || queueConfig?.slug === "mobile";

  const routeFilterOptions = useMemo(() => {
    const routes = [...routeById.values()].sort((a, b) =>
      String(a.route_name ?? "").localeCompare(String(b.route_name ?? "")),
    );
    return [
      { value: "all", label: "All routes" },
      ...routes.map((route) => ({
        value: String(route.id),
        label: route.route_name || `Route #${route.id}`,
      })),
    ];
  }, [routeById]);

  const sellerFilterOptions = useMemo(() => {
    const list = sellers
      .map((u) => ({
        value: String(u.id),
        label: u.full_name?.trim() || u.username || `User #${u.id}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "all", label: "All users" }, ...list];
  }, [sellers]);

  const ordersListSort = useMemo(() => {
    if (tableSort) {
      return tableSortDir === "desc" ? `-${tableSort}` : tableSort;
    }
    return getOrdersListSort(capabilities?.module_settings);
  }, [tableSort, tableSortDir, capabilities?.module_settings]);

  const activeSortLabel = useMemo(() => {
    if (!tableSortActive || !tableSort) return null;
    const labels = {
      order_num: "Order #",
      customer_name: "Customer",
      order_total: "Amount",
      status: "Status",
      channel: "Source",
      created_at: "Placed date",
    };
    const dir = tableSortDir === "desc" ? "high to low / newest first" : "low to high / oldest first";
    return `${labels[tableSort] ?? tableSort} (${dir})`;
  }, [tableSortActive, tableSort, tableSortDir]);

  useEffect(() => {
    const range = shopDebtorsOnly
      ? defaultDateRange(365)
      : routeOrdersOnly && routeOrdersDateRangeDays
        ? defaultDateRange(routeOrdersDateRangeDays)
        : queueConfig?.dateRangeDays
          ? defaultDateRange(queueConfig.dateRangeDays)
          : getOrdersListDefaultDateRange(capabilities?.module_settings);
    setFromDate(range.from);
    setToDate(range.to);
    setAppliedFromDate(range.from);
    setAppliedToDate(range.to);
    setListFiltersInitialized(true);
  }, [
    capabilities?.module_settings,
    queueConfig?.dateRangeDays,
    queueSlug,
    routeOrdersOnly,
    routeOrdersDateRangeDays,
    shopDebtorsOnly,
  ]);

  useEffect(() => {
    if (!includeMobileOrders && sourceFilter === "mobile") {
      setSourceFilter("all");
    }
  }, [includeMobileOrders, sourceFilter]);

  useEffect(() => {
    if (queueConfig?.slug === "mobile" && statusFilter === "cancelled") {
      setStatusFilter("all");
    }
  }, [queueConfig?.slug, statusFilter]);

  useEffect(() => {
    if (!includeWhatsappOrders && sourceFilter === "whatsapp") {
      setSourceFilter("all");
    }
  }, [includeWhatsappOrders, sourceFilter]);

  useEffect(() => {
    if (!includeExternalPos && sourceFilter === "pos") {
      setSourceFilter("all");
    }
  }, [includeExternalPos, sourceFilter]);

  useEffect(() => {
    const orgId = user?.organization_id;
    fetchBranchesCached(orgId)
      .then((list) => setBranches(list))
      .catch(() => setBranches([]));
  }, [user?.organization_id]);

  useEffect(() => {
    const orgId = user?.organization_id;
    if (!orgId) {
      setSellers([]);
      return;
    }
    fetchSalesCapableUsersCached(orgId)
      .then((list) => {
        const scoped = filterByOrganization(list ?? [], orgId).filter(
          (u) => u.is_active !== false,
        );
        setSellers(scoped);
      })
      .catch(() => setSellers([]));
  }, [user?.organization_id]);

  useEffect(() => {
    const orgId = user?.organization_id;
    fetchRoutesAndUomsCached(orgId)
      .then(({ routes, uoms }) => {
        const routeMap = new Map();
        for (const route of routes) {
          if (route?.id != null) routeMap.set(route.id, route);
        }
        setRouteById(routeMap);
        const uomMap = new Map();
        for (const u of uoms) {
          if (u?.id != null) uomMap.set(u.id, u);
        }
        setUomById(uomMap);
      })
      .catch(() => {
        setRouteById(new Map());
        setUomById(new Map());
      });
  }, [user?.organization_id]);

  useEffect(() => {
    const saleIds = rows.map((sale) => sale.id).filter(Boolean);
    if (!saleIds.length) {
      setPaymentRefsBySaleId(new Map());
      return;
    }
    apiRequest("/sale-payments", {
      searchParams: { sale_ids: saleIds.join(","), per_page: 200 },
    })
      .then((res) => setPaymentRefsBySaleId(indexPaymentRefs(res.data)))
      .catch(() => setPaymentRefsBySaleId(new Map()));
  }, [rows]);

  const visibleColumnSet = useMemo(() => new Set(visibleColumnIds), [visibleColumnIds]);
  const branchColumnAvailable = branches.length > 1;
  const routeColumnAvailable = routeOrdersOnly || Boolean(queueConfig?.showRouteColumn);
  const deliveryDateColumnAvailable = routeOrdersOnly || Boolean(queueConfig?.showDeliveryDateColumn);
  const connectivityColumnAvailable = Boolean(queueConfig?.showConnectivityColumn);
  const sourceColumnAvailable = !routeOrdersOnly && sourceOptions.length > 2;
  const discountColumnAvailable = shouldShowSalesDiscountColumn(capabilities?.module_settings);
  const paymentBreakdownColumnsAvailable =
    shopDebtorsOnly ||
    ["unpaid", "partial"].includes(
      String(queueConfig?.fixedPaymentStatusFilter ?? "").toLowerCase(),
    ) ||
    ["unpaid", "pending_payment"].includes(String(queueSlug ?? "").toLowerCase());
  const showBranchColumn = branchColumnAvailable && visibleColumnSet.has("branch");
  const showRouteColumn = routeColumnAvailable && visibleColumnSet.has("route");
  const showDeliveryDateColumn =
    deliveryDateColumnAvailable && visibleColumnSet.has("delivery_date");
  const showConnectivityColumn =
    connectivityColumnAvailable && visibleColumnSet.has("connectivity");
  const showSourceColumn = sourceColumnAvailable && visibleColumnSet.has("source");
  const showDiscountColumn = discountColumnAvailable && visibleColumnSet.has("discount");
  const showAmountPaidColumn =
    paymentBreakdownColumnsAvailable && visibleColumnSet.has("amount_paid");
  const showBalanceColumn =
    paymentBreakdownColumnsAvailable && visibleColumnSet.has("balance");
  const showPaymentBreakdownColumns = showAmountPaidColumn || showBalanceColumn;
  const showApprovalColumn =
    queueSlug === "pending-approval" || queueSlug === "pending_approval";
  const showRejectionStrip = queueSlug === "editable";
  const canApproveDiscounts = canApproveDiscountRequests({ hasPermission, capabilities });
  const availableOrderColumns = useMemo(
    () =>
      ORDER_LIST_COLUMN_OPTIONS.filter((column) => {
        if (column.id === "branch") return branchColumnAvailable;
        if (column.id === "route") return routeColumnAvailable;
        if (column.id === "delivery_date") return deliveryDateColumnAvailable;
        if (column.id === "connectivity") return connectivityColumnAvailable;
        if (column.id === "source") return sourceColumnAvailable;
        if (column.id === "discount") return discountColumnAvailable;
        if (column.id === "amount_paid" || column.id === "balance") {
          return paymentBreakdownColumnsAvailable;
        }
        return true;
      }),
    [
      branchColumnAvailable,
      routeColumnAvailable,
      deliveryDateColumnAvailable,
      connectivityColumnAvailable,
      sourceColumnAvailable,
      discountColumnAvailable,
      paymentBreakdownColumnsAvailable,
    ],
  );
  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );
  const columnCount = orderTableColumnCount({
    showOrderColumn: visibleColumnSet.has("order"),
    showCustomerColumn: visibleColumnSet.has("customer"),
    showBranchColumn,
    showRouteColumn,
    showDeliveryDateColumn,
    showConnectivityColumn,
    showAmountColumn: visibleColumnSet.has("amount"),
    showAmountPaidColumn,
    showBalanceColumn,
    showVatColumn: visibleColumnSet.has("vat"),
    showStatusColumn: visibleColumnSet.has("status"),
    showMethodColumn: visibleColumnSet.has("method"),
    showSourceColumn,
    showPlacedByColumn: visibleColumnSet.has("placed_by"),
    showDiscountColumn,
    showSelectionColumn: true,
  });

  const loadingFromArchive =
    Boolean(listScope?.from_archive) ||
    orderListDateRangeUsesArchive(
      appliedFromDate,
      queueConfig?.dateRangeDays || ORDERS_HOT_WINDOW_DAYS,
    );
  const showArchiveLoading =
    (loading || listLoading) && loadingFromArchive;
  const showTableLoading = loading || (listLoading && rows.length === 0);
  const showRefreshOverlay = listLoading && !loading && rows.length > 0 && !showArchiveLoading;

  const buildOrdersListSearchParams = useCallback(
    (pageNum, perPageNum) => {
      const filters = {};
      const statusFromColumn = String(debouncedColumnFilters.status ?? "").trim();
      const statusParam = queueConfig?.lockStatusFilter
        ? queueConfig.fixedStatusFilter
        : statusFromColumn
          ? statusFromColumn
          : effectiveStatusFilter !== "all"
            ? effectiveStatusFilter
            : null;
      if (statusParam) filters.status = statusParam;
      if (queueConfig?.fixedPaymentStatusFilter) {
        filters.payment_status = queueConfig.fixedPaymentStatusFilter;
      }
      if (cashierFilter && cashierFilter !== "all") {
        filters.cashier_id = cashierFilter;
      }

      const extra = {
        exclude_status: "held",
        with_items: 0,
        sort: ordersListSort,
      };
      if (queueConfig?.includeStatuses?.length) {
        extra.status_in = queueConfig.includeStatuses.join(",");
      }
      if (queueConfig?.excludeStatuses?.length) {
        extra.exclude_statuses = queueConfig.excludeStatuses.join(",");
      } else if (queueConfig?.excludeTerminalStatuses) {
        extra.exclude_statuses = "cancelled,expired";
      } else if (
        (!queueConfig?.slug || queueConfig.slug === "all") &&
        !statusParam &&
        !normalizeSalesListSearchQuery(debouncedSearch)
      ) {
        // All Orders browse: keep Cancelled/Expired off this list (and out of pager
        // totals). They live on their own queues; Status filter or search still finds them.
        // Otherwise cancelled inflated "of N" while summary cards excluded them — then
        // filtering to Paid looked like the cancel "was counting but not in the UI".
        extra.exclude_statuses = "cancelled,expired";
      }
      if (queueConfig?.requireOutstandingBalance || shopDebtorsOnly) {
        extra.outstanding_balance = 1;
      }
      if (shopDebtorsOnly) {
        extra.shop_debtors = 1;
      }
      if (routeOrdersOnly) {
        extra.route_orders = 1;
        if (!queueConfig?.lockStatusFilter) {
          extra.exclude_statuses = "cancelled,expired";
        }
      }
      if (appliedFromDate) extra.from_date = appliedFromDate;
      if (appliedToDate) extra.to_date = appliedToDate;
      // Match "Placed by" column — filter on when the order was created/booked.
      if (appliedFromDate || appliedToDate) extra.date_field = "placed";
      if (routeFilter && routeFilter !== "all") {
        extra.route_id = routeFilter;
      }
      const sourceFromColumn = String(debouncedColumnFilters.source ?? "").trim();
      const sourceParam = !routeOrdersOnly
        ? sourceFromColumn ||
          (effectiveSourceFilter && effectiveSourceFilter !== "all" ? effectiveSourceFilter : "")
        : "";
      if (sourceParam) {
        extra.order_source = sourceParam;
      }

      const orderCol = String(debouncedColumnFilters.order ?? "").trim();
      const customerCol = String(debouncedColumnFilters.customer ?? "").trim();
      const amountCol = String(debouncedColumnFilters.amount ?? "").trim();
      const methodCol = String(debouncedColumnFilters.method ?? "").trim();
      const placedByCol = String(debouncedColumnFilters.placed_by ?? "").trim();
      if (orderCol) {
        const digits = orderCol.replace(/^S/i, "").replace(/\D/g, "");
        // S… → org order_num. Bare digits → Cash Sales / pos_order_num (never treat
        // large tickets as org S# — that returned the wrong receipt after daily resets).
        if (/^S/i.test(orderCol)) {
          extra.filter_order = digits || orderCol;
        } else if (digits) {
          extra.filter_pos_order = digits;
        } else {
          extra.filter_order = orderCol;
        }
      }
      if (customerCol) extra.filter_customer = customerCol;
      if (amountCol) extra.filter_amount = amountCol;
      if (methodCol) extra.filter_method = methodCol;
      if (placedByCol) extra.filter_placed_by = placedByCol;
      if (sourceFromColumn) extra.filter_source = sourceFromColumn;

      const searchQ = normalizeSalesListSearchQuery(debouncedSearch);

      return buildPageParams({
        page: pageNum,
        perPage: perPageNum,
        q: searchQ || undefined,
        filters,
        extra,
      });
    },
    [
      debouncedSearch,
      appliedFromDate,
      appliedToDate,
      effectiveSourceFilter,
      effectiveStatusFilter,
      queueConfig,
      routeOrdersOnly,
      shopDebtorsOnly,
      routeFilter,
      cashierFilter,
      ordersListSort,
      debouncedColumnFilters,
    ],
  );

  const loadOrders = useCallback(async () => {
    if (!listFiltersInitialized) return;
    setListLoading(true);
    try {
      const searchParams = buildOrdersListSearchParams(page, pageSize);
      const res = await apiRequest("/sales", { searchParams });
      const parsed = parsePaginator(res);
      const list = sortOrdersForList(parsed.items, ordersListSort);

      setListScope(res?.list_scope ?? null);
      setOrderSummary(normalizeOrdersListSummary(res?.summary));
      setRows(list);
      setTotalOrders(parsed.total);
      setTotalPages(parsed.totalPages);
      // Items load on expand via loadOrderDetail — keep any already-fetched details.
      setDetailsById((prev) => {
        const next = { ...prev };
        for (const sale of list) {
          const key = String(sale.id);
          if (next[key]?.items === undefined && sale.items !== undefined) {
            next[key] = sale;
          }
        }
        return next;
      });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [
    listFiltersInitialized,
    page,
    pageSize,
    buildOrdersListSearchParams,
    ordersListSort,
  ]);

  /** Same filters/dates as the list — every matching order across pages. */
  const fetchAllFilteredOrders = useCallback(async () => {
    const searchParams = buildOrdersListSearchParams(1, 200);
    const { page: _page, ...rest } = searchParams;
    return fetchAllPages("/sales", rest, { perPage: 200 });
  }, [buildOrdersListSearchParams]);

  useTabAwareDataLoad(loadOrders);

  useEffect(() => {
    setPage(1);
  }, [debouncedColumnFilters]);

  async function loadOrderDetail(orderId) {
    const key = String(orderId);
    if (detailsById[key]?.items !== undefined) return detailsById[key];
    setDetailLoadingId(key);
    try {
      const sale = await apiRequest(`/sales/${orderId}`);
      setDetailsById((prev) => ({ ...prev, [key]: sale }));
      return sale;
    } catch {
      return null;
    } finally {
      setDetailLoadingId(null);
    }
  }

  const approveActionRequest = useCallback(
    async (requestId) => {
      if (!requestId) return;
      setListLoading(true);
      try {
        await apiRequest(`/action-requests/${requestId}/approve`, { method: "POST", loading: false });
        setActionMessage("Request approved.");
        void loadOrders();
      } catch (e) {
        setActionMessage(e instanceof ApiError ? e.message : "Could not approve request.");
      } finally {
        setListLoading(false);
      }
    },
    [loadOrders],
  );

  const rejectActionRequest = useCallback((requestId, approvalLines = []) => {
    if (!requestId) return;
    setRejectContext({ requestId, approvalLines });
  }, []);

  const submitRejectActionRequest = useCallback(
    async (payload) => {
      if (!rejectContext?.requestId) return;
      setListLoading(true);
      try {
        const body =
          typeof payload === "string"
            ? { reason: payload.trim() }
            : {
                reason: payload.reason.trim(),
                discount_guidance: payload.discount_guidance,
                advised_discount_lines: payload.advised_discount_lines,
                advised_discount_amount: payload.advised_discount_amount,
              };
        await apiRequest(`/action-requests/${rejectContext.requestId}/reject`, {
          method: "POST",
          body,
          loading: false,
        });
        setRejectContext(null);
        setActionMessage("Request rejected.");
        void loadOrders();
      } catch (e) {
        setActionMessage(e instanceof ApiError ? e.message : "Could not reject request.");
      } finally {
        setListLoading(false);
      }
    },
    [rejectContext, loadOrders],
  );

  function toggleExpand(saleId) {
    const key = String(saleId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        void loadOrderDetail(saleId);
      }
      return next;
    });
  }

  async function expandAllOnPage(slice) {
    const ids = slice.map((sale) => String(sale.id));
    setExpandedIds(new Set(ids));
    await mapWithConcurrency(slice, (sale) => loadOrderDetail(sale.id), 3);
  }

  function collapseAll() {
    setExpandedIds(new Set());
  }

  function openOrderContextMenu(event, sale) {
    event.preventDefault();
    setContextMenu({
      sale,
      x: event.clientX,
      y: event.clientY,
      includePrint: true,
    });
  }

  function openActionsMenuFromButton(event, sale) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      sale,
      x: Math.max(8, rect.right - 220),
      y: rect.bottom + 4,
      includePrint: true,
    });
  }

  function viewOrder(sale) {
    if (!sale?.id) return;
    const from = routeOrdersOnly
      ? queueSlug
        ? `/fulfillment/orders/${queueSlug}`
        : "/fulfillment/orders"
      : queueSlug
        ? `/sales/orders/queues/${queueSlug}`
        : "/sales/orders";
    router.push(`/sales/orders/${sale.id}?from=${encodeURIComponent(from)}`);
  }

  async function openEditOrder(sale, { replace = false } = {}) {
    if (!sale?.id) return;
    const workflow = getOrderWorkflow(capabilities, sale);
    if (!isOrderEditActionVisible(sale, workflow, capabilities)) return;

    if (shouldOpenBackofficeOrderEdit(sale, workflow, capabilities)) {
      setEditSale(sale);
      return;
    }

    if (!shouldRestoreOrderToCart(sale, workflow, capabilities)) return;

    setTransitionBusyId(sale.id);
    setActionMessage(null);
    try {
      await apiRequest(`/sales/orders/${sale.id}/restore-to-cart`, {
        method: "POST",
        body: { replace },
      });
      router.push("/sales/pos");
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load order for editing.";
      if (!replace && message.toLowerCase().includes("already has items")) {
        const ok = await confirm({
          title: "Replace cart",
          message: "Your cart already has items. Replace them with this order?",
          confirmLabel: "Replace",
          destructive: true,
        });
        if (ok) {
          setTransitionBusyId(null);
          await openEditOrder(sale, { replace: true });
          return;
        }
      }
      setActionMessage(message);
    } finally {
      setTransitionBusyId(null);
    }
  }

  function handleEditSaved(updated) {
    if (updated?.id) {
      patchSaleInState(updated);
    }
    const orderLabel =
      updated?.order_num != null ? formatOrderNumber(updated) : "Order";
    const message =
      updated?.status === "pending_approval"
        ? `${orderLabel} resubmitted for manager approval.`
        : updated?.status === "booked"
          ? `${orderLabel} saved and booked.`
          : `${orderLabel} updated.`;
    setActionMessage(message);
    setEditSale(null);
    void loadOrders();
  }

  async function printOrder(sale, documentType = null, { batch = false, printCache = null } = {}) {
    if (!sale?.id) return false;

    const cachedType =
      documentType ?? defaultOrderListPrintDocumentType(capabilities?.module_settings, capabilities);
    // When Centrix Print Agent is configured, do not pre-open a browser window for
    // thermal receipts — that forces browser printing and skips the agent.
    const printWindow = openSaleOrderPrintWindow(cachedType);
    if (isSaleOrderBrowserPrintWindowRequired(cachedType) && !printWindow) {
      setActionMessage(PRINT_BLOCKED_MESSAGE);
      return false;
    }

    try {
      const key = String(sale.id);
      let detail = saleHasPrintableItems(sale) ? sale : (detailsById[key] ?? sale);
      if (!saleHasPrintableItems(detail)) {
        const loaded = await loadOrderDetail(sale.id);
        if (loaded) detail = loaded;
      }
      if (!detail) {
        disposePrintWindow(printWindow);
        setActionMessage("Could not load order details for print.");
        return false;
      }
      const printed = await printSaleOrder(detail, {
        organization,
        organizationName: capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME,
        moduleSettings: capabilities?.module_settings,
        capabilities,
        uomById,
        user,
        printWindow,
        printCache,
        skipSaleRefresh: saleHasPrintableItems(detail),
        skipSettingsRefresh: batch,
        skipOrganizationRefresh: batch,
        skipStockPrintGate: true,
        ...(documentType ? { documentType } : {}),
      });
      if (!printed) {
        disposePrintWindow(printWindow);
        return false;
      }
      return true;
    } catch (e) {
      disposePrintWindow(printWindow);
      setActionMessage(e instanceof Error ? e.message : "Print failed");
      return false;
    }
  }

  /**
   * Pipeline: prepare chunk N fully (details + HTML) in parallel (5 at a time),
   * then queue that chunk to the printer one job at a time (agent cannot take a
   * parallel burst). While chunk N is queueing, prepare chunk N+1.
   */
  async function printOrdersInChunks(printable, documentType, { loadingBusy, printingBusy } = {}) {
    if (!printable.length) return { printed: 0, failed: 0, failureReasons: [] };

    const useAgentQueue = shouldUsePrintAgentForDocument(documentType);
    if (useAgentQueue) {
      void warmPrintAgentHealth();
    }

    const detailCache = new Map(
      Object.entries(detailsById).filter(([, sale]) => saleHasPrintableItems(sale)),
    );

    const printOptsBase = {
      organization,
      organizationName: capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME,
      moduleSettings: capabilities?.module_settings,
      capabilities,
      uomById,
      user,
      skipSettingsRefresh: true,
      skipOrganizationRefresh: true,
      skipStockPrintGate: true,
      ...(documentType ? { documentType } : {}),
    };

    async function fetchChunkDetails(chunk) {
      return mapWithConcurrency(
        chunk,
        async (sale) => {
          const key = String(sale.id);
          if (detailCache.has(key)) return detailCache.get(key);
          if (saleHasPrintableItems(sale)) {
            detailCache.set(key, sale);
            return sale;
          }
          try {
            const loaded = await apiRequest(`/sales/${sale.id}`, { loading: false });
            if (loaded) {
              detailCache.set(key, loaded);
              setDetailsById((prev) => ({ ...prev, [key]: loaded }));
            }
            return loaded;
          } catch (error) {
            return {
              __printError:
                error instanceof Error ? error.message : "Could not load order for print.",
            };
          }
        },
        BATCH_PRINT_CHUNK_SIZE,
      );
    }

    async function prepareChunkForPrint(chunk) {
      const details = await fetchChunkDetails(chunk);
      const loadErrors = [];
      const usable = [];
      for (let i = 0; i < details.length; i += 1) {
        const detail = details[i];
        if (detail?.__printError) {
          loadErrors.push(detail.__printError);
          continue;
        }
        if (detail?.id && saleHasPrintableItems(detail)) {
          usable.push(detail);
          continue;
        }
        // Detail loaded without line items — try one forced refresh.
        if (detail?.id) {
          try {
            const loaded = await apiRequest(`/sales/${detail.id}`, { loading: false });
            if (loaded && saleHasPrintableItems(loaded)) {
              detailCache.set(String(detail.id), loaded);
              usable.push(loaded);
              continue;
            }
          } catch {
            /* counted below */
          }
        }
        loadErrors.push(
          detail?.id
            ? `Order #${detail.order_num ?? detail.id} has no printable line items.`
            : "Order detail missing for print.",
        );
      }

      const printCache = await warmSalePrintBatch(usable, printOptsBase);

      // Build every receipt HTML for this chunk up front so queueing is sequential only.
      const jobs = await mapWithConcurrency(
        usable,
        async (detail) => {
          const job = await prepareSaleOrderPrintJob(detail, {
            ...printOptsBase,
            printCache,
            skipSaleRefresh: true,
            // Agent path: never open browser windows while preparing the batch.
            deferBrowserWindow: useAgentQueue,
          });
          return { detail, job };
        },
        BATCH_PRINT_CHUNK_SIZE,
      );

      return { details, jobs, printCache, loadErrors };
    }

    const chunks = chunkItems(printable, BATCH_PRINT_CHUNK_SIZE);
    let printed = 0;
    let failed = 0;
    let queued = 0;
    const failureReasons = [];

    let nextChunkPromise = chunks.length > 0 ? prepareChunkForPrint(chunks[0]) : null;

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      const from = chunkIndex * BATCH_PRINT_CHUNK_SIZE + 1;
      const to = from + chunk.length - 1;
      const hasNext = chunkIndex + 1 < chunks.length;

      if (loadingBusy) setBatchBusy(loadingBusy);
      setActionMessage(
        printable.length === 1
          ? "Preparing receipt…"
          : hasNext
            ? `Preparing receipts ${from}–${to} of ${printable.length} (next batch of ${BATCH_PRINT_CHUNK_SIZE} loads while these queue)…`
            : `Preparing receipts ${from}–${to} of ${printable.length}…`,
      );

      const prepared = await nextChunkPromise;
      const jobs = prepared?.jobs ?? [];
      for (const reason of prepared?.loadErrors ?? []) {
        failed += 1;
        failureReasons.push(reason);
      }

      // Start preparing the next chunk immediately — overlaps with queueing this batch.
      nextChunkPromise = hasNext ? prepareChunkForPrint(chunks[chunkIndex + 1]) : null;

      if (printingBusy) setBatchBusy(printingBusy);

      const readyJobs = [];
      for (const row of jobs) {
        if (!row?.job?.ok) {
          failed += 1;
          failureReasons.push(
            row?.job?.error ||
              `Could not prepare receipt for order #${row?.detail?.order_num ?? row?.detail?.id ?? "?"}.`,
          );
          continue;
        }
        readyJobs.push(row);
      }

      if (!readyJobs.length) {
        setActionMessage(
          `Skipped receipts ${from}–${to} of ${printable.length} (nothing printable).`,
        );
        continue;
      }

      setActionMessage(
        printable.length === 1
          ? "Sending receipt to printer…"
          : `Queueing receipts ${from}–${to} of ${printable.length} one at a time${
              hasNext
                ? ` (preparing ${to + 1}–${Math.min(to + BATCH_PRINT_CHUNK_SIZE, printable.length)} next)…`
                : "…"
            }`,
      );

      // Always one-at-a-time to the printer. Parallel agent POSTs overload the
      // local queue and then fall back to blocked browser popups → mass failures.
      for (let jobIndex = 0; jobIndex < readyJobs.length; jobIndex += 1) {
        const { job, detail } = readyJobs[jobIndex];
        const receiptNo = from + jobIndex;
        try {
          const result = await dispatchPreparedSalePrintJob(job, {
            // Agent preferred; if offline/unreachable, open the browser dialog instead of failing.
            allowBrowserFallback: true,
          });
          if (result?.ok !== false) {
            printed += 1;
            queued += 1;
          } else {
            failed += 1;
            failureReasons.push(
              result?.error ||
                `Print failed for order #${detail?.order_num ?? detail?.id ?? receiptNo}.`,
            );
          }
        } catch (error) {
          failed += 1;
          failureReasons.push(
            error instanceof Error
              ? error.message
              : `Print failed for order #${detail?.order_num ?? detail?.id ?? receiptNo}.`,
          );
        }

        setActionMessage(
          printable.length === 1
            ? "Sending receipt to printer…"
            : `Queued ${queued} of ${printable.length} · printing receipt ${receiptNo}/${printable.length}${
                hasNext || jobIndex + 1 < readyJobs.length ? "…" : "."
              }`,
        );
      }
    }

    return { printed, failed, failureReasons };
  }

  function patchSaleInState(updated) {
    if (!updated?.id) return;
    const key = String(updated.id);
    setRows((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    setDetailsById((prev) => ({
      ...prev,
      [key]: prev[key] ? { ...prev[key], ...updated } : updated,
    }));
  }

  async function transitionOrder(sale, targetStatus, fulfillmentMeta, { skipConfirm = false, quiet = false } = {}) {
    if (!sale?.id) return null;
    if (transitionBusyId === sale.id) return null;
    if (targetStatus === "cancelled" && !skipConfirm) {
      const ok = await confirm({
        title: "Cancel order",
        message: "Cancel this order?",
        confirmLabel: "Cancel order",
        destructive: true,
      });
      if (!ok) return null;
    }
    setTransitionBusyId(sale.id);
    if (!quiet) setActionMessage(null);
    try {
      const body = { status: targetStatus };
      if (fulfillmentMeta) body.fulfillment_meta = fulfillmentMeta;
      const updated = await apiRequest(`/sales/orders/${sale.id}/transition`, {
        method: "POST",
        body,
      });
      patchSaleInState(updated);
      if (!quiet) setActionMessage(`Order ${formatOrderNumber(sale)} updated.`);
      if (queueConfig?.lockStatusFilter && updated.status !== queueConfig.fixedStatusFilter) {
        setRows((prev) => prev.filter((s) => s.id !== updated.id));
      }
      if (
        queueConfig?.fixedPaymentStatusFilter &&
        String(updated.payment_status ?? "").toLowerCase() !== queueConfig.fixedPaymentStatusFilter
      ) {
        setRows((prev) => prev.filter((s) => s.id !== updated.id));
      }
      return updated;
    } catch (e) {
      if (!quiet) {
        setActionMessage(e instanceof ApiError ? e.message : "Could not update order.");
        return null;
      }
      throw e;
    } finally {
      setTransitionBusyId(null);
    }
  }

  const fulfillment = useFulfillmentTransition({
    capabilities,
    onSuccess: (updated) => {
      patchSaleInState(updated);
      setActionMessage(`Order ${formatOrderNumber(updated)} updated.`);
      if (queueConfig?.lockStatusFilter && updated.status !== queueConfig.fixedStatusFilter) {
        setRows((prev) => prev.filter((s) => s.id !== updated.id));
      }
      if (
        queueConfig?.fixedPaymentStatusFilter &&
        String(updated.payment_status ?? "").toLowerCase() !== queueConfig.fixedPaymentStatusFilter
      ) {
        setRows((prev) => prev.filter((s) => s.id !== updated.id));
      }
    },
    onError: (message) => setActionMessage(message),
  });

  async function handleAdvance(sale, targetStatus) {
    if (transitionBusyId === sale.id || fulfillment.busy) return;
    if (targetStatus === "cancelled") {
      return transitionOrder(sale, targetStatus);
    }
    const fromStatus = String(sale?.status ?? "").toLowerCase();
    if (fromStatus === "expired" || fromStatus === "cancelled") {
      return transitionOrder(sale, targetStatus);
    }
    if (isPaymentGatedWorkflowTransition(sale, targetStatus)) {
      setPaySale(sale);
      return;
    }
    return fulfillment.requestTransition(sale, targetStatus);
  }

  function openCollectPayment(sale) {
    if (!sale?.id || !canCollectPaymentOnQueue(sale, paymentQueueSlug, null, capabilities)) return;
    setPaySale(sale);
  }

  async function convertPaymentStatus(sale, direction) {
    if (!sale?.id) return;
    const allowed = canConvertPaymentStatusOnQueue(sale, paymentQueueSlug, capabilities, direction);
    if (!allowed) return;
    const path =
      direction === "unpaid"
        ? `/sales/${sale.id}/convert-to-unpaid`
        : `/sales/${sale.id}/convert-to-paid`;
    setTransitionBusyId(sale.id);
    try {
      await apiRequest(path, { method: "POST" });
      notifySuccess(direction === "unpaid" ? "Order converted to unpaid." : "Order converted to paid.");
      await loadOrders();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setTransitionBusyId(null);
    }
  }

  function applyDateFilter() {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    setPage(1);
  }

  function handleRouteFilterChange(value) {
    setRouteFilter(value || "all");
    setPage(1);
  }

  const summary = orderSummary ?? summarizeOrders(rows);
  const pageSlice = rows;
  const pageRowIds = useMemo(() => pageSlice.map((sale) => sale.id), [pageSlice]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

  const workflowBySaleId = useMemo(() => {
    const map = new Map();
    for (const sale of pageSlice) {
      map.set(sale.id, getOrderWorkflow(capabilities, sale));
    }
    return map;
  }, [pageSlice, capabilities]);

  const selectedSales = useMemo(
    () => pageSlice.filter((sale) => selectedIds.has(String(sale.id))),
    [pageSlice, selectedIds],
  );

  async function printSelectedOrders() {
    if (batchBusy || selectedSales.length === 0) return;
    const printable = selectedSales.filter((sale) => isPrintInvoiceVisible(sale, capabilities));
    const skipped = selectedSales.length - printable.length;
    if (printable.length === 0) {
      setActionMessage("None of the selected orders can be printed.");
      return;
    }

    setBatchBusy("print-load");
    setActionMessage(null);
    try {
      let documentType = defaultOrderListPrintDocumentType(
        capabilities?.module_settings,
        capabilities,
      );
      if (!documentType || documentType === "both") {
        documentType = await resolveOrderPrintType(capabilities?.module_settings, null);
        if (!documentType) return;
      }

      const { printed, failed, failureReasons } = await printOrdersInChunks(printable, documentType, {
        loadingBusy: "print-load",
        printingBusy: "print",
      });

      const parts = [`Printed ${printed} of ${printable.length}`];
      if (skipped > 0) parts.push(`${skipped} skipped`);
      const failPart = summarizePrintFailures(failureReasons, failed);
      if (failPart) parts.push(failPart);
      setActionMessage(`${parts.join(" · ")}.`);
      if (printed > 0) clearSelection();
    } finally {
      setBatchBusy(null);
    }
  }

  /** Mobile orders: print every receipt matching the current date range + filters. */
  async function printAllFilteredOrders() {
    if (batchBusy || !listFiltersInitialized) return;

    setBatchBusy("print-all-load");
    setActionMessage("Loading orders to print…");
    try {
      const allRows = await fetchAllFilteredOrders();
      const printable = allRows.filter((sale) => isPrintInvoiceVisible(sale, capabilities));
      const skipped = allRows.length - printable.length;

      if (printable.length === 0) {
        setActionMessage(
          allRows.length === 0
            ? "No orders match the current date and filters."
            : "None of the matching orders can be printed.",
        );
        return;
      }

      const dateLabel =
        appliedFromDate && appliedToDate
          ? appliedFromDate === appliedToDate
            ? appliedFromDate
            : `${appliedFromDate} → ${appliedToDate}`
          : "the selected dates";

      setBatchBusy(null);
      const ok = await confirm({
        title: "Print all orders",
        message:
          printable.length === 1
            ? `Print 1 order for ${dateLabel} with the current filters? You will choose thermal or A4 next.`
            : `Print ${printable.length} orders for ${dateLabel} with the current filters? You will choose thermal or A4 next.`,
        confirmLabel: printable.length === 1 ? "Continue" : `Continue (${printable.length})`,
      });
      if (!ok) {
        setActionMessage(null);
        return;
      }

      const documentType = await requestOrderPrintType();
      if (!documentType) {
        setActionMessage(null);
        return;
      }

      const formatLabel = documentType === "invoice" ? "A4 invoice" : "thermal receipt";
      setBatchBusy("print-all-load");
      setActionMessage(
        `Loading ${printable.length} ${formatLabel}${printable.length === 1 ? "" : "s"}…`,
      );

      const { printed, failed, failureReasons } = await printOrdersInChunks(printable, documentType, {
        loadingBusy: "print-all-load",
        printingBusy: "print-all",
      });

      const parts = [
        `Printed ${printed} of ${printable.length} (${formatLabel}${printable.length === 1 ? "" : "s"})`,
      ];
      if (skipped > 0) parts.push(`${skipped} skipped`);
      const failPart = summarizePrintFailures(failureReasons, failed);
      if (failPart) parts.push(failPart);
      setActionMessage(`${parts.join(" · ")}.`);
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Could not print all orders.");
    } finally {
      setBatchBusy(null);
    }
  }

  async function cancelSelectedOrders() {
    if (routeOrdersOnly || batchBusy || selectedSales.length === 0) return;
    const cancellable = selectedSales.filter((sale) =>
      canCancelOrder(sale, workflowBySaleId.get(sale.id), capabilities),
    );
    const skipped = selectedSales.length - cancellable.length;
    if (cancellable.length === 0) {
      setActionMessage("None of the selected orders can be cancelled.");
      return;
    }

    const ok = await confirm({
      title: "Cancel orders",
      message:
        cancellable.length === 1
          ? `Cancel order ${formatOrderNumber(cancellable[0])}?`
          : `Cancel ${cancellable.length} selected orders?`,
      confirmLabel: cancellable.length === 1 ? "Cancel order" : "Cancel orders",
      destructive: true,
    });
    if (!ok) return;

    setBatchBusy("cancel");
    setActionMessage(null);
    let succeeded = 0;
    let failed = 0;
    try {
      for (const sale of cancellable) {
        try {
          const updated = await transitionOrder(sale, "cancelled", undefined, {
            skipConfirm: true,
            quiet: true,
          });
          if (updated) succeeded += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      const parts = [`Cancelled ${succeeded} of ${cancellable.length}`];
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (failed > 0) parts.push(`${failed} failed`);
      setActionMessage(`${parts.join(" · ")}.`);
      if (succeeded > 0) clearSelection();
    } finally {
      setBatchBusy(null);
    }
  }

  async function mergeSelectedOrders() {
    if (routeOrdersOnly || batchBusy || selectedSales.length < 2) return;
    if (!hasPermission(P.sales.orders.edit)) {
      setActionMessage("You do not have permission to merge orders.");
      return;
    }

    const plan = describeMobileOrderMergeSelection(selectedSales);
    if (!plan.ok) {
      setActionMessage(plan.message);
      return;
    }

    const sourceLabels = plan.sources.map((sale) => formatOrderNumber(sale)).join(", ");
    const ok = await confirm({
      title: "Merge mobile orders",
      message: `Merge ${plan.sources.length + 1} orders for the same customer into ${formatOrderNumber(plan.target)}? Line items and payments move into ${formatOrderNumber(plan.target)}; ${sourceLabels} will be cancelled as merged.`,
      confirmLabel: "Merge orders",
    });
    if (!ok) return;

    setBatchBusy("merge");
    setActionMessage(null);
    try {
      const merged = await apiRequest("/sales/orders/merge", {
        method: "POST",
        body: {
          sale_ids: selectedSales.map((sale) => Number(sale.id)),
          target_sale_id: Number(plan.target.id),
        },
      });
      setActionMessage(
        `Merged into ${formatOrderNumber(merged)}. ${plan.sources.length} order${plan.sources.length === 1 ? "" : "s"} cancelled.`,
      );
      clearSelection();
      void loadOrders();
    } catch (e) {
      setActionMessage(e instanceof ApiError ? e.message : "Could not merge orders.");
    } finally {
      setBatchBusy(null);
    }
  }

  const canMergeSelected =
    !routeOrdersOnly &&
    hasPermission(P.sales.orders.edit) &&
    selectedSales.length >= 2 &&
    describeMobileOrderMergeSelection(selectedSales).ok;

  const allPageExpanded = useMemo(() => {
    const pageIds = pageSlice.map((sale) => String(sale.id));
    return pageIds.length > 0 && pageIds.every((id) => expandedIds.has(id));
  }, [pageSlice, expandedIds]);

  function toggleExpandAllOnPage() {
    if (allPageExpanded) {
      collapseAll();
      return;
    }
    void expandAllOnPage(pageSlice);
  }

  const hasExternalPos = useMemo(() => isExternalPosEnabled(capabilities), [capabilities]);
  const orderPrintAriaLabel = useMemo(() => orderListPrintAriaLabel(capabilities), [capabilities]);

  const printJobBusy = isPrintBatchBusy(batchBusy);
  const blockingBatchBusy = Boolean(batchBusy) && !printJobBusy;
  // Print jobs are background — keep the table usable. Cancel/merge still block briefly.
  const showTransitionOverlay =
    Boolean(transitionBusyId) || fulfillment.busy || blockingBatchBusy;

  const contextMenuItems = useMemo(() => {
    if (!contextMenu?.sale) return [];
    const sale = contextMenu.sale;
    const workflow = getOrderWorkflow(capabilities, sale);
    return buildOrderContextMenuItems({
      sale,
      workflow,
      capabilities,
      busy: transitionBusyId === sale.id || fulfillment.busy,
      includePrint: contextMenu.includePrint !== false,
      hasExternalPos,
      canEdit: isOrderEditActionVisible(sale, workflow, capabilities),
      canReturn: isCustomerReturnAllowedForOrder(sale, capabilities),
      balanceDue: saleBalanceDue(sale),
      disableWorkflowActions: routeOrdersOnly,
      onView: () => viewOrder(sale),
      onEdit: () => openEditOrder(sale),
      onReturn: () => router.push(`/sales/returns/new?sale_id=${sale.id}`),
      onCollectPayment: canCollectPaymentOnQueue(
        sale,
        paymentQueueSlug,
        null,
        capabilities,
      )
        ? () => openCollectPayment(sale)
        : null,
      onConvertToPaid: canConvertPaymentStatusOnQueue(
        sale,
        paymentQueueSlug,
        capabilities,
        "paid",
      )
        ? () => void convertPaymentStatus(sale, "paid")
        : null,
      onConvertToUnpaid: canConvertPaymentStatusOnQueue(sale, paymentQueueSlug, capabilities, "unpaid")
        ? () => void convertPaymentStatus(sale, "unpaid")
        : null,
      onPrintThermal: () => printOrder(sale, "receipt"),
      onPrintA4: () => printOrder(sale, "invoice"),
      onPrintProforma: () => printOrder(sale, "proforma"),
      onAdvance: routeOrdersOnly ? null : (status) => handleAdvance(sale, status),
      onCancel: routeOrdersOnly ? null : () => handleAdvance(sale, "cancelled"),
    });
  }, [contextMenu, capabilities, transitionBusyId, fulfillment.busy, hasExternalPos, routeOrdersOnly, paymentQueueSlug, router]);

  useEffect(() => {
    setPage(1);
    clearSelection();
  }, [debouncedSearch, statusFilter, sourceFilter, cashierFilter, appliedFromDate, appliedToDate, queueSlug, clearSelection]);

  useEffect(() => {
    clearSelection();
  }, [page, pageSize, clearSelection]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  useEffect(() => {
    if (queueConfig?.lockSourceFilter && queueConfig.fixedSourceFilter) {
      setSourceFilter(queueConfig.fixedSourceFilter);
    }
    if (queueConfig?.lockStatusFilter && queueConfig.fixedStatusFilter) {
      setStatusFilter(queueConfig.fixedStatusFilter);
    }
  }, [queueConfig]);

  if (!queueConfig && queueSlug) {
    return (
      <CatalogPageShell title="Orders" subtitle="Queue not found">
        <p className="text-sm text-slate-500">This order queue is not part of your workflow.</p>
        <Link href="/sales/orders" className="mt-3 inline-block text-sm text-[var(--theme-primary)] hover:underline">
          View all sales orders
        </Link>
      </CatalogPageShell>
    );
  }

  const summaryHint =
    appliedFromDate === appliedToDate
      ? `Filtered · ${appliedFromDate}`
      : `${appliedFromDate} – ${appliedToDate}`;

  return (
    <CatalogPageShell
      navigationReady={!loading}
      title={
        shopDebtorsOnly
          ? "Shop debtors"
          : routeOrdersOnly
            ? (queueConfig?.title ?? "Route orders")
            : queueConfig?.title ?? "All Orders"
      }
        subtitle={
          shopDebtorsOnly
            ? "Unpaid and partially paid orders for debtor customers — route and mobile orders are excluded"
            : routeOrdersOnly
            ? (queueConfig?.subtitle
              ?? `Route orders from ${routeOrderSourcesText(capabilities).toLowerCase()}. View only — change status in Sales → Orders.`)
            : queueConfig?.subtitle ?? "Browse and manage every sales order in your workflow"
        }
      action={
        routeOrdersOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadOrders()}
              disabled={loading || listLoading}
              className={SECONDARY_BTN_CLASS}
            >
              {loading || listLoading ? "Refreshing…" : "Refresh"}
            </button>
            <Link
              href="/fulfillment/dispatch"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Dispatch board
            </Link>
            <Link
              href="/fulfillment/routes"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Routes
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadOrders()}
              disabled={loading || listLoading}
              className={SECONDARY_BTN_CLASS}
            >
              {loading || listLoading ? "Refreshing…" : "Refresh"}
            </button>
            <AiAnalyzeButton
              label="Analyze this page with AI"
              disabled={loading || listLoading || !(rows?.length)}
              onClick={() => setExplainOpen(true)}
            />
            {queueConfig?.slug === "mobile" ? (
              <button
                type="button"
                onClick={() => void printAllFilteredOrders()}
                disabled={loading || listLoading || Boolean(batchBusy) || !listFiltersInitialized}
                title="Print all matching orders — choose thermal or A4"
                className={SECONDARY_BTN_CLASS}
              >
                {batchBusy === "print-all" || batchBusy === "print-all-load"
                  ? "Printing all…"
                  : "Print all"}
              </button>
            ) : null}
            {queueConfig?.activityHref ? (
              <Link
                href={queueConfig.activityHref}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Conversations & help
              </Link>
            ) : null}
            <Link
              href="/sales/pos"
              className="inline-flex items-center rounded-lg bg-[var(--theme-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--theme-primary-hover)]"
            >
              + New sale
            </Link>
          </div>
        )
      }
      toolbar={
        <div className="mb-4">
          <FilterToolbar className="mb-0">
            <Field label="From">
              <input
                type="date"
                className={FILTER_CONTROL_CLASS}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value || isoDate())}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className={FILTER_CONTROL_CLASS}
                value={toDate}
                onChange={(e) => setToDate(e.target.value || isoDate())}
              />
            </Field>
            <button
              type="button"
              onClick={applyDateFilter}
              className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-[var(--theme-primary)]/30 bg-[var(--theme-primary-muted)] px-3 text-sm font-medium text-[var(--theme-primary)] hover:bg-[#d4e8f9]"
            >
              Filter
            </button>
            {showRouteFilter ? (
              <Field label="Route">
                <FilterSelect
                  value={routeFilter}
                  onChange={(e) => handleRouteFilterChange(e.target.value)}
                  options={routeFilterOptions}
                />
              </Field>
            ) : null}
            <Field label="Status">
              <FilterSelect
                value={effectiveStatusFilter ?? "all"}
                disabled={queueConfig?.lockStatusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={statusOptions}
              />
            </Field>
            {showSourceFilter ? (
              <Field label="Source">
                <FilterSelect
                  value={effectiveSourceFilter ?? "all"}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  options={sourceOptions}
                />
              </Field>
            ) : null}
            <Field label="User">
              <FilterSelect
                value={cashierFilter}
                onChange={(e) => setCashierFilter(e.target.value)}
                options={sellerFilterOptions}
              />
            </Field>
          </FilterToolbar>
        </div>
      }
      banner={
        actionMessage || printJobBusy ? (
          <div
            className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            role="status"
            aria-live="polite"
          >
            {printJobBusy ? (
              <span
                className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--theme-primary)] border-t-transparent"
                aria-hidden
              />
            ) : null}
            <ActionFeedbackBanner
              message={actionMessage ?? "Printing in background — you can keep working…"}
              className="mb-0 border-0 bg-transparent p-0"
            />
          </div>
        ) : null
      }
    >
      <div className="mt-8 space-y-6">
        {showArchiveLoading ? (
          <div
            className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-700 border-t-transparent"
              aria-hidden
            />
            <span>
              <strong className="font-semibold">Loading from archives — please wait.</strong>
              <span className="mt-0.5 block text-xs text-amber-900/80 sm:mt-0 sm:ml-1 sm:inline">
                Your date range includes orders older than{" "}
                {listScope?.hot_window_days ||
                  queueConfig?.dateRangeDays ||
                  ORDERS_HOT_WINDOW_DAYS}{" "}
                days.
              </span>
            </span>
          </div>
        ) : null}
        {!loading ? (
          <OrderSummaryStats summary={summary} hint={summaryHint} />
        ) : null}

        <div className="grid grid-cols-12 items-start gap-3">
          <div className="col-span-12 lg:col-span-6">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, customer, amount, S0034, POS #…"
              className="w-full min-w-0"
            />
          </div>
          {showMobileReturnsCard || showMobilePaymentsCard ? (
            <div className="col-span-12 flex justify-end lg:col-span-6">
              <MobileOrdersQuickActions
                enabledReturns={showMobileReturnsCard}
                enabledPayments={showMobilePaymentsCard}
                unpaidHintCount={(summary?.unpaid ?? 0) + (summary?.partial ?? 0)}
                loadUnpaidOrders={async () => {
                  const allRows = await fetchAllFilteredOrders();
                  return (allRows ?? []).filter((sale) => {
                    if (!sale?.id) return false;
                    if (String(sale.status ?? "").toLowerCase() === "cancelled") return false;
                    return saleBalanceDue(sale) > 0.009;
                  });
                }}
                fromDate={appliedFromDate}
                toDate={appliedToDate}
                onDone={() => void loadOrders()}
              />
            </div>
          ) : null}
        </div>

        <div className="theme-panel theme-table-shell relative overflow-hidden rounded-xl shadow-sm">
          {showTransitionOverlay ? (
            <div
              className="absolute inset-0 z-20 flex min-h-[120px] items-center justify-center bg-white/60 backdrop-blur-[1px]"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--theme-primary)] border-t-transparent"
                  aria-hidden
                />
                {blockingBatchBusy
                  ? batchBusy === "cancel"
                    ? "Cancelling selected orders…"
                    : batchBusy === "merge"
                      ? "Merging orders…"
                      : "Updating order…"
                  : "Updating order…"}
              </div>
            </div>
          ) : null}
          {showArchiveLoading ? (
            <div className="absolute inset-0 z-10 flex min-h-[280px] items-center justify-center bg-white/70 backdrop-blur-[1px]">
              <div className="flex flex-col items-center gap-3 px-6 text-center">
                <span
                  className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--theme-primary)] border-t-transparent"
                  aria-hidden
                />
                <p className="text-sm font-medium text-slate-800">Loading from archives, please wait…</p>
              </div>
            </div>
          ) : null}
          {showRefreshOverlay ? (
            <div
              className="absolute inset-0 z-10 flex min-h-[120px] items-start justify-center bg-white/50 pt-16 backdrop-blur-[0.5px]"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--theme-primary)] border-t-transparent"
                  aria-hidden
                />
                Loading orders…
              </div>
            </div>
          ) : null}
          {showTableLoading ? (
            <div
              className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center"
              role="status"
              aria-live="polite"
            >
              <span
                className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--theme-primary)] border-t-transparent"
                aria-hidden
              />
              <p className="text-sm font-medium text-slate-800">Loading orders…</p>
              <p className="text-xs text-slate-500">Fetching the latest sales and orders for this view.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 theme-table-head-row border-b px-4 py-2">
                <button
                  type="button"
                  disabled={!pageSlice.length}
                  onClick={toggleExpandAllOnPage}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    allPageExpanded
                      ? "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "border-[var(--theme-primary)]/30 bg-[var(--theme-primary-muted)] text-[var(--theme-primary)] hover:bg-[#d4e8f9]"
                  }`}
                >
                  {allPageExpanded ? "Collapse all" : "Expand all"}
                </button>
                <p className="text-xs text-slate-500">
                  {pageSlice.length === 0
                    ? "No orders on this page"
                    : `${pageSlice.length} order${pageSlice.length === 1 ? "" : "s"} on this page`}
                </p>
                <div className="ml-auto">
                  <OrdersColumnsMenu
                    open={columnsMenuOpen}
                    onOpen={() => setColumnsMenuOpen(true)}
                    onClose={() => setColumnsMenuOpen(false)}
                    visibleColumnIds={visibleColumnIds}
                    availableColumns={availableOrderColumns}
                    onToggleColumn={(columnId) => {
                      setVisibleColumnIds((prev) => {
                        const has = prev.includes(columnId);
                        const next = has ? prev.filter((id) => id !== columnId) : [...prev, columnId];
                        if (next.length === 0) return prev;
                        return normalizeOrdersListVisibleColumns(next);
                      });
                    }}
                    onReset={() => setVisibleColumnIds(defaultVisibleColumnIds)}
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                {tableSortActive ? (
                  <div className="px-4 pt-3">
                    <ActiveSortChip
                      label={activeSortLabel}
                      onClear={() => {
                        clearTableSort();
                        setPage(1);
                      }}
                    />
                  </div>
                ) : null}
                <table
                  className={`w-full border-collapse text-sm ${
                    showPaymentBreakdownColumns ? "min-w-[1240px]" : "min-w-[1040px]"
                  }`}
                >
                  <thead>
                    <OrderListTableHead
                      showOrderColumn={visibleColumnSet.has("order")}
                      showCustomerColumn={visibleColumnSet.has("customer")}
                      showBranchColumn={showBranchColumn}
                      showRouteColumn={showRouteColumn}
                      showDeliveryDateColumn={showDeliveryDateColumn}
                      showConnectivityColumn={showConnectivityColumn}
                      showAmountColumn={visibleColumnSet.has("amount")}
                      showAmountPaidColumn={showAmountPaidColumn}
                      showBalanceColumn={showBalanceColumn}
                      showVatColumn={visibleColumnSet.has("vat")}
                      showStatusColumn={visibleColumnSet.has("status")}
                      showMethodColumn={visibleColumnSet.has("method")}
                      showSourceColumn={showSourceColumn}
                      showPlacedByColumn={visibleColumnSet.has("placed_by")}
                      showDiscountColumn={showDiscountColumn}
                      sort={tableSort}
                      sortDir={tableSortDir}
                      onSort={(columnId) => {
                        toggleTableSort(columnId);
                        setPage(1);
                      }}
                      columnFilters={columnFilters}
                      onColumnFilterChange={(key, value) => {
                        setColumnFilters((prev) => ({ ...prev, [key]: value }));
                      }}
                      statusOptions={
                        queueConfig?.lockStatusFilter
                          ? []
                          : statusOptions
                      }
                      sourceOptions={showSourceColumn ? sourceOptions : []}
                      selection={{
                        checked: allOnPageSelected,
                        indeterminate: someOnPageSelected,
                        onChange: (checked) => toggleAllOnPage(checked, pageRowIds),
                      }}
                    />
                  </thead>
                  <tbody>
                    {pageSlice.length === 0 ? (
                      <tr>
                        <td
                          colSpan={columnCount}
                          className="px-5 py-10 text-center text-sm text-slate-500"
                        >
                          {shopDebtorsOnly
                            ? "No unpaid debtor orders match your filters."
                            : "No orders match your filters."}
                        </td>
                      </tr>
                    ) : (
                      pageSlice.map((sale) => {
                        const key = String(sale.id);
                        const rowWorkflow = workflowBySaleId.get(sale.id);
                        const cancelledRestore =
                          !routeOrdersOnly &&
                          String(sale.status ?? "").toLowerCase() === "cancelled" &&
                          canRestoreCancelledOrder(sale, rowWorkflow, capabilities)
                            ? cancelledOrderRestoreTarget(sale, rowWorkflow, capabilities)
                            : null;
                        const expiredRestore =
                          !routeOrdersOnly &&
                          String(sale.status ?? "").toLowerCase() === "expired" &&
                          canRestoreExpiredOrder(sale, rowWorkflow, capabilities)
                            ? expiredOrderRestoreTarget(sale, rowWorkflow, capabilities)
                            : null;
                        const restoreTarget = cancelledRestore ?? expiredRestore;
                        const restoreLabel = restoreTarget
                          ? `Restore to ${workflowStatusLabel(rowWorkflow, restoreTarget)}`
                          : null;
                        return (
                          <OrderListTableRow
                            key={sale.id}
                            sale={sale}
                            workflow={rowWorkflow}
                            detail={detailsById[key]}
                            itemsLoading={detailLoadingId === key}
                            uomById={uomById}
                            expanded={expandedIds.has(key)}
                            onToggleExpand={() => toggleExpand(sale.id)}
                            onContextMenu={(event) => openOrderContextMenu(event, sale)}
                            onView={() => viewOrder(sale)}
                            onPrint={() => void printOrder(sale)}
                            printAriaLabel={orderPrintAriaLabel}
                            onOpenActionsMenu={(event) => openActionsMenuFromButton(event, sale)}
                            onCollectPayment={
                              canCollectPaymentOnQueue(sale, paymentQueueSlug, null, capabilities)
                                ? () => openCollectPayment(sale)
                                : null
                            }
                            onEdit={
                              !routeOrdersOnly &&
                              isOrderEditActionVisible(sale, rowWorkflow, capabilities)
                                ? () => openEditOrder(sale)
                                : null
                            }
                            onReturn={
                              !routeOrdersOnly &&
                              isCustomerReturnAllowedForOrder(sale, capabilities)
                                ? () => router.push(`/sales/returns/new?sale_id=${sale.id}`)
                                : null
                            }
                            onRestore={
                              restoreTarget
                                ? () => void handleAdvance(sale, restoreTarget)
                                : null
                            }
                            restoreLabel={restoreLabel}
                            actionBusy={transitionBusyId === sale.id || blockingBatchBusy}
                            showOrderColumn={visibleColumnSet.has("order")}
                            showCustomerColumn={visibleColumnSet.has("customer")}
                            showBranchColumn={showBranchColumn}
                            branchName={saleBranchLabel(sale, branchById)}
                            showRouteColumn={showRouteColumn}
                            showDeliveryDateColumn={showDeliveryDateColumn}
                            showConnectivityColumn={showConnectivityColumn}
                            showAmountColumn={visibleColumnSet.has("amount")}
                            showAmountPaidColumn={showAmountPaidColumn}
                            showBalanceColumn={showBalanceColumn}
                            showVatColumn={visibleColumnSet.has("vat")}
                            showStatusColumn={visibleColumnSet.has("status")}
                            showMethodColumn={visibleColumnSet.has("method")}
                            showSourceColumn={showSourceColumn}
                            showPlacedByColumn={visibleColumnSet.has("placed_by")}
                            routeById={routeById}
                            paymentRefsBySaleId={paymentRefsBySaleId}
                            columnCount={columnCount}
                            showDiscountColumn={showDiscountColumn}
                            showApprovalColumn={showApprovalColumn}
                            showRejectionStrip={showRejectionStrip}
                            queueSlug={paymentQueueSlug}
                            onApproveActionRequest={approveActionRequest}
                            onRejectActionRequest={rejectActionRequest}
                            canApproveDiscounts={canApproveDiscounts}
                            capabilities={capabilities}
                            selection={{
                              checked: selectedIds.has(key),
                              onChange: () => toggleOne(sale.id),
                            }}
                          />
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <OrderContextMenu
            open={Boolean(contextMenu)}
            x={contextMenu?.x ?? 0}
            y={contextMenu?.y ?? 0}
            items={contextMenuItems}
            onClose={() => setContextMenu(null)}
          />
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={totalOrders}
            pageSize={pageSize}
            onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
        </div>
      </div>

      <FulfillmentAssignmentDialog
        open={Boolean(fulfillment.assignDialog)}
        sale={fulfillment.assignDialog?.sale}
        targetStatus={fulfillment.assignDialog?.targetStatus}
        drivers={fulfillment.drivers}
        vehicles={fulfillment.vehicles}
        routes={[...routeById.values()]}
        busy={fulfillment.busy}
        onClose={() => fulfillment.setAssignDialog(null)}
        onConfirm={(meta) => {
          const { sale, targetStatus } = fulfillment.assignDialog ?? {};
          if (sale) void fulfillment.runTransition(sale, targetStatus, meta);
        }}
      />
      <PodCaptureDialog
        open={Boolean(fulfillment.podDialog)}
        sale={fulfillment.podDialog?.sale}
        busy={fulfillment.busy}
        onClose={() => fulfillment.setPodDialog(null)}
        onConfirm={(meta) => {
          const { sale, targetStatus } = fulfillment.podDialog ?? {};
          if (sale) void fulfillment.runTransition(sale, targetStatus, meta);
        }}
      />
      <ProductWeightPromptDialog
        open={Boolean(fulfillment.weightDialog)}
        sale={fulfillment.weightDialog?.sale}
        targetStatus={fulfillment.weightDialog?.targetStatus}
        products={fulfillment.weightDialog?.products ?? []}
        busy={fulfillment.busy}
        onClose={() => fulfillment.setWeightDialog(null)}
        onSaved={async () => {
          const { sale, targetStatus, fulfillmentMeta } = fulfillment.weightDialog ?? {};
          if (sale) await fulfillment.continueAfterWeights(sale, targetStatus, fulfillmentMeta);
        }}
      />
      <BackofficeOrderEditModal
        open={Boolean(editSale)}
        sale={editSale}
        uomById={uomById}
        onClose={() => setEditSale(null)}
        capabilities={capabilities}
        onSaved={handleEditSaved}
      />
      <SalePosPaymentPanel
        open={Boolean(paySale)}
        sale={paySale}
        balanceDue={paySale ? saleBalanceDue(paySale) : 0}
        capabilities={capabilities}
        floatSessionId={floatSessionId}
        onClose={() => setPaySale(null)}
        onPaid={async (updated) => {
          if (updated?.id) patchSaleInState(updated);
          setPaySale(null);
          setActionMessage(
            updated?.order_num != null
              ? `Payment recorded for order ${formatOrderNumber(updated)}.`
              : "Payment recorded.",
          );
          void loadOrders();
        }}
      />
      <DiscountRejectionDialog
        open={Boolean(rejectContext)}
        busy={listLoading}
        approvalLines={rejectContext?.approvalLines ?? []}
        onSubmit={submitRejectActionRequest}
        onCancel={() => {
          if (!listLoading) setRejectContext(null);
        }}
      />
      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <button
          type="button"
          disabled={Boolean(batchBusy) || selectedCount === 0}
          onClick={() => void printSelectedOrders()}
          className="theme-primary-btn rounded-lg px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {batchBusy === "print-load"
            ? "Loading…"
            : batchBusy === "print"
              ? "Printing…"
              : `Print${selectedCount > 1 ? ` (${selectedCount})` : ""}`}
        </button>
        {!routeOrdersOnly && hasPermission(P.sales.orders.edit) ? (
          <button
            type="button"
            disabled={blockingBatchBusy || !canMergeSelected}
            title={
              canMergeSelected
                ? "Merge selected mobile orders for the same customer into one"
                : "Select 2+ mobile orders for the same customer and route"
            }
            onClick={() => void mergeSelectedOrders()}
            className="rounded-lg border border-[var(--theme-border)] bg-white px-4 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {batchBusy === "merge"
              ? "Merging…"
              : `Merge${selectedCount > 1 ? ` (${selectedCount})` : ""}`}
          </button>
        ) : null}
        {!routeOrdersOnly ? (
          <button
            type="button"
            disabled={blockingBatchBusy || selectedCount === 0}
            onClick={() => void cancelSelectedOrders()}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {batchBusy === "cancel"
              ? "Cancelling…"
              : `Cancel${selectedCount > 1 ? ` (${selectedCount})` : ""}`}
          </button>
        ) : null}
      </BatchActionBar>
      <AiInsightPanel
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        title="Analyze orders with AI"
        mode="explain_screen"
        screenKey={queueConfig?.slug ? `sales_orders_${queueConfig.slug}` : "sales_orders"}
        filters={{
          q: debouncedSearch || undefined,
          status: statusFilter,
          source: sourceFilter,
          route: routeFilter,
          cashier_id: cashierFilter !== "all" ? cashierFilter : undefined,
          from: appliedFromDate,
          to: appliedToDate,
        }}
        rows={(rows ?? []).slice(0, 80).map((s) => ({
          id: s.id,
          order_num: s.order_num,
          customer: s.customer_name || s.customer_name_override || s.customer_num,
          status: s.status,
          channel: s.channel,
          order_total: s.order_total,
          amount_paid: s.amount_paid,
          balance_due: saleBalanceDue(s),
        }))}
        summary={orderSummary}
      />
    </CatalogPageShell>
  );
}
