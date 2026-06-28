"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/api-concurrency";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { useAuth } from "@/contexts/auth-context";
import {
  getOrderWorkflow,
  getSalesOrderQueueWorkflow,
  resolveSalesOrderQueue,
  workflowStatusFilterOptions,
} from "@/lib/order-workflow";
import {
  CatalogPageShell,
  Field,
  PaginationBar,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { isoDate } from "@/components/inventory/inventory-shared";
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
import { getOrderDocumentType, isOrgMobileSalesEnabled, orderDocumentPrintLabel } from "@/lib/sales-settings";
import {
  disposePrintWindow,
  openBlankPrintWindow,
  printWindowFeatures,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";
import { useFulfillmentTransition } from "@/lib/use-fulfillment-transition";
import {
  FulfillmentAssignmentDialog,
  PodCaptureDialog,
} from "@/components/fulfillment/fulfillment-assignment-dialog";

const PAGE_SIZE = 15;
const FILTER_CONTROL_CLASS = "theme-input theme-input-focus h-[38px] w-full min-w-[10.5rem] rounded-lg border px-3 py-2 text-sm outline-none";

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

export default function SalesOrdersListScreen({ queueSlug = null, routeOrdersOnly = false }) {
  const router = useRouter();
  const { user, capabilities, refreshCapabilities, organization } = useAuth();
  const orgWorkflow = useMemo(
    () => getSalesOrderQueueWorkflow(capabilities, "backend"),
    [capabilities],
  );
  const includeMobileOrders = isOrgMobileSalesEnabled(capabilities);
  const queueConfig = useMemo(
    () => resolveSalesOrderQueue(queueSlug, orgWorkflow, { includeMobile: includeMobileOrders }),
    [queueSlug, orgWorkflow, includeMobileOrders],
  );
  const statusOptions = useMemo(
    () => workflowStatusFilterOptions(orgWorkflow),
    [orgWorkflow],
  );
  const sourceOptions = useMemo(
    () => orderSourceFilterOptions(includeMobileOrders, true),
    [includeMobileOrders],
  );

  const [rows, setRows] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [minTotalFilter, setMinTotalFilter] = useState("");
  const [fromDate, setFromDate] = useState(() => isoDate());
  const [toDate, setToDate] = useState(() => isoDate());
  const [appliedFromDate, setAppliedFromDate] = useState(() => isoDate());
  const [appliedToDate, setAppliedToDate] = useState(() => isoDate());
  const [page, setPage] = useState(1);
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

  const effectiveStatusFilter = queueConfig?.lockStatusFilter
    ? queueConfig.fixedStatusFilter
    : statusFilter;
  const effectiveSourceFilter = queueConfig?.lockSourceFilter
    ? queueConfig.fixedSourceFilter
    : sourceFilter;

  useEffect(() => {
    if (!includeMobileOrders && sourceFilter === "mobile") {
      setSourceFilter("all");
    }
  }, [includeMobileOrders, sourceFilter]);

  useEffect(() => {
    refreshCapabilities().catch(() => {});
  }, [refreshCapabilities]);

  useEffect(() => {
    const orgId = user?.organization_id;
    apiRequest("/branches", { searchParams: { per_page: 200 } })
      .then((res) => {
        const list = (res.data ?? []).filter(
          (branch) => !orgId || branch.organization_id === orgId,
        );
        setBranches(list);
      })
      .catch(() => setBranches([]));
  }, [user?.organization_id]);

  useEffect(() => {
    Promise.all([
      apiRequest("/routes", { searchParams: { per_page: 200 } }),
      apiRequest("/uoms", { searchParams: { per_page: 500 } }),
    ])
      .then(([routeRes, uomRes]) => {
        const routes = new Map();
        for (const route of routeRes.data ?? []) {
          if (route?.id != null) routes.set(route.id, route);
        }
        setRouteById(routes);
        const uoms = new Map();
        for (const u of uomRes.data ?? []) {
          if (u?.id != null) uoms.set(u.id, u);
        }
        setUomById(uoms);
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
  const showSourceColumn = !routeOrdersOnly && sourceOptions.length > 2;
  const showSourceFilter = !routeOrdersOnly && sourceOptions.length > 2;
  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );
  const columnCount = orderTableColumnCount({
    showBranchColumn,
    showRouteColumn,
    showDeliveryDateColumn,
    showSourceColumn,
  });

  const loadOrders = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const filters = {};
      const statusParam = queueConfig?.lockStatusFilter
        ? queueConfig.fixedStatusFilter
        : effectiveStatusFilter !== "all"
          ? effectiveStatusFilter
          : null;
      if (statusParam) filters.status = statusParam;

      const extra = {
        exclude_status: "held",
        with_items: 1,
      };
      if (routeOrdersOnly) extra.route_orders = 1;
      if (appliedFromDate) extra.from_date = appliedFromDate;
      if (appliedToDate) extra.to_date = appliedToDate;
      if (minTotalFilter) extra.min_order_total = minTotalFilter;
      if (!routeOrdersOnly && effectiveSourceFilter && effectiveSourceFilter !== "all") {
        extra.order_source = effectiveSourceFilter;
      }

      const searchParams = buildPageParams({
        page,
        perPage: PAGE_SIZE,
        q: debouncedSearch,
        filters,
        extra,
      });
      const res = await apiRequest("/sales", { searchParams });
      const parsed = parsePaginator(res);
      const list = parsed.items;

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
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [
    page,
    debouncedSearch,
    appliedFromDate,
    appliedToDate,
    effectiveSourceFilter,
    effectiveStatusFilter,
    queueConfig,
    routeOrdersOnly,
    minTotalFilter,
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
      ? "/fulfillment/orders"
      : queueSlug
        ? `/sales/orders/queues/${queueSlug}`
        : "/sales/orders";
    router.push(`/sales/orders/${sale.id}?from=${encodeURIComponent(from)}`);
  }

  async function printOrder(sale) {
    if (!sale?.id) return;

    const cachedType = getOrderDocumentType(capabilities?.module_settings);
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
        printWindow,
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
      if (!window.confirm("Cancel this order?")) return;
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
      setActionMessage(`Order ${sale.order_num ?? sale.id} updated.`);
      if (queueConfig?.lockStatusFilter && updated.status !== queueConfig.fixedStatusFilter) {
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
      setActionMessage(`Order ${updated.order_num ?? updated.id} updated.`);
      if (queueConfig?.lockStatusFilter && updated.status !== queueConfig.fixedStatusFilter) {
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
    fulfillment.requestTransition(sale, targetStatus);
  }

  function applyDateFilter() {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
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

  const printLabel = orderDocumentPrintLabel(capabilities?.module_settings);

  const contextMenuItems = useMemo(() => {
    if (!contextMenu?.sale) return [];
    const sale = contextMenu.sale;
    const workflow = getOrderWorkflow(capabilities, sale);
    return buildOrderContextMenuItems({
      sale,
      workflow,
      busy: transitionBusyId === sale.id || fulfillment.busy,
      includePrint: contextMenu.includePrint !== false,
      printLabel,
      onView: () => viewOrder(sale),
      onPrint: () => void printOrder(sale),
      onAdvance: (status) => void handleAdvance(sale, status),
      onCancel: () => void handleAdvance(sale, "cancelled"),
    });
  }, [contextMenu, capabilities, transitionBusyId, printLabel]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sourceFilter, minTotalFilter, appliedFromDate, appliedToDate, queueSlug]);

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
      title={
        routeOrdersOnly
          ? "Route orders"
          : queueConfig?.title ?? "View All Orders"
      }
      subtitle={
        routeOrdersOnly
          ? "Mobile field sales and POS route orders awaiting dispatch and delivery"
          : queueConfig?.subtitle ?? "Browse and manage every sales order in your workflow"
      }
      action={
        routeOrdersOnly ? null : (
          <Link
            href="/sales/pos"
            className="inline-flex items-center rounded-lg bg-[var(--theme-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--theme-primary-hover)]"
          >
            + New sale
          </Link>
        )
      }
      toolbar={
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:gap-4">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search receipt, customer, order #…"
            className="w-full xl:min-w-0 xl:flex-[2]"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(2,minmax(10.5rem,1fr))_auto] sm:items-end xl:grid-cols-[repeat(2,minmax(10.5rem,1fr))_auto_minmax(10.5rem,1fr)_minmax(10.5rem,1fr)]">
            <Field label="From">
              <input
                type="date"
                className={inputClassName()}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value || isoDate())}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className={inputClassName()}
                value={toDate}
                onChange={(e) => setToDate(e.target.value || isoDate())}
              />
            </Field>
            <button
              type="button"
              onClick={applyDateFilter}
              className="inline-flex h-[38px] shrink-0 items-center justify-center self-end rounded-lg border border-[var(--theme-primary)]/30 bg-[var(--theme-primary-muted)] px-3 text-sm font-medium text-[var(--theme-primary)] hover:bg-[#d4e8f9]"
            >
              Filter
            </button>
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
          </div>
        </div>
      }
      banner={
        error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : actionMessage ? (
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
            <p className="px-5 py-8 text-center text-sm text-slate-500">Loading orders…</p>
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
                      showSourceColumn={showSourceColumn}
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
                          onOpenActionsMenu={(event) => openActionsMenuFromButton(event, sale)}
                          actionBusy={transitionBusyId === sale.id}
                          showBranchColumn={showBranchColumn}
                          branchName={saleBranchLabel(sale, branchById)}
                          showRouteColumn={showRouteColumn}
                          showDeliveryDateColumn={showDeliveryDateColumn}
                          showSourceColumn={showSourceColumn}
                          routeById={routeById}
                          paymentRefsBySaleId={paymentRefsBySaleId}
                          columnCount={columnCount}
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
            pageSize={PAGE_SIZE}
            onChange={setPage}
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
    </CatalogPageShell>
  );
}
