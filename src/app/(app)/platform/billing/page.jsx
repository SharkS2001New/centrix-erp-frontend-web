"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { formatBillingMoney } from "@/lib/platform-billing";

export default function PlatformBillingPage() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/billing-overview");
      setOverview(res.data ?? null);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load billing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const catalogue = Array.isArray(overview?.catalogue) ? overview.catalogue : [];

  return (
    <CatalogPageShell
      title="Billing & plans"
      subtitle="Live subscription, plan, and Paybill counts. Prices stay on the plan records a platform administrator publishes."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Billing & plans" }]} />

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <Link className="font-medium text-[#185FA5] underline" href="/platform/self-serve-plans">Self-serve plans</Link>
        <Link className="font-medium text-[#185FA5] underline" href="/platform/billing/token-policy">Token & usage policies</Link>
        <Link className="font-medium text-[#185FA5] underline" href="/platform/licence-payments">Licence payments</Link>
        <Link className="font-medium text-[#185FA5] underline" href="/platform/subscriptions">Subscriptions</Link>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading billing…</p> : null}

      {overview ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Active subscriptions" value={overview.active_subscriptions} />
            <Stat label="Plans" value={overview.plans} />
            <Stat label="Organisations with tokens" value={overview.token_organisations} />
            <Stat label="Unmatched payments" value={overview.unmatched_payments} />
          </section>

          <section className="theme-panel mt-6 overflow-x-auto rounded-xl border shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">Catalogue</h2>
            {catalogue.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No plans yet. Publish them on Self-serve plans.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Plan</th>
                    <th className="px-5 py-3">Monthly</th>
                    <th className="px-5 py-3">Yearly</th>
                    <th className="px-5 py-3">Organisations</th>
                    <th className="px-5 py-3">Published</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogue.map((plan) => (
                    <tr key={plan.id} className="border-b border-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900">{plan.name}</td>
                      <td className="px-5 py-3">{plan.monthly_price != null ? formatBillingMoney(plan.monthly_price) : "—"}</td>
                      <td className="px-5 py-3">{plan.yearly_price != null ? formatBillingMoney(plan.yearly_price) : "—"}</td>
                      <td className="px-5 py-3">{plan.organisations}</td>
                      <td className="px-5 py-3">{plan.self_serve && plan.is_active ? "Self-serve" : plan.is_active ? "Active" : "Hidden"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </CatalogPageShell>
  );
}

function Stat({ label, value }) {
  return (
    <div className="theme-panel rounded-xl border px-5 py-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value ?? 0}</p>
    </div>
  );
}
