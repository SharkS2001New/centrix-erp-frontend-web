"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { filterByOrganization, formatAuditValues, orgListParams } from "@/lib/admin";
import {
  actionBadgeClass,
  actionLabel,
  defaultAuditDateRange,
  summarizeAuditEntry,
  tableLabel,
} from "@/lib/audit";
import {
  CatalogPageShell,
  DetailDrawer,
  FilterSelect,
  PaginationBar,
  SearchInput,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";

const PAGE_SIZE = 25;

function ActionBadge({ action }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${actionBadgeClass(action)}`}
    >
      {actionLabel(action)}
    </span>
  );
}

export default function AdminAuditPage() {
  const { user, capabilities, isOrgWide } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const branchLocked = !isOrgWide();

  const defaults = useMemo(() => defaultAuditDateRange(), []);

  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState(
    branchLocked && user?.branch_id ? String(user.branch_id) : "all",
  );
  const [actionFilter, setActionFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (branchLocked && user?.branch_id) {
      setBranchFilter(String(user.branch_id));
    }
  }, [branchLocked, user?.branch_id]);

  const loadReferenceData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const params = { per_page: 200, ...orgListParams(organizationId) };
      const [userRes, branchRes] = await Promise.all([
        apiRequest("/users", { searchParams: params }),
        apiRequest("/branches", { searchParams: params }),
      ]);
      setUsers(filterByOrganization(userRes.data, organizationId));
      setBranches(filterByOrganization(branchRes.data, organizationId));
    } catch {
      setUsers([]);
      setBranches([]);
    }
  }, [organizationId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = {
        per_page: PAGE_SIZE,
        page,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      };
      if (userFilter !== "all") searchParams["filter[user_id]"] = userFilter;
      if (branchFilter !== "all") searchParams["filter[branch_id]"] = branchFilter;
      if (actionFilter !== "all") searchParams["filter[action]"] = actionFilter;
      if (moduleFilter !== "all") searchParams["filter[table_name]"] = moduleFilter;
      if (search.trim()) searchParams.q = search.trim();

      const res = await apiRequest("/audit-logs", { searchParams });
      setLogs(res.data ?? []);
      setMeta({
        current_page: res.current_page ?? page,
        last_page: res.last_page ?? 1,
        total: res.total ?? 0,
        per_page: res.per_page ?? PAGE_SIZE,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load audit trail");
      setLogs([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [page, fromDate, toDate, userFilter, branchFilter, actionFilter, moduleFilter, search]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, userFilter, branchFilter, actionFilter, moduleFilter, search]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  const modules = useMemo(() => {
    const set = new Set(logs.map((l) => l.table_name).filter(Boolean));
    return [...set].sort();
  }, [logs]);

  const actionOptions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action).filter(Boolean));
    return [...set].sort();
  }, [logs]);

  function resetFilters() {
    setSearch("");
    setUserFilter("all");
    setActionFilter("all");
    setModuleFilter("all");
    setFromDate(defaults.from);
    setToDate(defaults.to);
    if (!branchLocked) setBranchFilter("all");
  }

  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? 0;

  return (
    <CatalogPageShell
      title="Audit trail"
      subtitle="System-generated log of creates, updates, and deletes across modules."
    >
      <AdminBreadcrumb items={[{ label: "Administration", href: "/admin" }, { label: "Audit trail" }]} />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search module, record, action, IP…"
          />
        </div>
        <label className="block text-xs font-medium text-slate-500">
          From
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={`mt-1 ${inputClassName}`}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          To
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={`mt-1 ${inputClassName}`}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          User
          <FilterSelect
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            options={[
              { value: "all", label: "All users" },
              ...users.map((u) => ({ value: String(u.id), label: u.full_name ?? u.username })),
            ]}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Branch
          <FilterSelect
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            disabled={branchLocked}
            options={[
              { value: "all", label: "All branches" },
              ...branches.map((b) => ({ value: String(b.id), label: b.branch_name ?? b.branch_code })),
            ]}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Action
          <FilterSelect
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            options={[
              { value: "all", label: "All actions" },
              ...["create", "update", "delete"].map((a) => ({ value: a, label: actionLabel(a) })),
              ...actionOptions
                .filter((a) => !["create", "update", "delete"].includes(a))
                .map((a) => ({ value: a, label: actionLabel(a) })),
            ]}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Module
          <FilterSelect
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            options={[
              { value: "all", label: "All modules" },
              ...modules.map((m) => ({ value: m, label: tableLabel(m) })),
            ]}
          />
        </label>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Reset
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Loading audit entries…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No audit entries match your filters. Changes to records are logged automatically when users
                    create, update, or delete data.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="cursor-pointer hover:bg-slate-50/80"
                    onClick={() => setSelected(log)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatShortDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {userById.get(log.user_id)?.full_name ?? `User #${log.user_id}`}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {branchById.get(log.branch_id)?.branch_name ?? (log.branch_id ? `#${log.branch_id}` : "—")}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{tableLabel(log.table_name)}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-600">{summarizeAuditEntry(log)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && total > 0 ? (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        ) : null}
      </div>

      <DetailDrawer
        title="Audit entry"
        subtitle={selected ? `#${selected.id}` : undefined}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        wide
      >
        {selected ? (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs uppercase text-slate-500">User</dt>
                <dd className="text-slate-900">
                  {userById.get(selected.user_id)?.full_name ?? `User #${selected.user_id}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Action</dt>
                <dd>
                  <ActionBadge action={selected.action} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Module</dt>
                <dd className="text-slate-900">{tableLabel(selected.table_name)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Record</dt>
                <dd className="font-mono text-slate-900">{selected.record_id ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Branch</dt>
                <dd className="text-slate-900">
                  {branchById.get(selected.branch_id)?.branch_name ?? (selected.branch_id ? `#${selected.branch_id}` : "—")}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">IP address</dt>
                <dd className="font-mono text-slate-900">{selected.ip_address ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs uppercase text-slate-500">Timestamp</dt>
                <dd className="text-slate-900">
                  {selected.created_at
                    ? new Date(selected.created_at).toLocaleString("en-KE")
                    : "—"}
                </dd>
              </div>
              {selected.user_agent ? (
                <div className="col-span-2">
                  <dt className="text-xs uppercase text-slate-500">User agent</dt>
                  <dd className="break-all text-xs text-slate-700">{selected.user_agent}</dd>
                </div>
              ) : null}
            </dl>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Previous values</p>
              <pre className="max-h-52 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {formatAuditValues(selected.old_values)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">New values</p>
              <pre className="max-h-52 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {formatAuditValues(selected.new_values)}
              </pre>
            </div>
          </div>
        ) : null}
      </DetailDrawer>
    </CatalogPageShell>
  );
}
