"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/api-concurrency";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListPageSize, useTableSort } from "@/lib/use-list-page-controls";
import { fetchBranchesCached, fetchRoutesAndUomsCached } from "@/lib/reference-data-cache";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { useAuth } from "@/contexts/auth-context";
import {
  getOrderWorkflow,
  getSalesOrderQueueWorkflow,
  isPaymentGatedWorkflowTransition,
  resolveSalesOrderQueue,
  saleBalanceDue,
  canCollectPaymentOnQueue,
  workflowStatusFilterOptions,
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
import { defaultDateRange, isoDate } from "@/components/inventory/inventory-shared";
import { shouldShowSalesDiscountColumn, canApproveDiscountRequests } from "@/lib/sales-settings";
import { orderTableColumnCount } from "@/components/sales/sales-orders-columns";
import {
  orderSourceFilterOptions,
  OrderContextMenu,
  OrderListTableHead,
  OrderListTableRow,
  OrderSummaryStats,
  buildOrderContextMenuItems,
  ORDER_MIN_TOTAL_OPTIONS,
  saleBranchLabel,
  summarizeOrders,
} from "@/components/sales/sales-orders-shared";
import { printSaleOrder } from "@/components/sales/sale-order-print";
import { isExternalPosEnabled } from "@/lib/nav-feature-gates";
import { isPlatformWhatsappEnabled } from "@/lib/platform-org-features";
import { routeOrderSourcesText } from "@/lib/distribution-settings";
import {
  defaultOrderListPrintDocumentType,
  getOrdersListDefaultDateRange,
  getOrdersListSearchDays,
  getOrdersListSort,
  isOrgMobileSalesEnabled,
  orderListDateRangeUsesArchive,
  ORDERS_HOT_WINDOW_DAYS,
  orderListPrintAriaLabel,
  sortOrdersForList,
} from "@/lib/sales-settings";
import {
  disposePrintWindow,
  openBlankPrintWindow,
  printWindowFeatures,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";
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
} from "@/lib/sales";
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

export default function SalesOrdersListScreen({
  queueSlug = null,
  routeOrdersOnly = false,
  routeOrdersDateRangeDays = 30,
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { user, capabilities, organization, hasPermission } = useAuth();
  const { floatSessionId } = usePosSession();
  const orgWorkflow = useMemo(
    () => getSalesOrderQueueWorkflow(capabilities, "backend"),
    [capabilities],
  );
  const includeMobileOrders = isOrgMobileSalesEnabled(capabilities);
  const includeWhatsappOrders = isPlatformWhatsappEnabled(capabilities);
  const queueConfig = useMemo(
    () =>
      resolveSalesOrderQueue(queueSlug, orgWorkflow, {
        includeMobile: includeMobileOrders,
        includeWhatsapp: includeWhatsappOrders,
        capabilities,
      }),
    [queueSlug, orgWorkflow, includeMobileOrders, includeWhatsappOrders, capabilities],
  );
  const statusOptions = useMemo(
    () => workflowStatusFilterOptions(orgWorkflow),
    [orgWorkflow],
  );
  const includeExternalPos = isExternalPosEnabled(capabilities);
  const sourceOptions = useMemo(
    () => orderSourceFilterOptions(includeMobileOrders, includeExternalPos, includeWhatsappOrders),
    [includeMobileOrders, includeExternalPos, includeWhatsappOrders],
  );

  const [rows, setRows] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [minTotalFilter, setMinTotalFilter] = useState("");
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
  const [routeById, setRouteById] = useState(() => new Map());
  const [paymentRefsBySaleId, setPaymentRefsBySaleId] = useState(() => new Map());
  const [contextMenu, setContextMenu] = useState(null);
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

  const ordersSearchDays = useMemo(
    () => getOrdersListSearchDays(capabilities?.module_settings),
    [capabilities?.module_settings],
  );

  useEffect(() => {
    const range =
      routeOrdersOnly && routeOrdersDateRangeDays
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
  ]);

  useEffect(() => {
    if (!includeMobileOrders && sourceFilter === "mobile") {
      setSourceFilter("all");
    }
  }, [includeMobileOrders, sourceFilter]);

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

  const showBranchColumn = branches.length > 1;
  const showRouteColumn = routeOrdersOnly || Boolean(queueConfig?.showRouteColumn);
  const showDeliveryDateColumn = routeOrdersOnly || Boolean(queueConfig?.showDeliveryDateColumn);
  const showConnectivityColumn = Boolean(queueConfig?.showConnectivityColumn);
  const showSourceColumn = !routeOrdersOnly && sourceOptions.length > 2;
  const showSourceFilter = !routeOrdersOnly && sourceOptions.length > 2;
  const showDiscountColumn = shouldShowSalesDiscountColumn(capabilities?.module_settings);
  const showPaymentBreakdownColumns =
    String(queueConfig?.fixedPaymentStatusFilter ?? "").toLowerCase() === "partial" ||
    String(queueSlug ?? "").toLowerCase() === "pending_payment";
  const showApprovalColumn =
    queueSlug === "pending-approval" || queueSlug === "pending_approval";
  const showRejectionStrip = queueSlug === "editable";
  const canApproveDiscounts = canApproveDiscountRequests({ hasPermission, capabilities });
  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );
  const columnCount = orderTableColumnCount({
    showBranchColumn,
    showRouteColumn,
    showDeliveryDateColumn,
    showConnectivityColumn,
    showSourceColumn,
    showDiscountColumn,
    showPaymentBreakdownColumns,
  });

  const loadingFromArchive =
    Boolean(listScope?.from_archive) ||
    orderListDateRangeUsesArchive(
      appliedFromDate,
      queueConfig?.dateRangeDays || ORDERS_HOT_WINDOW_DAYS,
    );
  const showArchiveLoading =
    (loading || listLoading) && (loadingFromArchive || Boolean(debouncedSearch.trim()));
  const showTableLoading = loading || (listLoading && rows.length === 0);
  const showRefreshOverlay = listLoading && !loading && rows.length > 0 && !showArchiveLoading;

  const loadOrders = useCallback(async () => {
    if (!listFiltersInitialized) return;
    setListLoading(true);
    try {
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
      }
      if (queueConfig?.requireOutstandingBalance) {
        extra.outstanding_balance = 1;
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
      if (minTotalFilter) extra.min_order_total = minTotalFilter;
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
      if (orderCol) extra.filter_order = orderCol;
      if (customerCol) extra.filter_customer = customerCol;
      if (amountCol) extra.filter_amount = amountCol;
      if (methodCol) extra.filter_method = methodCol;
      if (placedByCol) extra.filter_placed_by = placedByCol;
      if (sourceFromColumn) extra.filter_source = sourceFromColumn;

      const searchQ = normalizeSalesListSearchQuery(debouncedSearch);
      // Searching expands the effective date window using the platform search days setting.
      if (searchQ && appliedFromDate && appliedToDate) {
        const searchRange = defaultDateRange(ordersSearchDays);
        if (String(appliedFromDate) > String(searchRange.from)) {
          extra.from_date = searchRange.from;
        }
      }

      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: searchQ || undefined,
        filters,
        extra,
      });
      const res = await apiRequest("/sales", { searchParams });
      const parsed = parsePaginator(res);
      const list = sortOrdersForList(parsed.items, ordersListSort);

      setListScope(res?.list_scope ?? null);
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
    page,
    pageSize,
    debouncedSearch,
    appliedFromDate,
    appliedToDate,
    effectiveSourceFilter,
    effectiveStatusFilter,
    queueConfig,
    routeOrdersOnly,
    minTotalFilter,
    routeFilter,
    listFiltersInitialized,
    ordersListSort,
    ordersSearchDays,
    debouncedColumnFilters,
  ]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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
    setContextMenu(null);

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

  async function printOrder(sale, documentType = null) {
    if (!sale?.id) return;

    const cachedType =
      documentType ?? defaultOrderListPrintDocumentType(capabilities?.module_settings, capabilities);
    const printWindow =
      cachedType !== "both"
        ? openBlankPrintWindow(printWindowFeatures(cachedType))
        : null;
    if (cachedType !== "both" && !printWindow) {
      setActionMessage(PRINT_BLOCKED_MESSAGE);
      return;
    }

    try {
      const key = String(sale.id);
      let detail = detailsById[key] ?? sale;
      if (detail?.items === undefined) {
        const loaded = await loadOrderDetail(sale.id);
        if (loaded) detail = loaded;
      }
      const printed = await printSaleOrder(detail, {
        organization,
        organizationName: capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME,
        moduleSettings: capabilities?.module_settings,
        capabilities,
        uomById,
        user,
        printWindow,
        ...(documentType ? { documentType } : {}),
      });
      if (!printed) {
        disposePrintWindow(printWindow);
      }
    } catch (e) {
      disposePrintWindow(printWindow);
      setActionMessage(e instanceof Error ? e.message : "Print failed");
    }
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

  async function transitionOrder(sale, targetStatus, fulfillmentMeta) {
    if (!sale?.id) return;
    if (transitionBusyId === sale.id) return;
    if (targetStatus === "cancelled") {
      const ok = await confirm({
        title: "Cancel order",
        message: "Cancel this order?",
        confirmLabel: "Cancel order",
        destructive: true,
      });
      if (!ok) return;
    }
    setTransitionBusyId(sale.id);
    setActionMessage(null);
    try {
      const body = { status: targetStatus };
      if (fulfillmentMeta) body.fulfillment_meta = fulfillmentMeta;
      const updated = await apiRequest(`/sales/orders/${sale.id}/transition`, {
        method: "POST",
        body,
      });
      patchSaleInState(updated);
      setActionMessage(`Order ${formatOrderNumber(sale)} updated.`);
      if (queueConfig?.lockStatusFilter && updated.status !== queueConfig.fixedStatusFilter) {
        setRows((prev) => prev.filter((s) => s.id !== updated.id));
      }
      if (
        queueConfig?.fixedPaymentStatusFilter &&
        String(updated.payment_status ?? "").toLowerCase() !== queueConfig.fixedPaymentStatusFilter
      ) {
        setRows((prev) => prev.filter((s) => s.id !== updated.id));
      }
    } catch (e) {
      setActionMessage(e instanceof ApiError ? e.message : "Could not update order.");
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

  function handleAdvance(sale, targetStatus) {
    if (transitionBusyId === sale.id || fulfillment.busy) return;
    if (targetStatus === "cancelled") {
      void transitionOrder(sale, targetStatus);
      return;
    }
    if (String(sale?.status ?? "").toLowerCase() === "expired") {
      void transitionOrder(sale, targetStatus);
      return;
    }
    if (isPaymentGatedWorkflowTransition(sale, targetStatus)) {
      setContextMenu(null);
      setPaySale(sale);
      return;
    }
    fulfillment.requestTransition(sale, targetStatus);
  }

  function openCollectPayment(sale) {
    if (!sale?.id || !canCollectPaymentOnQueue(sale, queueSlug, null, capabilities)) return;
    setContextMenu(null);
    setPaySale(sale);
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

  const summary = useMemo(() => summarizeOrders(rows), [rows]);
  const pageSlice = rows;

  const workflowBySaleId = useMemo(() => {
    const map = new Map();
    for (const sale of pageSlice) {
      map.set(sale.id, getOrderWorkflow(capabilities, sale));
    }
    return map;
  }, [pageSlice, capabilities]);

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

  const showTransitionOverlay = Boolean(transitionBusyId) || fulfillment.busy;

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
      balanceDue: saleBalanceDue(sale),
      disableWorkflowActions: routeOrdersOnly,
      onView: () => viewOrder(sale),
      onEdit: () => void openEditOrder(sale),
      onCollectPayment: canCollectPaymentOnQueue(sale, queueSlug, null, capabilities)
        ? () => openCollectPayment(sale)
        : null,
      onPrintThermal: () => void printOrder(sale, "receipt"),
      onPrintA4: () => void printOrder(sale, "invoice"),
      onAdvance: routeOrdersOnly ? null : (status) => void handleAdvance(sale, status),
      onCancel: routeOrdersOnly ? null : () => void handleAdvance(sale, "cancelled"),
    });
  }, [contextMenu, capabilities, transitionBusyId, fulfillment.busy, hasExternalPos, routeOrdersOnly, queueSlug]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sourceFilter, minTotalFilter, appliedFromDate, appliedToDate, queueSlug]);

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
        routeOrdersOnly
          ? (queueConfig?.title ?? "Route orders")
          : queueConfig?.title ?? "View All Orders"
      }
        subtitle={
          routeOrdersOnly
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
        <FilterToolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search S0034, customer, order #…"
          />
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
            <select
              value={effectiveStatusFilter ?? "all"}
              disabled={queueConfig?.lockStatusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${FILTER_CONTROL_CLASS} disabled:cursor-not-allowed disabled:bg-slate-50`}
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {showSourceFilter ? (
            <Field label="Source">
              <select
                value={effectiveSourceFilter ?? "all"}
                disabled={queueConfig?.lockSourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className={`${FILTER_CONTROL_CLASS} disabled:cursor-not-allowed disabled:bg-slate-50`}
              >
                {sourceOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Order total">
            <select
              value={minTotalFilter}
              onChange={(e) => setMinTotalFilter(e.target.value)}
              className={FILTER_CONTROL_CLASS}
            >
              {ORDER_MIN_TOTAL_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </FilterToolbar>
      }
      banner={actionMessage ? <ActionFeedbackBanner message={actionMessage} /> : null}
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
                days
                {debouncedSearch.trim()
                  ? `, or search is scoped to the last ${ordersSearchDays} days`
                  : ""}
                .
              </span>
            </span>
          </div>
        ) : null}
        {!loading ? (
          <OrderSummaryStats summary={summary} hint={summaryHint} />
        ) : null}

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
                Updating order…
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
              <div className="flex flex-wrap items-center justify-between gap-2 theme-table-head-row border-b px-4 py-2">
                <p className="text-xs text-slate-500">
                  {pageSlice.length === 0
                    ? "No orders on this page · Adjust filters above or in the header row"
                    : `${pageSlice.length} order${pageSlice.length === 1 ? "" : "s"} on this page · Right-click for actions`}
                </p>
                <button
                  type="button"
                  disabled={!pageSlice.length}
                  onClick={toggleExpandAllOnPage}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    allPageExpanded
                      ? "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "border-[var(--theme-primary)]/30 bg-[var(--theme-primary-muted)] text-[var(--theme-primary)] hover:bg-[#d4e8f9]"
                  }`}
                >
                  {allPageExpanded ? "Collapse all" : "Expand all"}
                </button>
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
                ) : (
                  <p className="px-4 pt-2 text-[11px] text-slate-500">
                    Sorted by newest orders first. Click a column header to change sort; use the row
                    below to filter.
                  </p>
                )}
                <table
                  className={`w-full border-collapse text-sm ${
                    showPaymentBreakdownColumns ? "min-w-[1240px]" : "min-w-[1040px]"
                  }`}
                >
                  <thead>
                    <OrderListTableHead
                      showBranchColumn={showBranchColumn}
                      showRouteColumn={showRouteColumn}
                      showDeliveryDateColumn={showDeliveryDateColumn}
                      showConnectivityColumn={showConnectivityColumn}
                      showSourceColumn={showSourceColumn}
                      showDiscountColumn={showDiscountColumn}
                      showPaymentBreakdownColumns={showPaymentBreakdownColumns}
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
                    />
                  </thead>
                  <tbody>
                    {pageSlice.length === 0 ? (
                      <tr>
                        <td
                          colSpan={columnCount}
                          className="px-5 py-10 text-center text-sm text-slate-500"
                        >
                          No orders match your filters.
                        </td>
                      </tr>
                    ) : (
                      pageSlice.map((sale) => {
                        const key = String(sale.id);
                        return (
                          <OrderListTableRow
                            key={sale.id}
                            sale={sale}
                            workflow={workflowBySaleId.get(sale.id)}
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
                              canCollectPaymentOnQueue(sale, queueSlug, null, capabilities)
                                ? () => openCollectPayment(sale)
                                : null
                            }
                            actionBusy={transitionBusyId === sale.id}
                            showBranchColumn={showBranchColumn}
                            branchName={saleBranchLabel(sale, branchById)}
                            showRouteColumn={showRouteColumn}
                            showDeliveryDateColumn={showDeliveryDateColumn}
                            showConnectivityColumn={showConnectivityColumn}
                            showSourceColumn={showSourceColumn}
                            routeById={routeById}
                            paymentRefsBySaleId={paymentRefsBySaleId}
                            columnCount={columnCount}
                            showDiscountColumn={showDiscountColumn}
                            showPaymentBreakdownColumns={showPaymentBreakdownColumns}
                            showApprovalColumn={showApprovalColumn}
                            showRejectionStrip={showRejectionStrip}
                            queueSlug={queueSlug}
                            onApproveActionRequest={approveActionRequest}
                            onRejectActionRequest={rejectActionRequest}
                            canApproveDiscounts={canApproveDiscounts}
                            capabilities={capabilities}
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
    </CatalogPageShell>
  );
}
