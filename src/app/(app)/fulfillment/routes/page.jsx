"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  EMPTY_ROUTE_FORM,
  RouteFormFields,
  buildRouteBody,
  countCustomersByRoute,
  formatRouteKes,
  normalizeRouteId,
  routeToForm,
  sumRouteSales,
  updateRouteFormField,
} from "@/components/routes/route-form";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import {
  CatalogDataImportButton,
  filterNonEmptyImportRows,
  mapImportHeaders,
} from "@/components/catalog/catalog-data-import";
import { ROUTE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { useConfirm } from "@/lib/use-confirm";
import {
  CatalogPageShell,
  FilterSelect,
  IconButton,
  PaginationBar,
  PencilIcon,
  SALES_PERIOD_OPTIONS,
  SearchInput,
  StatCard,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import {
  BatchActionBar,
  BatchDeleteButton,
  TableRowSelectCell,
  TableSelectAllHeader,
  batchDeleteWithConfirm,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";
import { CreateDispatchTripDialog } from "@/components/fulfillment/create-dispatch-trip-dialog";


export default function RoutesPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledParams = useRef("");

  const [routes, setRoutes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { search, setSearch } = useListUrlSearch();
  const [salesPeriod, setSalesPeriod] = useState("day");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_ROUTE_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [createTripOpen, setCreateTripOpen] = useState(false);
  const [createTripRouteIds, setCreateTripRouteIds] = useState([]);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  const loadData = useCallback(async () => {
    try {
      const [routeRes, custRes] = await Promise.all([
        apiRequest("/routes", {
          searchParams: { per_page: 200, include_stats: 1, stats_period: salesPeriod },
        }),
        apiRequest("/customers", { searchParams: { per_page: 500 } }),
      ]);
      setRoutes(routeRes.data ?? []);
      setCustomers(custRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load routes");
    } finally {
      setLoading(false);
    }
  }, [salesPeriod]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const customerCountByRoute = useMemo(
    () => countCustomersByRoute(customers),
    [customers],
  );

  const routeStatsById = useMemo(() => {
    const map = new Map();
    for (const route of routes) {
      const routeId = normalizeRouteId(route.id);
      if (routeId == null) continue;
      map.set(routeId, {
        total: Number(route.sales_total ?? 0),
        count: Number(route.orders_count ?? 0),
        customers: Number(route.customer_count ?? customerCountByRoute.get(routeId) ?? 0),
      });
    }
    return map;
  }, [routes, customerCountByRoute]);

  const periodSales = useMemo(() => sumRouteSales(routeStatsById), [routeStatsById]);

  const stats = useMemo(() => {
    const activeRoutes = routes.filter((r) => r.is_active !== false);
    const routeCustomers = customers.filter((c) => !c.deleted_at && c.route_id != null);
    return {
      activeRoutes: activeRoutes.length,
      routeCustomers: routeCustomers.length,
      salesTotal: periodSales.total,
      ordersCount: periodSales.count,
    };
  }, [routes, customers, periodSales]);

  const periodLabel =
    SALES_PERIOD_OPTIONS.find((o) => o.value === salesPeriod)?.label ?? "Today";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = routes;
    if (q) {
      list = list.filter(
        (r) =>
          r.route_name?.toLowerCase().includes(q) ||
          r.direction?.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const salesA = routeStatsById.get(normalizeRouteId(a.id))?.total ?? 0;
      const salesB = routeStatsById.get(normalizeRouteId(b.id))?.total ?? 0;
      return salesB - salesA;
    });
  }, [routes, search, routeStatsById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageRowIds = useMemo(() => pageSlice.map((r) => r.id), [pageSlice]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);
  const routeById = useMemo(() => new Map(pageSlice.map((r) => [String(r.id), r])), [pageSlice]);

  useEffect(() => {
    setPage(1);
  }, [search, salesPeriod]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_ROUTE_FORM });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(route) {
    setDrawerMode("edit");
    setEditingId(route.id);
    setForm(routeToForm(route));
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  function updateField(key, value) {
    setForm((prev) => updateRouteFormField(prev, key, value));
  }

  function patchForm(updates) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  async function saveRoute(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (drawerMode === "edit" && editingId != null) {
        await apiRequest(`/routes/${editingId}`, {
          method: "PUT",
          body: buildRouteBody(form),
        });
      } else {
        await apiRequest("/routes", { method: "POST", body: buildRouteBody(form) });
      }
      await loadData();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    const paramKey = `${searchParams.get("create") ?? ""}:${searchParams.get("edit") ?? ""}`;
    if (paramKey === ":" || handledParams.current === paramKey) return;
    handledParams.current = paramKey;

    const create = searchParams.get("create");
    const editId = searchParams.get("edit");

    if (create === "1") {
      openCreateDrawer();
    } else if (editId) {
      const route = routes.find((r) => String(r.id) === editId);
      if (route) {
        openEditDrawer(route);
      } else {
        apiRequest(`/routes/${editId}`)
          .then(openEditDrawer)
          .catch(() => notifyError("Route not found"));
      }
    }

    router.replace("/fulfillment/routes", { scroll: false });
  }, [loading, searchParams, routes, router]);

  async function deleteRoute(route) {
    const count = customerCountByRoute.get(route.id) ?? 0;
    const msg =
      count > 0
        ? `"${route.route_name}" has ${count} customer(s). Delete anyway?`
        : `Delete route "${route.route_name}"?`;
    const ok = await confirm({
      title: "Delete route",
      message: msg,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/routes/${route.id}`, { method: "DELETE" });
      await loadData();
      notifySuccess(`"${route.route_name}" deleted`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSelectedRoutes() {
    setBatchDeleting(true);
    try {
      await batchDeleteWithConfirm({
        confirm,
        selectedIds,
        entityName: "route",
        deleteItem: async (id) => {
          await apiRequest(`/routes/${id}`, { method: "DELETE" });
        },
        clearSelection,
        reload: loadData,
        notifySuccess,
        notifyError,
        labelForId: (id) => routeById.get(String(id))?.route_name ?? id,
      });
    } finally {
      setBatchDeleting(false);
    }
  }

  return (
    <CatalogPageShell
      title="Routes"
      subtitle="Manage delivery and sales routes"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogDataImportButton
            title="Import routes"
            description="Upload CSV or Excel. Required column: route_name (or Route). Optional: direction, route_markup_price, is_active."
            sampleHeaders={["route_name", "direction", "route_markup_price", "is_active"]}
            sampleRows={[
              ["Westlands", "Outbound", "0", "true"],
              ["Karen", "Inbound", "50", "true"],
              ["Industrial Area", "", "0", "true"],
            ]}
            apiPath="/routes/import-batch"
            permission="fulfillment.manage"
            normalizeRows={(rows) =>
              filterNonEmptyImportRows(mapImportHeaders(rows, ROUTE_EXPORT_COLUMNS), ["route_name"])
            }
            onImported={loadData}
            importPage="routes"
          />
          <CatalogListExport
            title="Routes"
            filename="routes"
            apiPath="/routes"
            columns={ROUTE_EXPORT_COLUMNS}
            totalCount={filtered.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <button
            type="button"
            onClick={openCreateDrawer}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
          >
            <PlusIcon />
            Add Route
          </button>
        </div>
      }
      banner={
        !loading ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active routes" value={stats.activeRoutes.toLocaleString()} />
            <StatCard label="Customers on routes" value={stats.routeCustomers.toLocaleString()} />
            <StatCard
              label={`Sales · ${periodLabel.toLowerCase()}`}
              value={formatRouteKes(stats.salesTotal)}
            />
            <StatCard
              label={`Orders · ${periodLabel.toLowerCase()}`}
              value={stats.ordersCount.toLocaleString()}
            />
          </div>
        ) : null
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search route…"
          />
          <FilterSelect
            value={salesPeriod}
            onChange={(e) => setSalesPeriod(e.target.value)}
            options={SALES_PERIOD_OPTIONS}
          />
        </div>
      }
    >
      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading routes…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <TableSelectAllHeader
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected}
                      onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                    />
                    <th className="w-[70px] px-4 py-2.5">ID</th>
                    <th className="px-4 py-2.5">Route name</th>
                    <th className="px-4 py-2.5">Region</th>
                    <th className="px-4 py-2.5">Customers</th>
                    <th className="px-4 py-2.5 text-right">
                      Sales ({periodLabel.toLowerCase()})
                    </th>
                    <th className="px-4 py-2.5 text-right">Orders</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="w-[110px] px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                        No routes found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((route) => {
                      const routeId = normalizeRouteId(route.id);
                      const routeSales = routeStatsById.get(routeId);
                      return (
                        <tr
                          key={route.id}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                        >
                          <TableRowSelectCell
                            checked={selectedIds.has(String(route.id))}
                            onChange={() => toggleOne(route.id)}
                            label={`Select ${route.route_name}`}
                          />
                          <td className="px-4 py-3 font-mono text-slate-600">{route.id}</td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/fulfillment/routes/${route.id}`}
                              className="font-medium text-[#185FA5] hover:text-[#144f8a] hover:underline"
                            >
                              {route.route_name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{route.direction || "—"}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {routeSales?.customers ?? customerCountByRoute.get(routeId) ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800">
                            {formatRouteKes(routeSales?.total ?? 0)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {routeSales?.count ?? 0}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge active={route.is_active !== false} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <IconButton
                                label="View"
                                onClick={() => router.push(`/fulfillment/routes/${route.id}`)}
                              >
                                <ViewIcon />
                              </IconButton>
                              <IconButton
                                label="Edit"
                                onClick={() => openEditDrawer(route)}
                              >
                                <PencilIcon />
                              </IconButton>
                              <IconButton label="Delete" danger onClick={() => deleteRoute(route)}>
                                <TrashIcon />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )}
      </div>

      {drawerOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30"
            aria-label="Close drawer"
            onClick={closeDrawer}
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-medium text-slate-900">
                {drawerMode === "edit" ? "Edit route" : "Add route"}
              </h2>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={saveRoute} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <RouteFormFields form={form} onChange={updateField} onPatch={patchForm} />
              </div>

              {formError && (
                <p className="mx-5 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </p>
              )}

              <div className="border-t border-slate-200 px-5 py-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-[#185FA5] py-2.5 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
                >
                  {saving
                    ? "Saving…"
                    : drawerMode === "edit"
                      ? "Save changes"
                      : "Create route"}
                </button>
              </div>
            </form>
          </aside>
        </>
      )}

      <CreateDispatchTripDialog
        open={createTripOpen}
        onClose={() => {
          setCreateTripOpen(false);
          setCreateTripRouteIds([]);
          clearSelection();
        }}
        routes={routes}
        defaultRouteIds={createTripRouteIds}
        description="Select routes going the same direction, then assign the driver and vehicle for this trip chart."
      />

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => {
            setCreateTripRouteIds([...selectedIds].map((id) => Number(id)).filter((id) => id > 0));
            setCreateTripOpen(true);
          }}
        >
          Create trip chart
        </button>
        <BatchDeleteButton
          count={selectedCount}
          busy={batchDeleting}
          onClick={() => void deleteSelectedRoutes()}
        />
      </BatchActionBar>
    </CatalogPageShell>
  );
}

function StatusBadge({ active }) {
  return active ? (
    <span className="inline-flex rounded-full bg-[#EAF3DE] px-2.5 py-0.5 text-[11px] font-medium text-[#27500A]">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
      Inactive
    </span>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
