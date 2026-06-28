"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  FilterSelect,
  PaginationBar,
  PrimaryButton,
  SearchInput,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

const PAGE_SIZE = 25;

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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [kindFilter, setKindFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        apiRequest("/admin/system-issue-reports", {
          searchParams: buildPageParams({
            page,
            perPage: PAGE_SIZE,
            q: search,
            extra: {
              status: statusFilter,
              kind: kindFilter,
            },
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
  }, [page, search, statusFilter, kindFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, kindFilter]);

  async function openDetail(row) {
    try {
      const detail = await apiRequest(`/admin/system-issue-reports/${row.id}`);
      setSelected(detail);
      setResolutionNotes(detail.resolution_notes ?? "");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load issue details");
    }
  }

  async function updateStatus(status) {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await apiRequest(`/admin/system-issue-reports/${selected.id}`, {
        method: "PATCH",
        body: {
          status,
          resolution_notes: resolutionNotes.trim() || null,
        },
      });
      setSelected(updated);
      notifySuccess("Issue updated.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to update issue");
    } finally {
      setSaving(false);
    }
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
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Open</p>
            <p className="mt-1 text-2xl font-semibold text-red-700">{summary.open ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Acknowledged</p>
            <p className="mt-1 text-2xl font-semibold text-amber-700">{summary.acknowledged ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Today</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.today ?? 0}</p>
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
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading issues…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No system issues found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">{KIND_LABELS[row.kind] ?? row.kind}</td>
                  <td className="px-4 py-3">
                    {row.organization?.org_name ?? "—"}
                    {row.organization?.company_code ? (
                      <div className="text-xs text-slate-500">{row.organization.company_code}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{userLabel(row.user)}</td>
                  <td className="max-w-xs truncate px-4 py-3" title={row.message}>
                    {row.message}
                  </td>
                  <td className="px-4 py-3">{STATUS_LABELS[row.status] ?? row.status}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm font-medium text-[#185FA5] hover:underline"
                      onClick={() => openDetail(row)}
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

      <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {selected ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Issue details</h2>
                <p className="mt-1 font-mono text-xs text-slate-500">{selected.id}</p>
              </div>
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-slate-800"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-slate-500">Kind</dt>
                <dd>{KIND_LABELS[selected.kind] ?? selected.kind}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Status</dt>
                <dd>{STATUS_LABELS[selected.status] ?? selected.status}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Organization</dt>
                <dd>{selected.organization?.org_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">User</dt>
                <dd>{userLabel(selected.user)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase text-slate-500">Message</dt>
                <dd className="mt-1 rounded-lg border bg-slate-50 px-3 py-2">{selected.message}</dd>
              </div>
              {selected.user_notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-slate-500">User notes</dt>
                  <dd className="mt-1 rounded-lg border bg-amber-50 px-3 py-2 text-amber-950">
                    {selected.user_notes}
                  </dd>
                </div>
              ) : null}
              {selected.page_url ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-slate-500">Page</dt>
                  <dd className="break-all">{selected.page_url}</dd>
                </div>
              ) : null}
              {selected.api_path ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-slate-500">API</dt>
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
              <span className="mb-1 block font-medium text-slate-700">Resolution notes</span>
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
