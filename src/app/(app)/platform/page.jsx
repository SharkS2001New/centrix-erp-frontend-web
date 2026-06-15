"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";

export default function PlatformOverviewPage() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/admin/organizations");
      setOrganizations(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <CatalogPageShell
      title="Platform administration"
      subtitle="Create and manage tenant organizations. Each organization gets its own manager account."
      action={
        <Link href="/admin/organizations/new">
          <PrimaryButton type="button">Provision organization</PrimaryButton>
        </Link>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform" }]} />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Tenant organizations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Organizations you have provisioned. Managers sign in with their company code and credentials.
          </p>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading organizations…</p>
        ) : organizations.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No tenant organizations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Company code</th>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Profile</th>
                  <th className="px-5 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td className="px-5 py-3 font-mono text-xs">{org.company_code}</td>
                    <td className="px-5 py-3">{org.org_name}</td>
                    <td className="px-5 py-3 text-slate-600">{org.deployment_profile ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CatalogPageShell>
  );
}
