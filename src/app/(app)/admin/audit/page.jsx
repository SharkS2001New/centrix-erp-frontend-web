"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { formatAuditValues } from "@/lib/admin";
import {
  CatalogPageShell,
  DetailDrawer,
  FilterSelect,
  IconButton,
  TrashIcon,
  formatShortDate,
} from "@/components/catalog/catalog-shared";

export default function AdminAuditPage() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userFilter, setUserFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logRes, userRes] = await Promise.all([
        apiRequest("/audit-logs", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
      ]);
      setLogs(logRes.data ?? []);
      setUsers(userRes.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load audit trail");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const modules = useMemo(() => {
    const set = new Set(logs.map((l) => l.table_name).filter(Boolean));
    return [...set].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (userFilter !== "all" && String(log.user_id) !== userFilter) return false;
      if (moduleFilter !== "all" && log.table_name !== moduleFilter) return false;
      return true;
    });
  }, [logs, userFilter, moduleFilter]);

  async function removeLog(log) {
    if (!window.confirm("Delete this audit entry? This cannot be undone.")) return;
    try {
      await apiRequest(`/audit-logs/${log.id}`, { method: "DELETE" });
      if (selected?.id === log.id) setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete audit entry");
    }
  }

  function detailSummary(log) {
    const oldV = log.old_values;
    const newV = log.new_values;
    if (newV && typeof newV === "object") {
      const keys = Object.keys(newV);
      if (keys.length === 1) return `${keys[0]} updated`;
    }
    return `${log.action ?? "Change"} on ${log.table_name ?? "record"}`;
  }

  return (
    <CatalogPageShell title="Audit trail" subtitle="Read-only log of system activity and changes.">
      <AdminBreadcrumb items={[{ label: "Administration", href: "/admin" }, { label: "Audit trail" }]} />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-4">
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
          Module
          <FilterSelect
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            options={[
              { value: "all", label: "All modules" },
              ...modules.map((m) => ({ value: m, label: m })),
            ]}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No audit entries found.
                </td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr
                  key={log.id}
                  className="cursor-pointer hover:bg-slate-50/80"
                  onClick={() => setSelected(log)}
                >
                  <td className="px-4 py-3 text-slate-600">
                    {formatShortDate(log.created_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {userById.get(log.user_id)?.full_name ?? `User #${log.user_id}`}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">{log.action ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{log.table_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{detailSummary(log)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <IconButton label="Delete" danger onClick={() => removeLog(log)}>
                      <TrashIcon />
                    </IconButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DetailDrawer
        title="Audit entry"
        subtitle={selected ? `#${selected.id}` : undefined}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        wide
        footer={
          selected ? (
            <button
              type="button"
              onClick={() => removeLog(selected)}
              className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete entry
            </button>
          ) : null
        }
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
                <dd className="capitalize text-slate-900">{selected.action ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Module</dt>
                <dd className="text-slate-900">{selected.table_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Record</dt>
                <dd className="text-slate-900">#{selected.record_id ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs uppercase text-slate-500">Timestamp</dt>
                <dd className="text-slate-900">
                  {selected.created_at
                    ? new Date(selected.created_at).toLocaleString("en-KE")
                    : "—"}
                </dd>
              </div>
            </dl>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Old value</p>
              <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {formatAuditValues(selected.old_values)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">New value</p>
              <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {formatAuditValues(selected.new_values)}
              </pre>
            </div>
          </div>
        ) : null}
      </DetailDrawer>
    </CatalogPageShell>
  );
}
