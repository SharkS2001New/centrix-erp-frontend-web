"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import { useAuth } from "@/contexts/auth-context";
import { Field, PaginationBar, PrimaryLink, inputClassName } from "@/components/catalog/catalog-shared";
import { P } from "@/lib/permission-codes";
import {
  defaultDateRange,
  formatReceiptDate,
  groupStockReceipts,
  InventoryPageShell,
  InventoryTableShell,
  receiptDetailHref,
  rowInDateRange,
} from "@/components/inventory/inventory-shared";

const PAGE_SIZE = 15;

export default function StockReceiptsPage() {
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;
  const initialRange = defaultDateRange(7);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const all = await fetchAllPaginatedRowsSmart("/stock-receipts", {
        "filter[branch_id]": branchId,
      });
      setRows(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock receipts");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => rows.filter((row) => rowInDateRange(row, fromDate, toDate, ["created_at"])),
    [rows, fromDate, toDate],
  );

  const grouped = useMemo(() => groupStockReceipts(filtered), [filtered]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = grouped.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate]);

  return (
    <InventoryPageShell
      title="Stock receipts"
      subtitle="Goods received from suppliers into your stock"
      action={
        <PrimaryLink href="/inventory/receipts/receive" permission={P.inventory.receipts.view}>
          Receive stock
        </PrimaryLink>
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
          {grouped.length} receipt{grouped.length === 1 ? "" : "s"} in range
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

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
                  {pageSlice.map((group) => (
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
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={grouped.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </InventoryTableShell>
    </InventoryPageShell>
  );
}
