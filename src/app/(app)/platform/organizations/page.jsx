"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";

export default function PlatformOrganizationsPage() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/organizations");
      setOrganizations(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <CatalogPageShell
      title="Tenant organizations"
      subtitle="Registered organizations. Managers sign in with their company code and credentials."
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
          <Link href="/platform/organizations/new">
            <PrimaryButton type="button">Register organization</PrimaryButton>
          </Link>
        </div>
      }
    >
      <AdminBreadcrumb
        items={[{ label: "Platform", href: "/platform" }, { label: "Tenant organizations" }]}
      />

      <div className="theme-panel rounded-xl border shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">All tenants</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use Manage to configure sales behaviour, ERP modules, and users. Organization settings cover
            platform provisioning and workflows.
          </p>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading organizations…</p>
        ) : organizations.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">
            No tenant organizations yet.{" "}
            <Link href="/platform/organizations/new" className="font-medium text-[#185FA5] hover:underline">
              Register one
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Company code</th>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Industry</th>
                  <th className="px-5 py-3">Setup type</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Administration</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td className="px-5 py-3 font-mono text-xs">{org.company_code}</td>
                    <td className="px-5 py-3">{org.org_name}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {org.industry_label ??
                        (org.industry === "hospitality" ? "Hotel & Hospitality" : "Retail & Distribution")}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{org.deployment_profile ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {org.is_active === false ? (
                        <span className="text-amber-700">Disabled</span>
                      ) : (
                        <span className="text-emerald-700">Active</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {org.administration_enabled === false ? (
                        <span className="text-amber-800">Platform-managed</span>
                      ) : (
                        <span className="text-slate-600">Tenant</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Link
                          href={`/platform/organizations/${org.id}`}
                          className="text-sm font-medium text-[#185FA5] hover:underline"
                        >
                          Manage organization
                        </Link>
                        <Link
                          href={`/platform/organizations/${org.id}/settings`}
                          className="text-xs font-medium text-slate-600 hover:underline"
                        >
                          Organization settings
                        </Link>
                      </div>
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
