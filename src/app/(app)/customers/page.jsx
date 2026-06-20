"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { formatCustomerKes } from "@/components/customers/customer-form";
import {
  CatalogPageShell,
  FilterSelect,
  IconButton,
  PaginationBar,
  PencilIcon,
  SearchInput,
  StatCard,
  TrashIcon,
  formatKesCompact,
  formatShortDate,
  isSameCalendarMonth,
} from "@/components/catalog/catalog-shared";

const PAGE_SIZE = 10;
const COLUMN_STORAGE_KEY = "centrix-erp-customers-visible-columns";

const CUSTOMER_COLUMNS = [
  {
    id: "customer_num",
    label: "Customer #",
    hint: "Auto-generated unique number that identifies this customer across sales and invoices.",
    defaultVisible: true,
    required: true,
  },
  {
    id: "customer_name",
    label: "Name",
    hint: "Legal or trading name of the customer.",
    defaultVisible: true,
    required: true,
  },
  {
    id: "customer_type",
    label: "Type",
    hint: "Debtor — credit account customer. Route — customer linked to a delivery/sales route.",
    defaultVisible: true,
  },
  {
    id: "phone_number",
    label: "Phone",
    hint: "Primary contact phone number.",
    defaultVisible: true,
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
  },
  {
    id: "current_balance",
    label: "Balance",
    hint: "Current amount owed by the customer on credit (outstanding balance).",
    defaultVisible: true,
    align: "right",
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

  const [customers, setCustomers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [deletedFilter, setDeletedFilter] = useState("active");
  const [page, setPage] = useState(1);
  const [visibleColumnIds, setVisibleColumnIds] = useState(defaultVisibleColumnIds);
  const [columnsOpen, setColumnsOpen] = useState(false);

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

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [custRes, routeRes, userRes] = await Promise.all([
        apiRequest("/customers", { searchParams: { per_page: 200 } }),
        apiRequest("/routes", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
      ]);
      setCustomers(custRes.data ?? []);
      setRoutes(routeRes.data ?? []);
      setUsers(userRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const enriched = useMemo(
    () => customers.map((c) => enrichCustomer(c, routeById, userById)),
    [customers, routeById, userById],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const active = enriched.filter((c) => !c.deleted_at);
    const newThisMonth = active.filter((c) =>
      c.created_at ? isSameCalendarMonth(new Date(c.created_at), now) : false,
    );
    const onRoutes = active.filter((c) => c.route_id != null);
    const outstanding = active.reduce((sum, c) => sum + Number(c.current_balance ?? 0), 0);
    return {
      active: active.length,
      newThisMonth: newThisMonth.length,
      onRoutes: onRoutes.length,
      outstanding,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (deletedFilter === "active") {
      list = list.filter((c) => !c.deleted_at);
    } else if (deletedFilter === "deleted") {
      list = list.filter((c) => c.deleted_at);
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const haystack = [
        c.customer_num,
        c.customer_name,
        c.customer_type,
        c.phone_number,
        c.additional_phone,
        c.town,
        c.route_name,
        c.kra_pin,
        c.terms_of_payment,
        c.created_by_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [enriched, search, deletedFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, deletedFilter]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

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
    if (!window.confirm(`Delete customer "${customer.customer_name}"?`)) return;
    try {
      await apiRequest(`/customers/${customer.customer_num}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
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
      subtitle="Manage debtors and route customers"
      action={
        <div className="flex flex-wrap items-center gap-2">
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
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer…"
            className="max-w-md"
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
        </div>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading customers…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    {visibleColumns.map((col) => (
                      <th
                        key={col.id}
                        title={col.hint}
                        className={`cursor-help px-4 py-2.5 underline decoration-dotted decoration-slate-300 underline-offset-2 ${alignClass(col.align)}`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleColumns.length}
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
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>
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
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
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
