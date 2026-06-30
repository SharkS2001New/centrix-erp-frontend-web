"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useAppRouter } from "@/lib/use-app-router";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  FilterSelect,
  FilterToolbar,
  PaginationBar,
  SearchInput,
  StatCard,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { LPO_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import {
  buildLpoListMenuItems,
  LpoListContextMenu,
  LpoListRowActions,
  useLpoListPermissions,
} from "@/components/lpo/lpo-list-actions";
import { runLpoPrintClick } from "@/components/lpo/lpo-order-print";
import { formatLpoKes, formatPoNumber, lpoDisplayNumber, lpoOrderDate, LpoStatusBadge } from "@/components/lpo/lpo-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";


function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function LpoListPage() {
  const router = useAppRouter();
  const confirm = useConfirm();
  const { user, capabilities, organization } = useAuth();
  const { canView, canCreate, canEdit, canDelete } = useLpoListPermissions();

  const [dashboard, setDashboard] = useState(null);
  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [suppliers, setSuppliers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [printingLpoNo, setPrintingLpoNo] = useState(null);
  const [deletingLpoNo, setDeletingLpoNo] = useState(null);

  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);

  const loadReferenceData = useCallback(async () => {
    try {
      const [dashRes, supRes, statusRes] = await Promise.all([
        apiRequest("/lpo-mst/dashboard"),
        apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
        apiRequest("/lpo-statuses", { searchParams: { per_page: 50 } }).catch(() => ({
          data: [],
        })),
      ]);
      setDashboard(dashRes);
      setSuppliers(supRes.data ?? []);
      setStatuses(statusRes.data ?? statusRes ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRows = useCallback(async () => {
    setListLoading(true);
    try {
      const extra = {};
      if (supplierFilter !== "all") extra.supplier_id = supplierFilter;
      if (statusFilter !== "all") extra.status_code = statusFilter;

      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra,
      });
      const listRes = await apiRequest("/lpo-mst", { searchParams });
      const parsed = parsePaginator(listRes);
      setRows(parsed.items);
      setTotalRows(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load purchase orders");
    } finally {
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, supplierFilter, statusFilter]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, supplierFilter, statusFilter]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...statuses.map((s) => ({
        value: String(s.status_code),
        label: s.status_name,
      })),
    ],
    [statuses],
  );

  function viewLpo(row) {
    if (!row?.lpo_no) return;
    router.push(`/lpo/${row.lpo_no}`);
  }

  function openLpoContextMenu(event, row) {
    event.preventDefault();
    setContextMenu({
      row,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function openActionsMenuFromButton(event, row) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      row,
      x: Math.max(8, rect.right - 240),
      y: rect.bottom + 4,
    });
  }

  async function printLpo(row, variant = "lpo") {
    if (!row?.lpo_no || !canView) return;
    setPrintingLpoNo(row.lpo_no);
    try {
      await runLpoPrintClick(row.lpo_no, {
        variant,
        user,
        capabilities,
        organization,
      });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setPrintingLpoNo(null);
    }
  }

  async function deleteLpo(row) {
    if (!row?.lpo_no || !canDelete || !row.can_delete) return;
    const ok = await confirm({
      title: "Delete purchase order",
      message: "Delete this purchase order? This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingLpoNo(row.lpo_no);
    try {
      await apiRequest(`/lpo-mst/${row.lpo_no}`, { method: "DELETE" });
      setContextMenu(null);
      await loadRows();
      notifySuccess("Purchase order deleted");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setDeletingLpoNo(null);
    }
  }

  const contextMenuItems = useMemo(() => {
    if (!contextMenu?.row) return [];
    const row = contextMenu.row;
    return buildLpoListMenuItems({
      row,
      canView,
      canEdit,
      canDelete,
      busy: deletingLpoNo === row.lpo_no,
      onView: () => {
        setContextMenu(null);
        viewLpo(row);
      },
      onPrintLpo: () => {
        setContextMenu(null);
        printLpo(row, "lpo");
      },
      onPrintDeliveryNote: () => {
        setContextMenu(null);
        printLpo(row, "delivery_note");
      },
      onEdit: () => {
        setContextMenu(null);
        router.push(`/lpo/${row.lpo_no}/edit`);
      },
      onDelete: () => {
        setContextMenu(null);
        deleteLpo(row);
      },
    });
  }, [contextMenu, canView, canEdit, canDelete, deletingLpoNo, router, user, capabilities, organization]);

  return (
    <CatalogPageShell
      navigationReady={!loading}
      title="Purchase orders (LPO)"
      subtitle="Procure from suppliers — links to supplier accounts payable and stock receipt"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Purchase orders"
            filename="lpo"
            apiPath="/lpo-mst"
            columns={LPO_EXPORT_COLUMNS}
            totalCount={totalRows}
            getSearchParams={() => {
              const extra = {};
              if (supplierFilter !== "all") extra.supplier_id = supplierFilter;
              if (statusFilter !== "all") extra.status_code = statusFilter;
              return buildPageParams({ page: 1, perPage: 200, q: debouncedSearch, extra });
            }}
            disabled={loading}
          />
          {canCreate ? (
            <Link
              href="/lpo/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
            >
              <PlusIcon />
              New purchase order
            </Link>
          ) : null}
        </div>
      }
      toolbar={
        <FilterToolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO #, supplier, reference…"
          />
          <FilterSelect
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            options={[
              { value: "all", label: "All suppliers" },
              ...suppliers.map((s) => ({
                value: String(s.id),
                label: s.supplier_name,
              })),
            ]}
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={statusOptions}
          />
        </FilterToolbar>
      }
    >
      {dashboard && !loading && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="POs this month" value={String(dashboard.total_pos ?? 0)} />
          <StatCard label="Total value" value={formatLpoKes(dashboard.total_value)} />
          <StatCard label="Pending" value={String(dashboard.pending_count ?? 0)} />
          <StatCard
            label="Cleared / partial"
            value={`${dashboard.cleared_count ?? 0} / ${dashboard.partially_received_count ?? 0}`}
          />
        </div>
      )}

      {loading ? (
        <div className="theme-panel theme-table-shell min-h-[280px] rounded-xl shadow-sm" aria-hidden />
      ) : (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-4 py-2.5">PO #</th>
                    <th className="px-4 py-2.5">Supplier</th>
                    <th className="px-4 py-2.5">Created</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        No purchase orders found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.lpo_no}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                        onContextMenu={(event) => openLpoContextMenu(event, row)}
                        title="Right-click for actions"
                      >
                        <td className="px-4 py-3 font-mono font-medium text-[#185FA5]">
                          <Link href={`/lpo/${row.lpo_no}`} className="hover:underline">
                            {lpoDisplayNumber(row)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/suppliers/${row.supplier_id}`}
                            className="font-medium text-slate-800 hover:text-[#185FA5]"
                          >
                            {row.supplier_name ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div className="font-medium text-slate-800">
                            {row.created_by_name ?? "—"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.order_date ? formatShortDate(row.order_date) : "—"}
                          </div>
                          {Number(row.amount_paid) > 0 ? (
                            <div className="mt-1 space-y-0.5 text-xs">
                              <div className="text-emerald-700">
                                Paid {formatLpoKes(row.amount_paid)}
                              </div>
                              <div className="text-amber-700">
                                Bal {formatLpoKes(row.balance_due)}
                              </div>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {formatLpoKes(row.net_amount ?? row.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-700">
                          {formatLpoKes(row.balance_due)}
                        </td>
                        <td className="px-4 py-3">
                          <LpoStatusBadge
                            statusName={row.status_name}
                            clearedFlag={row.cleared_flag}
                            statusCode={row.lpo_status_code}
                            paymentStatus={row.payment_status}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {canView ? (
                            <LpoListRowActions
                              row={row}
                              busy={deletingLpoNo === row.lpo_no}
                              printing={printingLpoNo === row.lpo_no}
                              onView={() => viewLpo(row)}
                              onPrintLpo={() => printLpo(row, "lpo")}
                              onOpenMenu={(event) => openActionsMenuFromButton(event, row)}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              totalPages={totalPages}
              total={totalRows}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
            <LpoListContextMenu
              open={Boolean(contextMenu)}
              x={contextMenu?.x ?? 0}
              y={contextMenu?.y ?? 0}
              items={contextMenuItems}
              onClose={() => setContextMenu(null)}
            />
        </div>
      )}
    </CatalogPageShell>
  );
}
