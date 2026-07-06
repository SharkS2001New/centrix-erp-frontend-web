"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PaginationBar, PrimaryLink, inputClassName } from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { P } from "@/lib/permission-codes";
import {
  defaultDateRange,
  formatReceiptDate,
  groupStockReceipts,
  InventoryPageShell,
  InventoryTableShell,
  receiptDetailHref,
} from "@/components/inventory/inventory-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { STOCK_RECEIPT_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";


export default function StockReceiptsPage() {
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;
  const initialRange = defaultDateRange(7);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);

  const loadRows = useCallback(async () => {
    setListLoading(true);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        filters: { branch_id: branchId },
        extra: { from_date: fromDate, to_date: toDate },
      });
      const res = await apiRequest("/stock-receipts", { searchParams });
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load stock receipts");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [branchId, fromDate, toDate, page, pageSize]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, pageSize]);

  const grouped = useMemo(() => groupStockReceipts(rows), [rows]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  return (
    <InventoryPageShell
      title="Stock receipts"
      subtitle="Goods received from suppliers into your stock"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Stock receipts"
            apiPath="/stock-receipts"
            columns={STOCK_RECEIPT_EXPORT_COLUMNS}
            totalCount={total}
            getSearchParams={() => ({
              per_page: 200,
              "filter[branch_id]": branchId,
              from_date: fromDate,
              to_date: toDate,
            })}
            disabled={loading}
          />
          <PrimaryLink href="/inventory/receipts/receive" permission={P.inventory.receipts.view}>
            Receive stock
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
          {grouped.length} receipt{grouped.length === 1 ? "" : "s"} on this page · {total} line{total === 1 ? "" : "s"} in range
        </p>
      </div>

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading receipts…</p>
        ) : grouped.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No stock receipts in this date range.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Receipt no</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium text-right">Items</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((group) => (
                    <tr key={group.ref} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        <Link
                          href={receiptDetailHref(group.ref)}
                          className="font-mono font-medium text-[#185FA5] hover:underline"
                        >
                          {group.receipt_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatReceiptDate(group.date)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{group.line_count}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">
                        {group.stock_location === "mixed"
                          ? "Shop & store"
                          : group.stock_location ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Completed
                        </span>
                      </td>
                    </tr>
                  ))}
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
