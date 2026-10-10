"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, StatCard } from "@/components/catalog/catalog-shared";
import { formatBillingMoney } from "@/lib/platform-billing";

const ACTIONS = [
  {
    href: "/platform/self-serve-plans",
    title: "Self-serve plans",
    detail: "Prices an organisation can choose and pay",
  },
  {
    href: "/platform/billing/token-policy",
    title: "Token & usage policies",
    detail: "Pack size, sale cost, and low-balance notices",
  },
  {
    href: "/platform/licence-payments",
    title: "Licence payments",
    detail: "Centrix Paybill receipts and how each one applied",
  },
  {
    href: "/platform/subscriptions",
    title: "Subscriptions",
    detail: "Who is on which plan, and when it ends",
  },
];

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
      subtitle="Subscription, plan, and Paybill counts. Prices stay on the plan a platform administrator publishes."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Billing & plans" }]} />

      <nav className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Billing tools">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="theme-secondary-btn flex min-h-[4.5rem] flex-col items-start rounded-xl px-4 py-3 text-left shadow-sm"
          >
            <span className="text-sm font-semibold">{action.title}</span>
            <span className="theme-subtext mt-1 text-xs font-normal leading-5">{action.detail}</span>
          </Link>
        ))}
      </nav>

      {loading ? <p className="theme-subtext text-sm">Loading billing…</p> : null}

      {overview ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active subscriptions" value={overview.active_subscriptions ?? 0} hint="Active and trial" />
            <StatCard label="Plans" value={overview.plans ?? 0} hint="Published in the catalogue" />
            <StatCard label="Organisations with tokens" value={overview.token_organisations ?? 0} hint="Balance above zero" />
            <StatCard label="Unmatched payments" value={overview.unmatched_payments ?? 0} hint="Paybill receipts still open" />
          </section>

          <section className="theme-panel mt-6 overflow-hidden rounded-xl border shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] px-5 py-4">
              <div>
                <h2 className="theme-heading text-sm font-semibold">Catalogue</h2>
                <p className="theme-subtext mt-0.5 text-xs">Monthly and yearly prices organisations see when they subscribe.</p>
              </div>
              <Link href="/platform/self-serve-plans" className="theme-primary-btn rounded-lg px-3 py-1.5 text-sm font-medium">
                Edit plans
              </Link>
            </div>
            {catalogue.length === 0 ? (
              <p className="theme-subtext px-5 py-10 text-center text-sm">No plans yet. Publish them on Self-serve plans.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="theme-table min-w-full text-sm">
                  <thead>
                    <tr className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide">
                      <th className="px-5 py-3">Plan</th>
                      <th className="px-5 py-3">Monthly</th>
                      <th className="px-5 py-3">Yearly</th>
                      <th className="px-5 py-3">Organisations</th>
                      <th className="px-5 py-3">Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogue.map((plan) => (
                      <tr key={plan.id} className="theme-table-body-row">
                        <td className="theme-heading px-5 py-3 font-medium">{plan.name}</td>
                        <td className="px-5 py-3">{plan.monthly_price != null ? formatBillingMoney(plan.monthly_price) : "—"}</td>
                        <td className="px-5 py-3">{plan.yearly_price != null ? formatBillingMoney(plan.yearly_price) : "—"}</td>
                        <td className="px-5 py-3 tabular-nums">{plan.organisations}</td>
                        <td className="px-5 py-3">
                          <PublishPill plan={plan} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </CatalogPageShell>
  );
}

function PublishPill({ plan }) {
  const selfServe = Boolean(plan.self_serve && plan.is_active);
  const active = Boolean(plan.is_active);
  const label = selfServe ? "Self-serve" : active ? "Active" : "Hidden";
  const tone = selfServe
    ? "bg-[var(--theme-primary-subtle)] text-[var(--theme-primary)]"
    : active
      ? "bg-[var(--theme-surface-subtle)] text-[var(--theme-text)]"
      : "bg-[var(--theme-surface-subtle)] text-[var(--theme-text-subtle)]";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}
