"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import { useListPageSize } from "@/lib/use-list-page-controls";
import {
  CatalogPageShell,
  FilterSelect,
  FilterToolbar,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryLink,
  TrashIcon,
  SearchInput,
  SECONDARY_BTN_CLASS,
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
import { supplierExportColumnsFromVisibleIds } from "@/lib/catalog-list-export-columns";
import { SupplierImportExport } from "@/components/suppliers/supplier-import-export";
import { OtherContactsModal } from "@/components/suppliers/other-contacts-modal";
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
import { useAuth } from "@/contexts/auth-context";
import { fetchUsersCached } from "@/lib/reference-data-cache";

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}


export default function SuppliersPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { user } = useAuth();

  const [dashboard, setDashboard] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [users, setUsers] = useState([]);
  const [contactsModal, setContactsModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);
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
        .map((id) => SUPPLIER_COLUMNS.find((c) => c.id === id))
        .filter(Boolean),
    [visibleColumnIds],
  );
  const exportColumns = useMemo(
    () => supplierExportColumnsFromVisibleIds(visibleColumnIds),
    [visibleColumnIds],
  );

  const loadReferenceData = useCallback(async () => {
    try {
      if (typeof window !== "undefined" && !sessionStorage.getItem("suppliers-balances-synced")) {
        try {
          await apiRequest("/suppliers/recalculate-balances", { method: "POST" });
          sessionStorage.setItem("suppliers-balances-synced", "1");
        } catch {
          /* non-blocking */
        }
      }
      const [dashRes, usersData] = await Promise.all([
        apiRequest("/suppliers/dashboard"),
        fetchUsersCached(user?.organization_id).catch(() => []),
      ]);
      setDashboard(dashRes);
      setUsers(usersData ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  const loadSuppliers = useCallback(async () => {
    setListLoading(true);
    try {
      const extra = {};
      if (statusFilter === "active") extra.is_active = 1;
      if (statusFilter === "inactive") extra.is_active = 0;

      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra,
      });
      const listRes = await apiRequest("/suppliers", { searchParams });
      const parsed = parsePaginator(listRes);
      setSuppliers(parsed.items);
      setTotalSuppliers(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load suppliers");
    } finally {
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  async function reloadAll() {
    await Promise.all([loadReferenceData(), loadSuppliers()]);
  }

  const buildExportSearchParams = useCallback(() => {
    const extra = {};
    if (statusFilter === "active") extra.is_active = 1;
    if (statusFilter === "inactive") extra.is_active = 0;
    return buildPageParams({
      page: 1,
      perPage: 200,
      q: debouncedSearch,
      extra,
    });
  }, [debouncedSearch, statusFilter]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const enriched = useMemo(
    () => suppliers.map((s) => enrichSupplier(s, userById)),
    [suppliers, userById],
  );
  const pageRowIds = useMemo(() => enriched.map((row) => row.id), [enriched]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

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
    const ok = await confirm({
      title: "Remove supplier",
      message: `Remove supplier "${row.supplier_name}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/suppliers/${row.id}`, { method: "DELETE" });
      await reloadAll();
      notifySuccess(`"${row.supplier_name}" removed`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSelectedSuppliers() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    const ok = await confirm({
      title: "Delete selected suppliers",
      message: `Remove ${ids.length} supplier${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBatchDeleting(true);
    try {
      const byId = new Map(enriched.map((row) => [String(row.id), row]));
      const { succeeded, failed } = await runSequentialDeletes({
        ids,
        deleteItem: async (id) => {
          await apiRequest(`/suppliers/${id}`, { method: "DELETE" });
        },
      });

      clearSelection();
      await reloadAll();

      if (failed.length === 0) {
        notifySuccess(
          `Removed ${succeeded.length} supplier${succeeded.length === 1 ? "" : "s"}`,
        );
      } else if (succeeded.length === 0) {
        notifyError(failed[0]?.message ?? "Delete failed");
      } else {
        const names = failed
          .slice(0, 3)
          .map((f) => byId.get(String(f.id))?.supplier_name ?? f.id)
          .join(", ");
        notifyError(
          `Removed ${succeeded.length}; ${failed.length} failed${names ? ` (${names})` : ""}`,
        );
      }
    } finally {
      setBatchDeleting(false);
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
        <IconButton
          label="Statement"
          onClick={() => router.push(`/reports/supplier-statement?supplier_id=${row.id}`)}
        >
          <StatementIcon />
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void reloadAll()}
            disabled={loading || listLoading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading || listLoading ? "Refreshing…" : "Refresh"}
          </button>
          <SupplierImportExport
            totalCount={totalSuppliers}
            exportSearchParams={buildExportSearchParams}
            exportColumns={exportColumns}
            onImported={reloadAll}
          />
          <PrimaryLink href="/suppliers/new" permission={P.purchasing.suppliers.create}>
            Add Supplier
          </PrimaryLink>
        </div>
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
        <FilterToolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier…"
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
        </FilterToolbar>
      }
    >
      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading suppliers…</p>
        ) : (
          <>
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
                      <th key={col.id} className={`px-4 py-2.5 ${alignClass(col.align)}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enriched.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleColumns.length + 1}
                        className="px-4 py-12 text-center text-slate-500"
                      >
                        No suppliers found.
                      </td>
                    </tr>
                  ) : (
                    enriched.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <TableRowSelectCell
                          checked={selectedIds.has(String(row.id))}
                          onChange={() => toggleOne(row.id)}
                          label={`Select ${row.supplier_name}`}
                        />
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
              page={page}
              totalPages={totalPages}
              total={totalSuppliers}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
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

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <BatchDeleteButton
          count={selectedCount}
          busy={batchDeleting}
          onClick={() => void deleteSelectedSuppliers()}
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
