"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { formatBillingDate, formatBillingMoney, planModuleLabels } from "@/lib/platform-billing";
import { licenseAccessMode, rememberLicenceReturn } from "@/lib/organization-license";

function money(amount, currency = "KES") {
  if (amount == null || amount === "") return "Price not published";
  return formatBillingMoney(amount, currency);
}

export default function OrganizationBillingPage() {
  const { organizationLicense } = useAuth();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("/erp/organization/billing");
      setPayload(res.data ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load billing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const license = payload?.license ?? organizationLicense;
  const mode = licenseAccessMode(license);
  const policy = payload?.policy ?? {};
  const plans = Array.isArray(payload?.plans) ? payload.plans : [];
  const monthlyPlans = plans.filter((plan) => Number(plan.monthly_price) > 0);
  const annualPlans = plans.filter((plan) => Number(plan.yearly_price) > 0);
  const subscription = payload?.subscription;
  const usage = payload?.usage ?? { users: 0, branches: 0 };
  const invoices = Array.isArray(payload?.invoices) ? payload.invoices : [];
  const payments = Array.isArray(payload?.payments) ? payload.payments : [];
  const tokenBalance = Number(license?.token_balance ?? 0);
  const seatLimit = Number(subscription?.seat_limit) > 0 ? Number(subscription.seat_limit) : null;
  const activeModel =
    mode === "token" ? "token" : subscription?.interval === "yearly" ? "annual" : mode === "full" || mode === "trial" ? "monthly" : null;
  const features = subscription?.plan_name
    ? (plans.find((plan) => plan.name === subscription.plan_name)?.features ?? [])
    : [];
  const modules = planModuleLabels(subscription?.modules ?? license?.modules ?? []);

  return (
    <CatalogPageShell
      title="Billing & subscription"
      subtitle="Choose how this organisation pays for Centrix. Prices come from the plans and token policy a platform administrator has published."
    >
      {loading ? <p className="text-sm text-slate-500">Loading billing…</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-3">
            <ModelCard
              title="Token"
              active={activeModel === "token"}
              price={money(policy.token_pack_price_kes)}
              period={`${Number(policy.token_pack_tokens) || 0} tokens`}
              summary={`Pay for a pack of tokens. Reading stays free. Each completed sale uses ${Number(policy.sale_tokens ?? 1)} token${Number(policy.sale_tokens ?? 1) === 1 ? "" : "s"} when the order is saved online, including offline sync.`}
              points={[
                `${Number(policy.token_value_kes) || 1} KES is the published value of 1 token`,
                tokenBalance > 0 ? `${tokenBalance} tokens remaining` : "No tokens on this organisation yet",
              ]}
              action="Buy tokens"
            />
            <ModelCard
              title="Monthly"
              active={activeModel === "monthly"}
              price={monthlyPlans[0] ? money(monthlyPlans[0].monthly_price, monthlyPlans[0].currency) : "No monthly plan"}
              period={monthlyPlans.length > 1 ? `${monthlyPlans.length} published plans` : "per month"}
              summary={monthlyPlans[0]?.description || "A monthly plan keeps Centrix open for the features published on that plan."}
              points={planPoints(monthlyPlans)}
              action="Choose a monthly plan"
            />
            <ModelCard
              title="Annual"
              active={activeModel === "annual"}
              price={annualPlans[0] ? money(annualPlans[0].yearly_price, annualPlans[0].currency) : "No yearly price"}
              period="per year"
              summary="A yearly price is taken from a published plan."
              points={planPoints(annualPlans, "yearly_price")}
              action="Choose a yearly plan"
            />
          </section>

          <section className="theme-panel rounded-xl border shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Your subscription</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {subscription?.plan_name || (mode === "token" ? "Token balance" : "No active plan")}
                </p>
              </div>
              <StatusPill mode={mode} status={subscription?.status || license?.status} />
            </div>
            <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
              <Fact label="Renews or ends" value={formatBillingDate(subscription?.current_period_end || license?.expires_at)} />
              <Fact
                label="Amount"
                value={
                  subscription?.renewal_price != null
                    ? money(subscription.renewal_price, subscription.currency)
                    : subscription?.amount != null
                      ? money(subscription.amount, subscription.currency)
                      : "—"
                }
              />
              <Fact label="Tokens remaining" value={String(tokenBalance)} />
            </div>
            <div className="grid gap-4 border-t border-slate-100 px-5 py-4 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Included</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {features.length > 0
                    ? features.map((line) => <li key={line}>{line}</li>)
                    : modules.length > 0
                      ? modules.map((line) => <li key={line}>{line}</li>)
                      : <li>Features appear here after a plan with written details is applied.</li>}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usage</h3>
                <UsageRow label="Users" used={usage.users} limit={seatLimit} />
                <UsageRow label="Branches" used={usage.branches} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <RecordTable
              title="Invoices"
              empty="No Centrix invoices for this organisation yet."
              rows={invoices.map((row) => ({
                id: row.id,
                primary: row.number || `Invoice ${row.id}`,
                secondary: formatBillingDate(row.date),
                amount: money(row.total, row.currency),
                status: row.status,
              }))}
            />
            <RecordTable
              title="Payments"
              empty="No Paybill payments have been applied to this organisation yet."
              rows={payments.map((row) => ({
                id: row.id,
                primary: row.reference || row.product || "Payment",
                secondary: formatBillingDate(row.at),
                amount: money(row.amount),
                status: row.status,
              }))}
            />
          </section>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}

function planPoints(plans, priceKey = "monthly_price") {
  if (plans.length === 0) return ["A platform administrator publishes this price on Self-serve plans."];
  return plans.slice(0, 4).map((plan) => `${plan.name} · ${money(plan[priceKey], plan.currency)}`);
}

function ModelCard({ title, price, period, summary, points, action, active }) {
  return (
    <article className={`theme-panel flex flex-col rounded-xl border p-5 shadow-sm ${active ? "ring-2 ring-[#185FA5]" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {active ? <span className="text-xs font-medium text-[#185FA5]">Current</span> : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{price}</p>
      <p className="text-xs text-slate-500">{period}</p>
      <p className="mt-3 text-sm text-slate-600">{summary}</p>
      <ul className="mt-3 flex-1 space-y-1 text-sm text-slate-700">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <Link href="/subscribe" onClick={() => rememberLicenceReturn("/billing")} className="theme-primary-btn mt-4 inline-flex w-fit items-center rounded-lg px-4 py-2 text-sm font-medium">
        {action}
      </Link>
    </article>
  );
}

function StatusPill({ mode, status }) {
  const label = mode === "token" ? "Tokens" : mode === "trial" ? "Trial" : mode === "full" ? "Active" : mode === "expired" ? "Expired" : "Not subscribed";
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
      {label}{status ? ` · ${status}` : ""}
    </span>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function UsageRow({ label, used, limit = null }) {
  const width = limit ? Math.min(100, Math.round((Number(used) / limit) * 100)) : null;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-sm text-slate-700">
        <span>{label}</span>
        <span>{limit ? `${used} / ${limit}` : used}</span>
      </div>
      {width != null ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[#185FA5]" style={{ width: `${width}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function RecordTable({ title, empty, rows }) {
  return (
    <div className="theme-panel rounded-xl border shadow-sm">
      <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">{row.primary}</p>
                <p className="text-xs text-slate-500">{row.secondary}{row.status ? ` · ${row.status}` : ""}</p>
              </div>
              <p className="font-medium text-slate-900">{row.amount}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
