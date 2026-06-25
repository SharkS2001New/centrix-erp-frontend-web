"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { formatAppDateTime } from "@/lib/datetime";

function formatTime(iso) {
  return formatAppDateTime(iso);
}

function ApplicationBadge({ label }) {
  if (!label) return <span className="text-slate-400">—</span>;

  return (
    <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
      {label}
    </span>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}

function OrganizationActiveUsersCard({ group, onRefresh }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const org = group.organization;
  const sessions = group.sessions ?? [];

  async function endSession(sessionId) {
    setBusyId(sessionId);
    setError(null);
    try {
      await apiRequest(`/admin/active-sessions/${sessionId}`, { method: "DELETE" });
      await onRefresh?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not end session.");
    } finally {
      setBusyId(null);
    }
  }

  async function disableUser(sessionId) {
    if (!window.confirm("Disable this user's login and end all their sessions?")) return;
    setBusyId(`disable-${sessionId}`);
    setError(null);
    try {
      await apiRequest(`/admin/active-sessions/${sessionId}/disable-user`, { method: "POST" });
      await onRefresh?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not disable user.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
      <div className="flex items-center gap-2 bg-amber-400 px-4 py-3 text-white">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <h2 className="text-sm font-semibold">
          {org.org_name}{" "}
          <span className="font-normal opacity-90">
            · Active users ({sessions.length})
          </span>
        </h2>
        <span className="ml-auto font-mono text-xs opacity-90">{org.company_code}</span>
      </div>

      {error ? (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">Computer ID</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-4 py-3">Session started</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((session) => (
              <tr key={session.id} className="theme-table-body-row">
                <td className="px-4 py-3 font-semibold text-slate-900">{session.username}</td>
                <td className="px-4 py-3">
                  <ApplicationBadge label={session.active_workspace_label} />
                </td>
                <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-slate-600" title={session.computer_id}>
                  {session.computer_id}
                </td>
                <td className="px-4 py-3 text-slate-700">{formatTime(session.last_active_at)}</td>
                <td className="px-4 py-3 text-slate-700">{formatTime(session.session_started_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      title="Sign out this device"
                      disabled={busyId !== null}
                      onClick={() => void endSession(session.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <LogoutIcon />
                    </button>
                    <button
                      type="button"
                      title="Disable user login"
                      disabled={busyId !== null}
                      onClick={() => void disableUser(session.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <BlockIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-right">
        <Link
          href={`/platform/organizations/${org.id}`}
          className="text-xs font-medium text-[#185FA5] hover:underline"
        >
          Manage organization
        </Link>
      </div>
    </section>
  );
}

export default function PlatformActiveUsersPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/admin/active-sessions");
      setGroups(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load active sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const totalSessions = groups.reduce((sum, g) => sum + (g.sessions?.length ?? 0), 0);

  return (
    <CatalogPageShell
      title="Active users"
      subtitle="Live sign-ins across all tenant organizations, grouped by organization."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Active users" }]} />

      {error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {loading && groups.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Loading active sessions…</p>
      ) : null}

      {!loading && groups.length === 0 && !error ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No active user sessions right now.
        </p>
      ) : null}

      {groups.length > 0 ? (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-slate-600">
            {totalSessions} active session{totalSessions === 1 ? "" : "s"} across {groups.length} organization
            {groups.length === 1 ? "" : "s"}. Refreshes every 30 seconds.
          </p>
          {groups.map((group) => (
            <OrganizationActiveUsersCard key={group.organization.id} group={group} onRefresh={load} />
          ))}
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
