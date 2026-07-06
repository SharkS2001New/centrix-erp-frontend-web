"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryLink,
  TrashIcon,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { P } from "@/lib/permission-codes";
import {
  defaultDateRange,
  formatStockQty,
  buildUomById,
  uomForInventoryRow,
  InventoryPageShell,
  InventoryTableShell,
  productDisplayName,
} from "@/components/inventory/inventory-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { DAMAGE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { EditDamageDrawer } from "@/components/inventory/edit-damage-drawer";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";


export default function DamagesPage() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;
  const initialRange = defaultDateRange(7);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);
  const [deletingId, setDeletingId] = useState(null);
  const [editingDamage, setEditingDamage] = useState(null);

  const loadReferenceData = useCallback(async () => {
    try {
      const [prodRes, uomRes] = await Promise.all([
        apiRequest("/products", { searchParams: { per_page: 500 } }),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      ]);
      setProducts(prodRes.data ?? []);
      setUoms(uomRes.data ?? []);
    } catch {
      /* non-blocking */
    }
  }, []);

  const loadRows = useCallback(async () => {
    setListLoading(true);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        filters: { branch_id: branchId },
        extra: { from_date: fromDate, to_date: toDate },
      });
      const res = await apiRequest("/damages", { searchParams });
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load damages");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [branchId, fromDate, toDate, page, pageSize]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const uomById = useMemo(() => buildUomById(uoms), [uoms]);

  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, pageSize]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  async function deleteDamage(row) {
    const label = productDisplayName(row, productByCode);
    const qtyLabel = formatStockQty(
      row.quantity,
      uomForInventoryRow(row, uomById),
    );
    const ok = await confirm({
      title: "Delete damage record",
      message: `Delete this damage record for ${label} and restore ${qtyLabel} to ${row.stock_location ?? "shop"} stock?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setDeletingId(row.id);
    try {
      await apiRequest(`/damages/${row.id}`, { method: "DELETE" });
      await loadRows();
      notifySuccess("Damage record deleted and stock restored");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to delete damage");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <InventoryPageShell
      title="Damages"
      subtitle="Stock written off due to damage, expiry, or loss"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Damages"
            apiPath="/damages"
            columns={DAMAGE_EXPORT_COLUMNS}
            totalCount={total}
            getSearchParams={() => ({
              per_page: 200,
              "filter[branch_id]": branchId,
              from_date: fromDate,
              to_date: toDate,
            })}
            disabled={loading}
          />
          <PrimaryLink href="/inventory/damages/new" permission={P.inventory.damages.view}>
            Record damage
          </PrimaryLink>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From">
          <input
            type="date"
            className={inputClassName()}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            className={inputClassName()}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </Field>
        <p className="pb-2 text-xs text-slate-500">
          {total} record{total === 1 ? "" : "s"} in range
        </p>
      </div>

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading damages…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No damages in this date range.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      return (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-600">
                            {row.created_at
                              ? formatShortDate(String(row.created_at).slice(0, 10))
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-900">
                              {productDisplayName(row, productByCode)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-700">
                            −{formatStockQty(
                              row.quantity,
                              uomForInventoryRow(row, uomById),
                            )}
                          </td>
                          <td className="px-4 py-3 capitalize text-slate-600">
                            {row.stock_location ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.reason ?? "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-1">
                              <IconButton
                                label="Edit damage"
                                onClick={() => setEditingDamage(row)}
                              >
                                <PencilIcon />
                              </IconButton>
                              <IconButton
                                label="Delete and restore stock"
                                onClick={() => deleteDamage(row)}
                                disabled={deletingId === row.id}
                              >
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
            {listLoading ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Refreshing…</p>
            ) : null}
            <PaginationBar
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )}
      </InventoryTableShell>

      <EditDamageDrawer
        open={Boolean(editingDamage)}
        damage={editingDamage}
        products={products}
        uoms={uoms}
        onClose={() => setEditingDamage(null)}
        onSaved={loadRows}
      />
    </InventoryPageShell>
  );
}
