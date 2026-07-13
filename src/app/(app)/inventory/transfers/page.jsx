"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchProductCatalogCached } from "@/lib/catalog-cache";
import { useOrgFormat } from "@/lib/org-format";
import {
  CatalogPageShell,
  Field,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { useAuth } from "@/contexts/auth-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import {
  buildUomByProductCode,
  defaultDateRange,
  formatStockQty,
  uomForInventoryRow,
} from "@/components/inventory/inventory-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { STOCK_TRANSFER_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { parsePaginator } from "@/lib/paginated-api";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { P } from "@/lib/permission-codes";

export default function InventoryTransfersPage() {
  const { date } = useOrgFormat();
  const { capabilities, user } = useAuth();
  const showInterBranch = isMultiBranchCatalog(capabilities);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);
  const initialRange = defaultDateRange(30);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, catalogProducts, uomRes] = await Promise.all([
        apiRequest("/reports/stock-transfers", {
          searchParams: {
            from_date: fromDate,
            to_date: toDate,
            per_page: pageSize,
            page,
            ...(appliedSearch.trim() ? { q: appliedSearch.trim() } : {}),
          },
        }),
        fetchProductCatalogCached(user?.organization_id, { status: "all" }),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      ]);
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
      setProducts(catalogProducts ?? []);
      setUoms(uomRes.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load transfers");
      setRows([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, page, pageSize, appliedSearch, user?.organization_id]);

  const uomByProduct = useMemo(() => buildUomByProductCode(products, uoms), [products, uoms]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, pageSize, appliedSearch]);

  function applySearch() {
    setPage(1);
    setAppliedSearch(search.trim());
  }

  return (
    <CatalogPageShell
      title="Stock transfers"
      subtitle="History of shop ↔ store transfers"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogListExport
            title="Stock transfers"
            filename="stock-transfers"
            apiPath="/reports/stock-transfers"
            columns={STOCK_TRANSFER_EXPORT_COLUMNS}
            totalCount={total}
            getSearchParams={() => ({
              per_page: 200,
              from_date: fromDate,
              to_date: toDate,
              ...(appliedSearch.trim() ? { q: appliedSearch.trim() } : {}),
            })}
            disabled={loading}
          />
          <PrimaryLink href="/inventory/transfers/new" permission={P.inventory.transfers.create} showIcon={false}>
            New transfer
          </PrimaryLink>
          {showInterBranch ? (
            <>
              <PrimaryLink
                href="/inventory/branch-transfers/new"
                permission={P.inventory.transfers.create}
                showIcon={false}
              >
                Inter-branch
              </PrimaryLink>
              <PrimaryLink
                href="/reports/branch-stock-transfers"
                permission={P.reports.hub.view}
                showIcon={false}
              >
                Inter-branch report
              </PrimaryLink>
            </>
          ) : null}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From">
          <input type="date" className={inputClassName()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputClassName()} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Product…"
        />
        <button type="button" onClick={applySearch} className={SECONDARY_BTN_CLASS}>
          Search
        </button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3 text-right">Qty moved</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No transfers in this period.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.transfer_date}-${r.product_code}-${i}`} className="border-t border-slate-100">
                  <td className="px-4 py-3">{date(r.transfer_date)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{r.product_name ?? r.product_code}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{r.product_code}</span>
                  </td>
                  <td className="px-4 py-3 capitalize">{r.from_location}</td>
                  <td className="px-4 py-3 capitalize">{r.to_location}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatStockQty(
                      r.total_moved,
                      uomForInventoryRow(r, null, uomByProduct),
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </CatalogPageShell>
  );
}
