"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/api-concurrency";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListPageSize } from "@/lib/use-list-page-controls";
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
  isPaymentCollectionQueueSlug,
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
  indexSalesWithItems,
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
  getOrdersListSort,
  isOrgMobileSalesEnabled,
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
import { formatOrderNumber } from "@/lib/sales";
import {
  FulfillmentAssignmentDialog,
  PodCaptureDialog,
} from "@/components/fulfillment/fulfillment-assignment-dialog";
import { ProductWeightPromptDialog } from "@/components/fulfillment/product-weight-prompt-dialog";
import { BackofficeOrderEditModal } from "@/components/sales/backoffice-order-edit-modal";
import { SalePosPaymentPanel } from "@/components/sales/sale-pos-payment-panel";
import { usePosSession } from "@/contexts/pos-session-context";

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
    () => resolveSalesOrderQueue(queueSlug, orgWorkflow, { includeMobile: includeMobileOrders, capabilities }),
    [queueSlug, orgWorkflow, includeMobileOrders, capabilities],
  );
  const statusOptions = useMemo(
    () => workflowStatusFilterOptions(orgWorkflow),
    [orgWorkflow],
  );
  const sourceOptions = useMemo(
    () => orderSourceFilterOptions(includeMobileOrders, true, includeWhatsappOrders),
    [includeMobileOrders, includeWhatsappOrders],
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
  const [listFiltersInitialized, setListFiltersInitialized] = useState(false);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);
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

  const ordersListSort = useMemo(
    () => getOrdersListSort(capabilities?.module_settings),
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
    const orgId = user?.organization_id;
    fetchBranchesCached(orgId)
      .then((list) => setBranches(list))
      .catch(() => setBranches([]));
  }, [user?.organization_id]);

  useEffect(() => {
    fetchRoutesAndUomsCached()
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
  }, []);

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
  });

  const loadOrders = useCallback(async () => {
    if (!listFiltersInitialized) return;
    setListLoading(true);
    try {
      const filters = {};
      const statusParam = queueConfig?.lockStatusFilter
        ? queueConfig.fixedStatusFilter
        : effectiveStatusFilter !== "all"
          ? effectiveStatusFilter
          : null;
      if (statusParam) filters.status = statusParam;
      if (queueConfig?.fixedPaymentStatusFilter) {
        filters.payment_status = queueConfig.fixedPaymentStatusFilter;
      }

      const extra = {
        exclude_status: "held",
        with_items: 1,
        sort: ordersListSort,
      };
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
      if (minTotalFilter) extra.min_order_total = minTotalFilter;
      if (routeFilter && routeFilter !== "all") {
        extra.route_id = routeFilter;
      }
      if (!routeOrdersOnly && effectiveSourceFilter && effectiveSourceFilter !== "all") {
        extra.order_source = effectiveSourceFilter;
      }

      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        filters,
        extra,
      });
      const res = await apiRequest("/sales", { searchParams });
      const parsed = parsePaginator(res);
      const list = sortOrdersForList(parsed.items, ordersListSort);

      setRows(list);
      setTotalOrders(parsed.total);
      setTotalPages(parsed.totalPages);
      setDetailsById(indexSalesWithItems(list));

      const missing = list.filter((sale) => !sale?.items?.length);
      if (missing.length) {
        const loaded = await mapWithConcurrency(
          missing,
          (sale) => apiRequest(`/sales/${sale.id}`).catch(() => null),
          3,
        );
        setDetailsById((prev) => {
          const next = { ...prev };
          for (const sale of loaded) {
            if (sale?.id) next[String(sale.id)] = sale;
          }
          return next;
        });
      }
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
  ]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function loadOrderDetail(orderId) {
    const key = String(orderId);
    if (detailsById[key]?.items?.length) return detailsById[key];
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

  function openEditOrder(sale) {
    if (!sale?.id || !sale.can_edit_lines) return;
    setContextMenu(null);
    setEditSale(sale);
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
      if (!detail?.items?.length) {
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
    if (targetStatus === "cancelled") {
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
    if (!sale?.id || !canCollectPaymentOnQueue(sale, queueSlug)) return;
    setContextMenu(null);
    setPaySale(sale);
  }

  const showCollectPaymentAction = isPaymentCollectionQueueSlug(queueSlug);

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
      canEdit: Boolean(sale.can_edit_lines),
      balanceDue: saleBalanceDue(sale),
      disableWorkflowActions: routeOrdersOnly,
      onView: () => viewOrder(sale),
      onEdit: () => openEditOrder(sale),
      onCollectPayment: canCollectPaymentOnQueue(sale, queueSlug) ? () => openCollectPayment(sale) : null,
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
          <Link
            href="/sales/pos"
            className="inline-flex items-center rounded-lg bg-[var(--theme-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--theme-primary-hover)]"
          >
            + New sale
          </Link>
        )
      }
      toolbar={
        <FilterToolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search receipt, customer, order #…"
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
      banner={actionMessage ? (
          <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {actionMessage}
          </p>
        ) : null
      }
    >
      <div className="mt-8 space-y-6">
        {!loading ? (
          <OrderSummaryStats summary={summary} hint={summaryHint} />
        ) : null}

        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          {loading ? (
            <div className="min-h-[280px]" aria-hidden />
          ) : pageSlice.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No orders match your filters.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 theme-table-head-row border-b px-4 py-2">
                <p className="text-xs text-slate-500">
                  {pageSlice.length} order{pageSlice.length === 1 ? "" : "s"} on this page · Right-click for actions
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
                <table className="w-full min-w-[1040px] border-collapse text-sm">
                  <thead>
                    <OrderListTableHead
                      showBranchColumn={showBranchColumn}
                      showRouteColumn={showRouteColumn}
                      showDeliveryDateColumn={showDeliveryDateColumn}
                      showConnectivityColumn={showConnectivityColumn}
                      showSourceColumn={showSourceColumn}
                      showDiscountColumn={showDiscountColumn}
                    />
                  </thead>
                  <tbody>
                    {pageSlice.map((sale) => {
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
                            showCollectPaymentAction && canCollectPaymentOnQueue(sale, queueSlug)
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
                          showApprovalColumn={showApprovalColumn}
                          showRejectionStrip={showRejectionStrip}
                          queueSlug={queueSlug}
                          onApproveActionRequest={approveActionRequest}
                          onRejectActionRequest={rejectActionRequest}
                          canApproveDiscounts={canApproveDiscounts}
                          capabilities={capabilities}
                        />
                      );
                    })}
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
