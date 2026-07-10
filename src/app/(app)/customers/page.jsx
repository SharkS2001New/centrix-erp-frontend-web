"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { isRouteOnlyCustomers } from "@/lib/distribution-settings";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import { formatCustomerKes } from "@/components/customers/customer-form";
import { CustomerImportExport } from "@/components/customers/customer-import-export";
import {
  CatalogPageShell,
  ActiveSortChip,
  FilterSelect,
  FilterToolbar,
  IconButton,
  PaginationBar,
  PencilIcon,
  SearchInput,
  SortableColumnHeader,
  StatCard,
  TrashIcon,
  formatKesCompact,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { useListPageSize, useTableSort } from "@/lib/use-list-page-controls";
import {
  BatchActionBar,
  BatchDeleteButton,
  TableRowSelectCell,
  TableSelectAllHeader,
  runSequentialDeletes,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { customerExportColumnsFromVisibleIds } from "@/lib/catalog-list-export-columns";

const COLUMN_STORAGE_KEY = "centrix-erp-customers-visible-columns";
const SORT_STORAGE_KEY = "centrix-erp-customers-sort";

const CUSTOMER_COLUMNS = [
  {
    id: "customer_num",
    label: "Customer #",
    hint: "Auto-generated unique number that identifies this customer across sales and invoices.",
    defaultVisible: true,
    required: true,
    sortKey: "customer_num",
  },
  {
    id: "customer_name",
    label: "Name",
    hint: "Legal or trading name of the customer.",
    defaultVisible: true,
    required: true,
    sortKey: "customer_name",
  },
  {
    id: "customer_type",
    label: "Type",
    hint: "Debtor — credit account customer. Route — customer linked to a delivery/sales route.",
    defaultVisible: true,
    sortKey: "customer_type",
  },
  {
    id: "phone_number",
    label: "Phone",
    hint: "Primary contact phone number.",
    defaultVisible: true,
    sortKey: "phone_number",
  },
  {
    id: "additional_phone",
    label: "Alt. phone",
    hint: "Secondary or backup phone number.",
    defaultVisible: true,
  },
  {
    id: "town",
    label: "Town",
    hint: "Town or area where the customer is located.",
    defaultVisible: true,
    sortKey: "town",
  },
  {
    id: "route",
    label: "Route",
    hint: "Sales or delivery route assigned to this customer (route-type customers only).",
    defaultVisible: true,
  },
  {
    id: "credit_limit",
    label: "Credit limit",
    hint: "Maximum outstanding credit allowed for this customer, in KES.",
    defaultVisible: true,
    align: "right",
    sortKey: "credit_limit",
  },
  {
    id: "current_balance",
    label: "Balance",
    hint: "Current amount owed by the customer on credit (outstanding balance).",
    defaultVisible: true,
    align: "right",
    sortKey: "current_balance",
  },
  {
    id: "kra_pin",
    label: "KRA PIN",
    hint: "Kenya Revenue Authority PIN for tax invoicing.",
    defaultVisible: true,
  },
  {
    id: "terms_of_payment",
    label: "Payment terms",
    hint: "Agreed payment terms, e.g. Net 30, Cash on delivery.",
    defaultVisible: true,
  },
  {
    id: "created",
    label: "Created",
    hint: "User who created the record (top) and date it was created (bottom).",
    defaultVisible: false,
  },
  {
    id: "updated",
    label: "Updated",
    hint: "User who last updated the record (top) and date of last change (bottom).",
    defaultVisible: false,
  },
  {
    id: "actions",
    label: "Actions",
    hint: "Edit or delete this customer.",
    defaultVisible: true,
    required: true,
    align: "center",
  },
];

const REMOVED_COLUMN_IDS = new Set([
  "branch",
  "organization",
  "customer_status",
  "deleted_by",
  "deleted_at",
  "created_by",
  "created_at",
  "updated_at",
]);

const LEGACY_COLUMN_IDS = {
  created_by: "created",
  created_at: "created",
  updated_at: "updated",
};

function migrateColumnIds(ids) {
  if (!Array.isArray(ids)) return ids;
  const out = [];
  for (const id of ids) {
    if (REMOVED_COLUMN_IDS.has(id)) continue;
    const mapped = LEGACY_COLUMN_IDS[id] ?? id;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function defaultVisibleColumnIds() {
  return CUSTOMER_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
}

function normalizeColumnIds(ids) {
  const valid = new Set(CUSTOMER_COLUMNS.map((c) => c.id));
  const normalized = migrateColumnIds(ids ?? []).filter((id) => valid.has(id));
  for (const col of CUSTOMER_COLUMNS) {
    if (col.required && !normalized.includes(col.id)) normalized.push(col.id);
  }
  return normalized.length ? normalized : defaultVisibleColumnIds();
}

function readStoredColumnIds() {
  if (typeof window === "undefined") return defaultVisibleColumnIds();
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return defaultVisibleColumnIds();
    return normalizeColumnIds(JSON.parse(raw));
  } catch {
    return defaultVisibleColumnIds();
  }
}

function alignClass(align) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function formatKes(value) {
  return formatCustomerKes(value);
}

function enrichCustomer(customer, routeById, userById) {
  const route = routeById.get(customer.route_id);
  const creator = userById.get(customer.created_by);

  return {
    ...customer,
    route_name: route?.route_name ?? "—",
    created_by_name: creator?.username ?? creator?.full_name ?? "—",
    updated_by_name: "—",
  };
}

function UserDateCell({ name, date }) {
  return (
    <div>
      <p className="font-medium text-slate-800">{name || "—"}</p>
      <p className="text-xs text-slate-500">{formatShortDate(date)}</p>
    </div>
  );
}

function renderCell(colId, customer, handlers) {
  switch (colId) {
    case "customer_num":
      return <span className="font-mono text-slate-600">{customer.customer_num}</span>;
    case "customer_name":
      return (
        <Link
          href={`/customers/${customer.customer_num}`}
          className="font-medium text-[#185FA5] hover:text-[#144f8a] hover:underline"
        >
          {customer.customer_name}
        </Link>
      );
    case "customer_type":
      return <CustomerTypeBadge type={customer.customer_type} />;
    case "phone_number":
      return customer.phone_number || "—";
    case "additional_phone":
      return customer.additional_phone || "—";
    case "town":
      return customer.town || "—";
    case "route":
      return customer.route_name !== "—" ? (
        <RouteBadge name={customer.route_name} />
      ) : (
        <span className="text-slate-400">—</span>
      );
    case "credit_limit":
      return formatKes(customer.credit_limit);
    case "current_balance":
      return (
        <span
          className={
            Number(customer.current_balance ?? 0) > 0 ? "font-medium text-amber-700" : "text-slate-700"
          }
        >
          {formatKes(customer.current_balance)}
        </span>
      );
    case "kra_pin":
      return customer.kra_pin || "—";
    case "terms_of_payment":
      return customer.terms_of_payment || "—";
    case "created":
      return <UserDateCell name={customer.created_by_name} date={customer.created_at} />;
    case "updated":
      return <UserDateCell name={customer.updated_by_name} date={customer.updated_at} />;
    case "actions":
      return (
        <div className="flex justify-center gap-1">
          <IconButton label="View" onClick={() => handlers.onView(customer)}>
            <ViewIcon />
          </IconButton>
          <IconButton label="Statement" onClick={() => handlers.onStatement(customer)}>
            <StatementIcon />
          </IconButton>
          <IconButton label="Edit" onClick={() => handlers.onEdit(customer)}>
            <PencilIcon />
          </IconButton>
          <IconButton label="Delete" danger onClick={() => handlers.onDelete(customer)}>
            <TrashIcon />
          </IconButton>
        </div>
      );
    default:
      return "—";
  }
}

export default function CustomersPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { capabilities } = useAuth();
  const routeCustomersOnly = isRouteOnlyCustomers(capabilities);

  const [customers, setCustomers] = useState([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [customerStats, setCustomerStats] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const [deletedFilter, setDeletedFilter] = useState("active");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);
  const { sort, sortDir, sortActive, toggleSort, clearSort } = useTableSort(SORT_STORAGE_KEY);
  const [visibleColumnIds, setVisibleColumnIds] = useState(defaultVisibleColumnIds);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  useEffect(() => {
    setVisibleColumnIds(readStoredColumnIds());
  }, []);

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumnIds));
  }, [visibleColumnIds]);

  const visibleColumns = useMemo(
    () =>
      visibleColumnIds
        .map((id) => CUSTOMER_COLUMNS.find((c) => c.id === id))
        .filter(Boolean),
    [visibleColumnIds],
  );
  const exportColumns = useMemo(
    () => customerExportColumnsFromVisibleIds(visibleColumnIds),
    [visibleColumnIds],
  );

  const loadReferenceData = useCallback(async () => {
    try {
      const [routeRes, userRes, statsRes] = await Promise.all([
        apiRequest("/routes", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
        apiRequest("/customers/summary").catch(() => null),
      ]);
      setRoutes(routeRes.data ?? []);
      setUsers(userRes.data ?? []);
      if (statsRes) setCustomerStats(statsRes);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setListLoading(true);
    try {
      const status =
        deletedFilter === "deleted"
          ? "inactive"
          : deletedFilter === "all"
            ? "all"
            : "active";
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        sort,
        sortDir,
        extra: { status },
      });
      const custRes = await apiRequest("/customers", { searchParams });
      const parsed = parsePaginator(custRes);
      setCustomers(parsed.items);
      setTotalCustomers(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load customers");
    } finally {
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, deletedFilter, sort, sortDir]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadReferenceData(), loadCustomers()]);
  }, [loadReferenceData, loadCustomers]);

  const buildExportSearchParams = useCallback(() => {
    const status =
      deletedFilter === "deleted" ? "inactive" : deletedFilter === "all" ? "all" : "active";
    return buildPageParams({
      page: 1,
      perPage: 100,
      q: debouncedSearch,
      extra: { status },
    });
  }, [debouncedSearch, deletedFilter]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (loading) return;
    loadCustomers();
  }, [loading, loadCustomers]);

  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const enriched = useMemo(
    () => customers.map((c) => enrichCustomer(c, routeById, userById)),
    [customers, routeById, userById],
  );

  const stats = useMemo(
    () => ({
      active: customerStats?.active ?? totalCustomers,
      newThisMonth: customerStats?.new_this_month ?? 0,
      onRoutes: customerStats?.on_routes ?? 0,
      outstanding: customerStats?.outstanding_balance ?? 0,
    }),
    [customerStats, totalCustomers],
  );

  const safePage = Math.min(page, totalPages);
  const pageSlice = enriched;
  const pageRowIds = useMemo(() => pageSlice.map((c) => c.customer_num), [pageSlice]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, deletedFilter, pageSize, sort, sortDir]);

  const activeSortLabel = useMemo(() => {
    if (!sort) return null;
    const col = CUSTOMER_COLUMNS.find((c) => c.sortKey === sort);
    const dir = sortDir === "desc" ? "high to low" : "low to high";
    return col ? `${col.label} (${dir})` : null;
  }, [sort, sortDir]);

  function handleSort(columnId) {
    const col = CUSTOMER_COLUMNS.find((c) => c.id === columnId);
    if (!col?.sortKey) return;
    toggleSort(col.sortKey);
    setPage(1);
  }

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  function toggleColumn(id) {
    const col = CUSTOMER_COLUMNS.find((c) => c.id === id);
    if (!col || col.required) return;
    setVisibleColumnIds((prev) => {
      if (prev.includes(id)) {
        if (prev.filter((x) => x !== id).length < 1) return prev;
        return prev.filter((x) => x !== id);
      }
      const next = [...prev, id];
      return CUSTOMER_COLUMNS.filter((c) => next.includes(c.id)).map((c) => c.id);
    });
  }

  function resetColumns() {
    setVisibleColumnIds(defaultVisibleColumnIds());
  }

  async function deleteCustomer(customer) {
    const ok = await confirm({
      title: "Delete customer",
      message: `Delete customer "${customer.customer_name}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/customers/${customer.customer_num}`, { method: "DELETE" });
      await reloadAll();
      notifySuccess(`"${customer.customer_name}" deleted`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSelectedCustomers() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    const ok = await confirm({
      title: "Delete selected customers",
      message: `Delete ${ids.length} customer${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBatchDeleting(true);
    try {
      const byId = new Map(pageSlice.map((c) => [String(c.customer_num), c]));
      const { succeeded, failed } = await runSequentialDeletes({
        ids,
        deleteItem: async (customerNum) => {
          await apiRequest(`/customers/${customerNum}`, { method: "DELETE" });
        },
      });

      clearSelection();
      await reloadAll();

      if (failed.length === 0) {
        notifySuccess(
          `Deleted ${succeeded.length} customer${succeeded.length === 1 ? "" : "s"}`,
        );
      } else if (succeeded.length === 0) {
        notifyError(failed[0]?.message ?? "Delete failed");
      } else {
        const names = failed
          .slice(0, 3)
          .map((f) => byId.get(String(f.id))?.customer_name ?? f.id)
          .join(", ");
        notifyError(
          `Deleted ${succeeded.length}; ${failed.length} failed${names ? ` (${names})` : ""}`,
        );
      }
    } finally {
      setBatchDeleting(false);
    }
  }

  const handlers = {
    onView: (customer) => router.push(`/customers/${customer.customer_num}`),
    onEdit: (customer) => router.push(`/customers/${customer.customer_num}/edit`),
    onStatement: (customer) =>
      router.push(`/reports/customer-statement?customer=${customer.customer_num}`),
    onDelete: deleteCustomer,
  };

  return (
    <CatalogPageShell
      title="Customers"
      subtitle={
        routeCustomersOnly
          ? "Manage route customers assigned to delivery routes"
          : "Manage debtors and route customers"
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CustomerImportExport
            totalCount={totalCustomers}
            exportSearchParams={buildExportSearchParams}
            exportColumns={exportColumns}
            onImported={reloadAll}
          />
          <Link
            href="/reports/customer-statement"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <StatementIcon />
            Customer Statement
          </Link>
          <Link
            href="/customers/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
          >
            <PlusIcon />
            Add Customer
          </Link>
        </div>
      }
      banner={
        !loading ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active customers" value={stats.active.toLocaleString()} />
            <StatCard label="New this month" value={stats.newThisMonth.toLocaleString()} />
            <StatCard
              label="Outstanding balance"
              value={formatKesCompact(stats.outstanding)}
            />
            <StatCard label="On routes" value={stats.onRoutes.toLocaleString()} />
          </div>
        ) : null
      }
      toolbar={
        <FilterToolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer…"
          />
          <FilterSelect
            value={deletedFilter}
            onChange={(e) => setDeletedFilter(e.target.value)}
            options={[
              { value: "active", label: "Active customers" },
              { value: "deleted", label: "Deleted customers" },
              { value: "all", label: "All customers" },
            ]}
          />
          <ColumnPicker
            open={columnsOpen}
            onToggle={() => setColumnsOpen((v) => !v)}
            onClose={() => setColumnsOpen(false)}
            visibleColumnIds={visibleColumnIds}
            onToggleColumn={toggleColumn}
            onReset={resetColumns}
          />
        </FilterToolbar>
      }
    >
      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading customers…</p>
        ) : (
          <>
            {sortActive ? <ActiveSortChip label={activeSortLabel} onClear={() => { clearSort(); setPage(1); }} /> : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <TableSelectAllHeader
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected}
                      onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                    />
                    {visibleColumns.map((col) => (
                      <th
                        key={col.id}
                        title={col.hint}
                        className={`px-4 py-2.5 ${col.sortKey ? "" : "cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2"} ${alignClass(col.align)}`}
                      >
                        {col.sortKey ? (
                          <SortableColumnHeader
                            label={col.label}
                            columnId={col.sortKey}
                            sort={sort}
                            sortDir={sortDir}
                            onSort={() => handleSort(col.id)}
                            align={col.align}
                          />
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleColumns.length + 1}
                        className="px-4 py-12 text-center text-slate-500"
                      >
                        No customers found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((customer) => (
                      <tr
                        key={customer.customer_num}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <TableRowSelectCell
                          checked={selectedIds.has(String(customer.customer_num))}
                          onChange={() => toggleOne(customer.customer_num)}
                          label={`Select ${customer.customer_name}`}
                        />
                        {visibleColumns.map((col) => (
                          <td
                            key={col.id}
                            className={`px-4 py-3 text-slate-700 ${alignClass(col.align)}`}
                          >
                            {renderCell(col.id, customer, handlers)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={totalCustomers}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
            {listLoading ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Updating…</p>
            ) : null}
          </>
        )}
      </div>

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <BatchDeleteButton
          count={selectedCount}
          busy={batchDeleting}
          onClick={() => void deleteSelectedCustomers()}
        />
      </BatchActionBar>
    </CatalogPageShell>
  );
}

function ColumnPicker({ open, onToggle, onClose, visibleColumnIds, onToggleColumn, onReset }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <ColumnsIcon />
        Columns
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close column picker"
            onClick={onClose}
          />
          <div className="absolute right-0 z-20 mt-2 w-56 theme-panel rounded-xl border p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Show columns
              </p>
              <button
                type="button"
                onClick={onReset}
                className="text-xs font-medium text-[#185FA5] hover:text-[#144f8a]"
              >
                Reset
              </button>
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {CUSTOMER_COLUMNS.map((col) => {
                const checked = visibleColumnIds.includes(col.id);
                return (
                  <li key={col.id}>
                    <label
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        col.required
                          ? "cursor-not-allowed text-slate-400"
                          : "cursor-pointer hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={col.required}
                        onChange={() => onToggleColumn(col.id)}
                        className="rounded border-slate-300"
                      />
                      {col.label}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function CustomerTypeBadge({ type }) {
  const styles =
    type === "route"
      ? "bg-[#EEEDFE] text-[#3C3489]"
      : type === "regular"
        ? "bg-emerald-50 text-emerald-800"
        : "bg-[#E6F1FB] text-[#0C447C]";
  const label =
    type === "route" ? "Route" : type === "regular" ? "Regular" : type === "debtor" ? "Debtor" : type || "Debtor";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles}`}>
      {label}
    </span>
  );
}

function RouteBadge({ name }) {
  return (
    <span className="inline-flex rounded-full bg-[#E6F1FB] px-2.5 py-0.5 text-[11px] font-medium text-[#0C447C]">
      {name}
    </span>
  );
}

function ColumnsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
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

function StatementIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
