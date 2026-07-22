"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import {
  Field,
  PaginationBar,
  PrimaryLink,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { P } from "@/lib/permission-codes";
import {
  defaultDateRange,
  formatMovementDateTime,
  formatStockQty,
  buildUomById,
  uomForInventoryRow,
  InventoryPageShell,
  InventoryTableShell,
  movementLocationLabel,
  productDisplayName,
} from "@/components/inventory/inventory-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { STOCK_MOVEMENT_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";


export function InventoryAdjustmentsScreen() {
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;
  const initialRange = defaultDateRange(30);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);

  const loadReferenceData = useCallback(async () => {
    try {
      const uomsData = await fetchUomsCached(user?.organization_id);
      setUoms(uomsData ?? []);
    } catch {
      /* non-blocking */
    }
  }, [user?.organization_id]);

  const loadRows = useCallback(async () => {
    setListLoading(true);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        filters: {
          branch_id: branchId,
          transaction_type: "ADJUSTMENT",
          reference_type: "adjustment",
        },
        extra: {
          from_date: fromDate,
          to_date: toDate,
        },
      });
      const res = await apiRequest("/inventory-transactions", { searchParams });
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load adjustments");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [branchId, fromDate, toDate, page, pageSize]);

  useTabAwareDataLoad(loadReferenceData);

  useTabAwareDataLoad(loadRows);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, pageSize]);

  const uomById = useMemo(() => buildUomById(uoms), [uoms]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  return (
    <InventoryPageShell
      title="Stock adjustments"
      subtitle="Manual increases and decreases to shop or store stock"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadRows()}
            disabled={loading || listLoading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading || listLoading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogListExport
            title="Stock adjustments"
            filename="stock-adjustments"
            apiPath="/inventory-transactions"
            columns={STOCK_MOVEMENT_EXPORT_COLUMNS}
            totalCount={total}
            getSearchParams={() => ({
              per_page: 200,
              "filter[branch_id]": branchId,
              "filter[transaction_type]": "ADJUSTMENT",
              "filter[reference_type]": "adjustment",
              from_date: fromDate,
              to_date: toDate,
            })}
            disabled={loading}
          />
          <PrimaryLink href="/inventory/adjustments/new" permission={P.inventory.adjustments.create}>
            Adjust stock
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
          {total} adjustment{total === 1 ? "" : "s"} in range
        </p>
      </div>

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading adjustments…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Change</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium text-right">Before</th>
                    <th className="px-4 py-3 font-medium text-right">After</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No adjustments in this date range.{" "}
                        <Link href="/inventory/adjustments/new" className="text-[#185FA5] hover:underline">
                          Record one
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const change = Number(row.quantity_change ?? 0);
                      const uom = uomForInventoryRow(row, uomById);
                      return (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-600">
                            {row.created_at ? formatMovementDateTime(row.created_at) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-900">
                              {productDisplayName(row)}
                            </span>
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-medium ${
                              change > 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {change > 0 ? "+" : "−"}
                            {formatStockQty(Math.abs(change), uom)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {movementLocationLabel(row)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {formatStockQty(row.quantity_before, uom)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                            {formatStockQty(row.quantity_after, uom)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.notes ?? "—"}</td>
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
    </InventoryPageShell>
  );
}
