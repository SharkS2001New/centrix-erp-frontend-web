"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchProductsByCodesCached } from "@/lib/catalog-cache";
import { fetchUomsCached } from "@/lib/reference-data-cache";
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
import {
  TRANSFER_FROM_OPTIONS,
  TRANSFER_TO_OPTIONS,
} from "@/lib/inventory-transfer-routes";
import { parsePaginator } from "@/lib/paginated-api";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { P } from "@/lib/permission-codes";

function transferLocationLabel(value) {
  const key = String(value ?? "").trim();
  if (!key) return "—";
  return (
    TRANSFER_FROM_OPTIONS.find((o) => o.value === key)?.label ??
    TRANSFER_TO_OPTIONS.find((o) => o.value === key)?.label ??
    key.replace(/_/g, " ")
  );
}

function TransferReasonModal({ open, row, onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted || !row) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-reason-title"
        className="theme-modal w-full max-w-md rounded-xl border p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="transfer-reason-title" className="theme-heading text-[15px] font-medium">
          Transfer reason
        </h2>
        <p className="theme-subtext mt-1 text-xs">
          {transferLocationLabel(row.from_location)} → {transferLocationLabel(row.to_location)}
          {row.product_name || row.product_code
            ? ` · ${row.product_name ?? row.product_code}`
            : ""}
        </p>
        <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-800">
          {String(row.notes ?? "").trim() || "No reason recorded."}
        </p>
        <div className="mt-4 flex justify-end border-t border-[var(--theme-border)] pt-3">
          <button type="button" onClick={onClose} className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

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
  const [reasonRow, setReasonRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, uomRows] = await Promise.all([
        apiRequest("/reports/stock-transfers", {
          searchParams: {
            from_date: fromDate,
            to_date: toDate,
            per_page: pageSize,
            page,
            ...(appliedSearch.trim() ? { q: appliedSearch.trim() } : {}),
          },
        }),
        fetchUomsCached(user?.organization_id),
      ]);
      const parsed = parsePaginator(res);
      const items = parsed.items;
      setRows(items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
      setUoms(uomRows ?? []);

      const codes = items.map((row) => row.product_code).filter(Boolean);
      const catalogProducts = await fetchProductsByCodesCached(user?.organization_id, codes, {
        status: "all",
      });
      setProducts(catalogProducts ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load transfers");
      setRows([]);
      setTotal(0);
      setTotalPages(1);
      setProducts([]);
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
      subtitle="History of shop ↔ store moves and outbound transfers (donations, internal use, and more)"
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

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="px-1 py-3 pr-4">Date</th>
              <th className="px-1 py-3 pr-4">Product</th>
              <th className="px-1 py-3 pr-4">From</th>
              <th className="px-1 py-3 pr-4">To</th>
              <th className="px-1 py-3 text-right">Qty moved</th>
              <th className="px-1 py-3 pr-4">Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-1 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-1 py-8 text-center text-slate-500">
                  No transfers in this period.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const reason = String(r.notes ?? "").trim();
                return (
                  <tr
                    key={r.movement_id ?? `${r.transfer_date}-${r.product_code}-${r.to_location}-${i}`}
                    className="border-b border-slate-100"
                  >
                    <td className="px-1 py-3 pr-4">{date(r.transfer_date)}</td>
                    <td className="px-1 py-3 pr-4">
                      <span className="font-medium">{r.product_name ?? r.product_code}</span>
                      <span className="ml-2 font-mono text-xs text-slate-500">{r.product_code}</span>
                    </td>
                    <td className="px-1 py-3 pr-4">{transferLocationLabel(r.from_location)}</td>
                    <td className="px-1 py-3 pr-4">{transferLocationLabel(r.to_location)}</td>
                    <td className="px-1 py-3 text-right tabular-nums">
                      {formatStockQty(
                        r.total_moved,
                        uomForInventoryRow(r, null, uomByProduct),
                      )}
                    </td>
                    <td className="px-1 py-3 pr-4">
                      {reason ? (
                        <button
                          type="button"
                          onClick={() => setReasonRow(r)}
                          className="text-xs font-medium text-[var(--theme-primary)] hover:underline"
                        >
                          View reason
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
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

      <TransferReasonModal open={Boolean(reasonRow)} row={reasonRow} onClose={() => setReasonRow(null)} />
    </CatalogPageShell>
  );
}
