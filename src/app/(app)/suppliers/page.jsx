"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  FilterSelect,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryLink,
  TrashIcon,
  SearchInput,
  StatCard,
  formatKesCompact,
} from "@/components/catalog/catalog-shared";
import { P } from "@/lib/permission-codes";
import {
  COLUMN_STORAGE_KEY,
  SUPPLIER_COLUMNS,
  alignClass,
  defaultVisibleColumnIds,
  enrichSupplier,
  normalizeColumnIds,
  readStoredColumnIds,
  renderSupplierCell,
} from "@/components/suppliers/suppliers-columns";
import { OtherContactsModal } from "@/components/suppliers/other-contacts-modal";

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

const PAGE_SIZE = 10;

export default function SuppliersPage() {
  const router = useRouter();

  const [dashboard, setDashboard] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [users, setUsers] = useState([]);
  const [contactsModal, setContactsModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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
        .map((id) => SUPPLIER_COLUMNS.find((c) => c.id === id))
        .filter(Boolean),
    [visibleColumnIds],
  );

  const loadData = useCallback(async () => {
    setError(null);
    try {
      if (typeof window !== "undefined" && !sessionStorage.getItem("suppliers-balances-synced")) {
        try {
          await apiRequest("/suppliers/recalculate-balances", { method: "POST" });
          sessionStorage.setItem("suppliers-balances-synced", "1");
        } catch {
          /* non-blocking */
        }
      }
      const [dashRes, listRes, userRes] = await Promise.all([
        apiRequest("/suppliers/dashboard"),
        apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
      ]);
      setDashboard(dashRes);
      setSuppliers(listRes.data ?? []);
      setUsers(userRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const enriched = useMemo(
    () => suppliers.map((s) => enrichSupplier(s, userById)),
    [suppliers, userById],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((s) => {
      if (statusFilter === "active" && s.is_active === false) return false;
      if (statusFilter === "inactive" && s.is_active !== false) return false;
      if (!q) return true;
      const hay = [
        s.supplier_name,
        s.contact_person,
        s.phone,
        s.alternate_phone,
        s.email,
        s.town,
        s.tax_pin,
        s.address,
        s.created_by_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [enriched, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function toggleColumn(id) {
    const col = SUPPLIER_COLUMNS.find((c) => c.id === id);
    if (!col || col.required) return;
    setVisibleColumnIds((prev) => {
      if (prev.includes(id)) {
        if (prev.filter((x) => x !== id).length < 1) return prev;
        return prev.filter((x) => x !== id);
      }
      const next = [...prev, id];
      return SUPPLIER_COLUMNS.filter((c) => next.includes(c.id)).map((c) => c.id);
    });
  }

  async function deleteSupplier(row) {
    if (!window.confirm(`Remove supplier "${row.supplier_name}"?`)) return;
    try {
      await apiRequest(`/suppliers/${row.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  const cellHandlers = {
    onOpenOtherContacts: (row) =>
      setContactsModal({
        supplierName: row.supplier_name,
        contacts: row.contacts,
      }),
    renderActions: (row) => (
      <div className="flex justify-center gap-1">
        <IconButton label="View" onClick={() => router.push(`/suppliers/${row.id}`)}>
          <ViewIcon />
        </IconButton>
        <IconButton label="Edit" onClick={() => router.push(`/suppliers/${row.id}/edit`)}>
          <PencilIcon />
        </IconButton>
        <IconButton label="Delete" danger onClick={() => deleteSupplier(row)}>
          <TrashIcon />
        </IconButton>
      </div>
    ),
  };

  return (
    <CatalogPageShell
      title="Suppliers"
      subtitle="Supplier accounts and amount owing from purchases"
      action={
        <PrimaryLink href="/suppliers/new" permission={P.purchasing.suppliers.create}>
          Add Supplier
        </PrimaryLink>
      }
      banner={
        !loading && dashboard ? (
          <>
            <p className="mb-3 text-sm font-medium text-slate-600">Suppliers Dashboard</p>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <StatCard label="Suppliers" value={String(dashboard.total ?? 0)} />
              <StatCard label="Active" value={String(dashboard.active ?? 0)} />
              <StatCard
                label="Amount owing"
                value={formatKesCompact(
                  dashboard.amount_owing ?? dashboard.credit_due ?? 0,
                )}
                hint="Total payable to suppliers (from LPOs minus payments)"
              />
            </div>
          </>
        ) : null
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier…"
            className="max-w-md"
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <ColumnPicker
            open={columnsOpen}
            onToggle={() => setColumnsOpen((v) => !v)}
            onClose={() => setColumnsOpen(false)}
            visibleColumnIds={visibleColumnIds}
            onToggleColumn={toggleColumn}
            onReset={() => setVisibleColumnIds(normalizeColumnIds(defaultVisibleColumnIds()))}
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
          <p className="p-8 text-sm text-slate-500">Loading suppliers…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    {visibleColumns.map((col) => (
                      <th key={col.id} className={`px-4 py-2.5 ${alignClass(col.align)}`}>
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
                        No suppliers found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        {visibleColumns.map((col) => (
                          <td
                            key={col.id}
                            className={`px-4 py-3 text-slate-700 ${alignClass(col.align)}`}
                          >
                            {renderSupplierCell(col.id, row, cellHandlers)}
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

      <OtherContactsModal
        supplierName={contactsModal?.supplierName}
        contacts={contactsModal?.contacts}
        open={contactsModal != null}
        onClose={() => setContactsModal(null)}
      />
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
              {SUPPLIER_COLUMNS.map((col) => {
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

function ViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
