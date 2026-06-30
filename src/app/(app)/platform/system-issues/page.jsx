"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  FilterSelect,
  PaginationBar,
  PrimaryButton,
  SearchInput,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";


const KIND_LABELS = {
  error: "Error",
  slow: "Slow",
  user_report: "User report",
};

const STATUS_LABELS = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

function userLabel(user) {
  if (!user) return "—";
  return user.full_name?.trim() || user.username || "—";
}

export default function PlatformSystemIssuesPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [kindFilter, setKindFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const extra = {
        status: statusFilter,
        kind: kindFilter,
      };
      if (priorityFilter === "high") extra.priority = "high";
      if (fromDate) extra.from_date = fromDate;
      if (toDate) extra.to_date = toDate;

      const [listRes, summaryRes] = await Promise.all([
        apiRequest("/admin/system-issue-reports", {
          searchParams: buildPageParams({
            page,
            perPage: pageSize,
            q: search,
            extra,
          }),
        }),
        apiRequest("/admin/system-issue-reports/summary", { loading: false }),
      ]);
      const parsed = parsePaginator(listRes);
      setRows(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
      setSummary(summaryRes);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load system issues");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, kindFilter, priorityFilter, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, kindFilter, priorityFilter, fromDate, toDate]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  async function openDetail(row) {
    try {
      const detail = await apiRequest(`/admin/system-issue-reports/${row.id}`);
      setSelected(detail);
      setResolutionNotes(detail.resolution_notes ?? "");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load issue details");
    }
  }

  async function patchIssue(id, body, { closeDetail = false } = {}) {
    setSaving(true);
    try {
      const updated = await apiRequest(`/admin/system-issue-reports/${id}`, {
        method: "PATCH",
        body,
      });
      if (closeDetail) {
        setSelected(updated);
      }
      notifySuccess(body.status === "resolved" ? "Issue marked resolved." : "Issue updated.");
      await load();
      return updated;
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to update issue");
      return null;
    } finally {
      setSaving(false);
      setResolvingId(null);
    }
  }

  async function updateStatus(status) {
    if (!selected) return;
    await patchIssue(
      selected.id,
      {
        status,
        resolution_notes: resolutionNotes.trim() || null,
      },
      { closeDetail: true },
    );
  }

  async function markResolvedQuick(row) {
    setResolvingId(row.id);
    await patchIssue(row.id, { status: "resolved" });
  }

  return (
    <CatalogPageShell
      title="System errors & reports"
      subtitle="Automatic error logs and user-reported slow modules from all tenant organizations."
    >
      <AdminBreadcrumb
        items={[{ label: "Platform", href: "/platform" }, { label: "System errors & reports" }]}
      />

      {summary ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
            <p className="theme-subtext text-xs uppercase tracking-wide">Open</p>
            <p className="mt-1 text-2xl font-semibold text-red-600 dark:text-red-400">{summary.open ?? 0}</p>
          </div>
          <div className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
            <p className="theme-subtext text-xs uppercase tracking-wide">Acknowledged</p>
            <p className="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">{summary.acknowledged ?? 0}</p>
          </div>
          <div className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
            <p className="theme-subtext text-xs uppercase tracking-wide">Resolved</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{summary.resolved ?? 0}</p>
          </div>
          <div className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
            <p className="theme-subtext text-xs uppercase tracking-wide">High priority</p>
            <p className="mt-1 text-2xl font-semibold text-orange-600 dark:text-orange-400">{summary.high_priority ?? 0}</p>
            <p className="theme-subtext mt-0.5 text-[11px]">Repetitive in last 7 days</p>
          </div>
          <div className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
            <p className="theme-subtext text-xs uppercase tracking-wide">Today</p>
            <p className="theme-heading mt-1 text-2xl font-semibold">{summary.today ?? 0}</p>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search message, API path, reference…"
        />
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "open", label: "Open" },
            { value: "acknowledged", label: "Acknowledged" },
            { value: "resolved", label: "Resolved" },
          ]}
        />
        <FilterSelect
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          options={[
            { value: "all", label: "All kinds" },
            { value: "error", label: "Errors" },
            { value: "slow", label: "Slow requests" },
            { value: "user_report", label: "User reports" },
          ]}
        />
        <FilterSelect
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          options={[
            { value: "all", label: "All priorities" },
            { value: "high", label: "High priority only" },
          ]}
        />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="theme-input rounded-lg border px-3 py-2 text-sm"
          aria-label="From date"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="theme-input rounded-lg border px-3 py-2 text-sm"
          aria-label="To date"
        />
      </div>

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="theme-table-head-row text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="theme-subtext px-4 py-8 text-center">
                  Loading issues…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="theme-subtext px-4 py-8 text-center">
                  No system issues found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={`theme-table-body-row ${row.is_high_priority ? "theme-legacy-archive-row" : ""}`}
                >
                  <td className="theme-text-muted px-4 py-3 whitespace-nowrap">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">{KIND_LABELS[row.kind] ?? row.kind}</td>
                  <td className="px-4 py-3">
                    {row.is_high_priority ? (
                      <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">
                        High · {row.occurrence_count ?? "?"}×
                      </span>
                    ) : (
                      <span className="theme-subtext text-xs">Normal</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.organization?.org_name ?? "—"}
                    {row.organization?.company_code ? (
                      <div className="theme-subtext text-xs">{row.organization.company_code}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{userLabel(row.user)}</td>
                  <td className="theme-text-muted max-w-xs truncate px-4 py-3" title={row.message}>
                    {row.message}
                  </td>
                  <td className="px-4 py-3">{STATUS_LABELS[row.status] ?? row.status}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="theme-link text-sm font-medium hover:underline"
                        onClick={() => openDetail(row)}
                      >
                        View
                      </button>
                      {row.status !== "resolved" ? (
                        <button
                          type="button"
                          className="text-sm font-medium text-emerald-600 hover:underline disabled:opacity-50 dark:text-emerald-400"
                          disabled={resolvingId === row.id || saving}
                          onClick={() => void markResolvedQuick(row)}
                        >
                          {resolvingId === row.id ? "Saving…" : "Resolve"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />

      {selected ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4">
          <div className="theme-modal max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="theme-heading text-lg font-semibold">Issue details</h2>
                <p className="theme-subtext mt-1 font-mono text-xs">{selected.id}</p>
                {selected.is_high_priority ? (
                  <p className="mt-2 inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">
                    High priority — repeated {selected.occurrence_count ?? "?"} times recently
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="theme-subtext text-sm hover:text-[var(--theme-text)]"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="theme-subtext text-xs uppercase">Kind</dt>
                <dd>{KIND_LABELS[selected.kind] ?? selected.kind}</dd>
              </div>
              <div>
                <dt className="theme-subtext text-xs uppercase">Status</dt>
                <dd>{STATUS_LABELS[selected.status] ?? selected.status}</dd>
              </div>
              <div>
                <dt className="theme-subtext text-xs uppercase">Organization</dt>
                <dd>{selected.organization?.org_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="theme-subtext text-xs uppercase">User</dt>
                <dd>{userLabel(selected.user)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="theme-subtext text-xs uppercase">Message</dt>
                <dd className="theme-panel mt-1 rounded-lg border px-3 py-2">{selected.message}</dd>
              </div>
              {selected.user_notes ? (
                <div className="sm:col-span-2">
                  <dt className="theme-subtext text-xs uppercase">User notes</dt>
                  <dd className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    {selected.user_notes}
                  </dd>
                </div>
              ) : null}
              {selected.page_url ? (
                <div className="sm:col-span-2">
                  <dt className="theme-subtext text-xs uppercase">Page</dt>
                  <dd className="break-all">{selected.page_url}</dd>
                </div>
              ) : null}
              {selected.api_path ? (
                <div className="sm:col-span-2">
                  <dt className="theme-subtext text-xs uppercase">API</dt>
                  <dd className="break-all">
                    {selected.http_method ? `${selected.http_method} ` : ""}
                    {selected.api_path}
                    {selected.http_status ? ` (${selected.http_status})` : ""}
                    {selected.duration_ms ? ` · ${selected.duration_ms} ms` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>

            {selected.context ? (
              <pre className="mt-4 max-h-48 overflow-auto rounded-lg border bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(selected.context, null, 2)}
              </pre>
            ) : null}

            <label className="mt-4 block text-sm">
              <span className="theme-heading mb-1 block font-medium">Resolution notes</span>
              <textarea
                className="theme-input w-full rounded-lg border px-3 py-2 text-sm"
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
              />
            </label>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <PrimaryButton
                type="button"
                showIcon={false}
                disabled={saving}
                className="!bg-amber-600 hover:!bg-amber-700"
                onClick={() => updateStatus("acknowledged")}
              >
                Acknowledge
              </PrimaryButton>
              <PrimaryButton
                type="button"
                showIcon={false}
                disabled={saving}
                onClick={() => updateStatus("resolved")}
              >
                Mark resolved
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
