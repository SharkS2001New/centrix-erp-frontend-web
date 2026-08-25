"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { isPlatformInvestorsEnabled } from "@/lib/platform-org-features";
import { P } from "@/lib/permission-codes";
import { notifyError } from "@/lib/notify";
import {
  CatalogPageShell,
  SearchInput,
  SECONDARY_BTN_CLASS,
  formatKesCompact,
} from "@/components/catalog/catalog-shared";
import { useListUrlSearch } from "@/lib/use-list-url-search";

export function InvestorsReportsScreen() {
  const { capabilities, hasPermission } = useAuth();
  const enabled = isPlatformInvestorsEnabled(capabilities);
  const canView =
    enabled &&
    (hasPermission?.(P.investors.reports.view) || hasPermission?.(P.investors.investors.view));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();

  const loadData = useCallback(async () => {
    if (!canView) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("/investors", {
        searchParams: buildPageParams({ page: 1, perPage: 100, q: debouncedSearch }),
      });
      setRows(parsePaginator(res).items);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load investors");
    } finally {
      setLoading(false);
    }
  }, [canView, debouncedSearch]);

  useTabAwareDataLoad(loadData);

  return (
    <CatalogPageShell
      title="Investor reports"
      subtitle="Open an investor to run sales, stock balance, and money-flow reports"
      action={
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          onClick={() => void loadData()}
          disabled={loading || !canView}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      {!enabled ? (
        <p className="mb-4 text-sm text-amber-800">Investors are disabled for this organization.</p>
      ) : !canView ? (
        <p className="mb-4 text-sm text-slate-600">You do not have permission to view investor reports.</p>
      ) : (
        <>
          <div className="mb-4 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search investors…"
            />
          </div>
          <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            {loading ? (
              <p className="p-8 text-sm text-slate-500">Loading…</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-4 py-2.5">Investor</th>
                    <th className="px-4 py-2.5 text-right">Stock value</th>
                    <th className="px-4 py-2.5 text-right">Cash pool</th>
                    <th className="px-4 py-2.5">Reports</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                        No investors found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="theme-table-row border-t border-slate-100">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{row.investor_name}</div>
                          <div className="font-mono text-xs text-slate-500">{row.investor_code}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatKesCompact(row.summary?.stock_value ?? 0)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatKesCompact(row.summary?.cash_pool_balance ?? 0)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/investors/${row.id}?tab=reports`}
                            className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
                          >
                            Open reports
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </CatalogPageShell>
  );
}
