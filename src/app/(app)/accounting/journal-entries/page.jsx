"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import { useListPageSize } from "@/lib/use-list-page-controls";
import {
  CatalogPageShell,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { JOURNAL_ENTRY_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { JournalStatusBadge } from "@/components/accounting/accounting-shared";


export default function JournalEntriesPage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);

  const load = useCallback(async () => {
    setListLoading(true);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
      });
      const res = await apiRequest("/journal-entries", { searchParams });
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotalRows(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load journal entries");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  return (
    <CatalogPageShell
      title="Journal Entries"
      subtitle="Accounting > Journal Entries"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Journal entries"
            filename="journal-entries"
            apiPath="/journal-entries"
            columns={JOURNAL_ENTRY_EXPORT_COLUMNS}
            totalCount={totalRows}
            getSearchParams={() =>
              buildPageParams({ page: 1, perPage: 200, q: debouncedSearch })
            }
            disabled={loading || listLoading}
          />
          <PrimaryLink href="/accounting/journal-entries/new">New Entry</PrimaryLink>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference or description…"
        />
      </div>

      <div className={`theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm ${loading || listLoading ? "opacity-60" : ""}`}>
        <table className="min-w-full text-sm">
          <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {loading ? "Loading…" : "No journal entries yet."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="theme-table-body-row">
                  <td className="px-4 py-3 font-mono font-medium text-slate-900">{row.entry_number}</td>
                  <td className="px-4 py-3">{formatShortDate(row.entry_date)}</td>
                  <td className="px-4 py-3 text-slate-700">{row.description ?? "—"}</td>
                  <td className="px-4 py-3">
                    <JournalStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => router.push(`/accounting/journal-entries/${row.id}`)}
                      className="text-[#185FA5] hover:underline"
                    >
                      View
                    </button>
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
    </CatalogPageShell>
  );
}
