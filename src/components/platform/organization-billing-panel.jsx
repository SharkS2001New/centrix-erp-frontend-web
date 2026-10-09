"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { PlatformContractViewer } from "@/components/platform/platform-contract-viewer";
import { PlatformInvoiceViewer } from "@/components/platform/platform-invoice-viewer";
import {
  CONTRACT_STATUS_STYLES,
  SUBSCRIPTION_STATUS_STYLES,
  billingIntervalLabel,
  contractKindLabel,
  contractStatusLabel,
  formatBillingDate,
  formatBillingMoney,
  isSubscriptionOverdue,
  licenseBasisLabel,
  planModuleLabels,
  platformInvoiceLabel,
  resolveAgreementPrices,
  resolveSubscriptionInvoices,
  subscriptionStatusLabel,
  workspaceLabels,
} from "@/lib/platform-billing";
import {
  addCalendarDays,
  isLicenseExpired,
  isLicenseExpiringSoon,
  resolveOrganizationLicense,
} from "@/lib/organization-license";
import { periodEndForPlanInterval } from "@/lib/provision-subscription";
import { ChangeSubscriptionPlanModal } from "@/components/platform/change-subscription-plan-modal";
import { EditSubscriptionPeriodModal } from "@/components/platform/edit-subscription-period-modal";

function AssignOrganizationPlan({ organizationId, onSaved }) {
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [planId, setPlanId] = useState("");
  const [mode, setMode] = useState("trial");
  const [trialDays, setTrialDays] = useState("14");
  const [seatCount, setSeatCount] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingPlans(true);
    void apiRequest("/admin/platform-plans", { loading: false })
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data ?? []).filter((plan) => plan.is_active !== false);
        setPlans(rows);
        setPlanId(rows[0] ? String(rows[0].id) : "");
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPlans(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = plans.find((plan) => String(plan.id) === String(planId)) ?? null;

  async function handleAssign(event) {
    event.preventDefault();
    if (!organizationId || !planId) {
      notifyError("Create a payment plan, then choose it here.");
      return;
    }
    const start = new Date().toISOString().slice(0, 10);
    const isTrial = mode === "trial";
    const end = isTrial
      ? addCalendarDays(start, Number(trialDays) || 14)
      : periodEndForPlanInterval(start, selected?.interval);
    setSaving(true);
    try {
      await apiRequest("/admin/platform-subscriptions", {
        method: "POST",
        body: {
          organization_id: Number(organizationId),
          plan_id: Number(planId),
          status: isTrial ? "trialing" : "active",
          seat_count: Number(seatCount) || Number(selected?.seat_limit) || 1,
          current_period_start: start,
          current_period_end: end,
          is_trial: isTrial,
          trial_days: isTrial ? Number(trialDays) || 14 : null,
        },
      });
      notifySuccess(isTrial ? "Free trial started." : "Plan assigned. Paybill payments now match this plan.");
      await onSaved?.();
    } catch (error) {
      notifyError(error instanceof ApiError ? error.message : "Could not assign the plan.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingPlans) {
    return <p className="text-sm text-slate-500">Loading payment plans…</p>;
  }

  if (plans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        <p>No payment plans yet. Create monthly, yearly, and token prices first, then come back and assign one.</p>
        <Link href="/platform/plans" className="mt-3 inline-flex text-sm font-semibold text-[#185FA5] hover:underline">
          Create payment plans
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleAssign(event)} className="space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-sm text-slate-700">This organisation has no plan yet. Assign one so Paybill payments auto-subscribe it.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Payment plan</span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Start as</span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="trial">Free trial</option>
            <option value="paid">Paid plan</option>
          </select>
        </label>
        {mode === "trial" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Trial days</span>
            <input
              type="number"
              min="1"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={trialDays}
              onChange={(event) => setTrialDays(event.target.value)}
            />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Seats</span>
          <input
            type="number"
            min="1"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={seatCount}
            onChange={(event) => setSeatCount(event.target.value)}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving || !planId}
        className="rounded-lg bg-[#185FA5] px-3 py-2 text-xs font-semibold text-white hover:bg-[#144f8a] disabled:opacity-50"
      >
        {saving ? "Saving…" : mode === "trial" ? "Start free trial" : "Assign plan"}
      </button>
    </form>
  );
}

function BillingSection({ title, description, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Subscription package + invoice + contracts.
 * mode=platform — super-admin org status (manage links / revoke).
 * mode=tenant — org admin License Information (read-only).
 */
export function OrganizationBillingPanel({
  organizationId,
  organization,
  mode = "platform",
  showInvoice = true,
  showRevoke = false,
  readOnly = false,
}) {
  const confirm = useConfirm();
  const isTenant = mode === "tenant";
  const [subscription, setSubscription] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [viewerContract, setViewerContract] = useState(null);
  const [viewerInvoice, setViewerInvoice] = useState(null);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [editPeriodOpen, setEditPeriodOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let subRes = null;
      let contractsRes = { data: [] };

      if (isTenant) {
        subRes = await apiRequest("/erp/organization/subscription", { loading: false }).catch(
          () =>
            apiRequest("/organization/subscription", { loading: false }).catch(() => null),
        );
        contractsRes = await apiRequest("/erp/organization/contracts", { loading: false }).catch(
          () =>
            apiRequest("/organization/contracts", { loading: false }).catch(() => ({ data: [] })),
        );
      } else if (organizationId) {
        subRes = await apiRequest(`/admin/organizations/${organizationId}/platform-subscription`, {
          loading: false,
        }).catch(() =>
          apiRequest(`/admin/organizations/${organizationId}/subscription`, {
            loading: false,
          }).catch(() => null),
        );
        contractsRes = await apiRequest(`/admin/organizations/${organizationId}/platform-contracts`, {
          loading: false,
        }).catch(() =>
          apiRequest(`/admin/organizations/${organizationId}/contracts`, {
            loading: false,
          }).catch(() =>
            apiRequest("/admin/platform-contracts", {
              searchParams: { organization_id: organizationId },
              loading: false,
            }).catch(() => ({ data: [] })),
          ),
        );
      }

      setSubscription(subRes?.data ?? subRes?.subscription ?? (subRes?.id ? subRes : null));
      setContracts(contractsRes?.data ?? []);
    } catch (e) {
      if (!isTenant) {
        notifyError(e instanceof ApiError ? e.message : "Failed to load billing details.");
      }
      setSubscription(null);
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, isTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openContract(row) {
    if (isTenant) {
      setViewerContract(row);
      return;
    }
    try {
      const detail = await apiRequest(`/admin/platform-contracts/${row.id}`, { loading: false });
      setViewerContract(detail.data ?? detail);
    } catch {
      setViewerContract(row);
    }
  }

  async function handleRevoke() {
    if (!subscription?.id) return;
    const orgLabel = organization?.org_name || "this organization";
    const ok = await confirm({
      title: "Revoke licence?",
      message: `Revoke the Centrix licence for ${orgLabel}? Users will be signed out immediately and locked out until you extend or re-assign a plan.`,
      confirmLabel: "Revoke licence",
      destructive: true,
    });
    if (!ok) return;

    setActing(true);
    try {
      const res = await apiRequest(`/admin/platform-subscriptions/${subscription.id}/revoke`, {
        method: "POST",
        body: {},
      });
      notifySuccess(res.message ?? "Licence revoked.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not revoke licence.");
    } finally {
      setActing(false);
    }
  }

  const overdue = isSubscriptionOverdue(subscription);
  const status = overdue ? "past_due" : subscription?.status;
  const prices = subscription ? resolveAgreementPrices(subscription) : null;
  const apps = workspaceLabels(
    subscription?.workspace_keys ?? subscription?.plan?.workspace_keys ?? [],
  );
  const license = subscription ? resolveOrganizationLicense(subscription) : null;
  const licenseExpired = license ? isLicenseExpired(license) : false;
  const licenseSoon = license ? isLicenseExpiringSoon(license) : false;
  const invoice = subscription?.invoice ?? null;
  const { initial: initialInvoice, renewal: renewalInvoice } = subscription
    ? resolveSubscriptionInvoices(subscription)
    : { initial: null, renewal: null };
  const canRevoke =
    !readOnly &&
    showRevoke &&
    !isTenant &&
    subscription?.id &&
    subscription.status !== "cancelled" &&
    subscription.status !== "expired";
  const canChangePlan = !readOnly && !isTenant && subscription?.id;
  const showPlatformActions = !readOnly && !isTenant;

  return (
    <>
      <BillingSection
        title={isTenant ? "Your Centrix plan" : "Subscription package"}
        description={
          isTenant
            ? "Plan, seats, and licence period agreed for your organization."
            : "The plan this tenant is billed under — first payment, renewal, and overdue status."
        }
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading subscription…</p>
        ) : !subscription ? (
          isTenant ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40">
              No subscription details are available yet. Contact your Centrix account manager.
            </div>
          ) : (
            <AssignOrganizationPlan
              organizationId={organizationId}
              onSaved={load}
            />
          )
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {subscription.plan?.name ?? "Custom package"}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">First-time payment</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatBillingMoney(prices.first_payment_price, prices.currency)}
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Renewal ({billingIntervalLabel(prices.interval)})
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatBillingMoney(prices.renewal_price, prices.currency)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {licenseBasisLabel(prices.license_basis)}
                  {subscription.seat_count != null ? ` · ${subscription.seat_count} seats` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Period {formatBillingDate(subscription.current_period_start)} →{" "}
                  {formatBillingDate(subscription.current_period_end)}
                  {showPlatformActions ? (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="font-medium text-[#185FA5] hover:underline"
                        onClick={() => setEditPeriodOpen(true)}
                      >
                        Edit dates
                      </button>
                    </>
                  ) : null}
                </p>
                {license?.days_remaining != null ? (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      licenseExpired
                        ? "text-red-700"
                        : licenseSoon
                          ? "text-amber-700"
                          : "text-slate-500"
                    }`}
                  >
                    {licenseExpired
                      ? "Licence expired — users are locked out until extended"
                      : license.days_remaining === 0
                        ? "Licence expires today"
                        : `${license.days_remaining} day${license.days_remaining === 1 ? "" : "s"} until expiry`}
                  </p>
                ) : null}
                {apps.length ? (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Applications: {apps.join(", ")}
                  </p>
                ) : subscription.plan?.module_keys?.length ? (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Modules: {planModuleLabels(subscription.plan.module_keys).join(", ")}
                  </p>
                ) : null}
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${SUBSCRIPTION_STATUS_STYLES[status] ?? SUBSCRIPTION_STATUS_STYLES.active}`}
              >
                {overdue ? "Overdue" : subscriptionStatusLabel(subscription.status)}
              </span>
            </div>
            {showPlatformActions ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                {canChangePlan ? (
                  <button
                    type="button"
                    className="font-medium text-[#185FA5] hover:underline"
                    onClick={() => setChangePlanOpen(true)}
                  >
                    Change package
                  </button>
                ) : null}
                <button
                  type="button"
                  className="font-medium text-[#185FA5] hover:underline"
                  onClick={() => setEditPeriodOpen(true)}
                >
                  Edit period
                </button>
                <Link href="/platform/subscriptions" className="font-medium text-[#185FA5] hover:underline">
                  Manage subscriptions
                </Link>
                <Link
                  href={`/platform/invoices/new?organization=${organizationId}`}
                  className="font-medium text-[#185FA5] hover:underline"
                >
                  Create invoice
                </Link>
                {canRevoke ? (
                  <button
                    type="button"
                    disabled={acting}
                    className="font-medium text-red-600 hover:underline disabled:opacity-50"
                    onClick={() => void handleRevoke()}
                  >
                    {acting ? "Revoking…" : "Revoke licence"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </BillingSection>

      {showInvoice ? (
        <BillingSection
          title="Invoices"
          description={
            isTenant
              ? "First payment and renewal invoices linked to your subscription."
              : "Initial (first payment) and renewal invoices for this subscription."
          }
        >
          {loading ? (
            <p className="text-sm text-slate-500">Loading invoices…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  key: "initial",
                  title: "Initial invoice",
                  invoice: initialInvoice,
                },
                {
                  key: "renewal",
                  title: "Renewal invoice",
                  invoice: renewalInvoice,
                },
              ].map(({ key, title, invoice: row }) => (
                <div
                  key={key}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {title}
                  </p>
                  {!row?.id ? (
                    <p className="mt-2 text-sm text-slate-500">Not linked yet.</p>
                  ) : (
                    <>
                      <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {platformInvoiceLabel(row)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Issued {formatBillingDate(row.issue_date)}
                        {row.due_date ? ` · Due ${formatBillingDate(row.due_date)}` : ""}
                      </p>
                      {row.total != null ? (
                        <p className="mt-1 text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">
                          {formatBillingMoney(row.total, row.currency)}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="mt-2 text-sm font-medium text-[#185FA5] hover:underline"
                        onClick={() => setViewerInvoice(row)}
                      >
                        View
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {!loading && !initialInvoice?.id && !renewalInvoice?.id && !isTenant ? (
            <p className="text-xs text-slate-500">
              Attach invoices from{" "}
              <Link href="/platform/subscriptions" className="font-medium text-[#185FA5] hover:underline">
                Subscriptions
              </Link>
              {" · "}
              <Link
                href={`/platform/invoices/new?organization=${organizationId}`}
                className="font-medium text-[#185FA5] hover:underline"
              >
                Create invoice
              </Link>
            </p>
          ) : null}
        </BillingSection>
      ) : null}

      <BillingSection
        title="Contracts & quotes"
        description={
          isTenant
            ? "Agreements for your organization. Open to read or print."
            : "Signed agreements and quotes. Open to read, expand, print, email, or download."
        }
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading contracts…</p>
        ) : contracts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40">
            {isTenant ? (
              "No contracts on file yet."
            ) : (
              <>
                No contracts on file.{" "}
                <Link href="/platform/contracts/new" className="font-medium text-[#185FA5] hover:underline">
                  Create a quote
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {contracts.map((row) => {
              const rowPrices = resolveAgreementPrices(row);
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {row.title || contractKindLabel(row.kind)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {contractKindLabel(row.kind)}
                      {row.reference ? ` · ${row.reference}` : ""} · First{" "}
                      {formatBillingMoney(rowPrices.first_payment_price, rowPrices.currency)} · Renewal{" "}
                      {formatBillingMoney(rowPrices.renewal_price, rowPrices.currency)}/
                      {billingIntervalLabel(rowPrices.interval)} ·{" "}
                      {formatBillingDate(row.start_date || row.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${CONTRACT_STATUS_STYLES[row.status] ?? CONTRACT_STATUS_STYLES.draft}`}
                    >
                      {contractStatusLabel(row.status)}
                    </span>
                    <button
                      type="button"
                      className="text-sm font-medium text-[#185FA5] hover:underline"
                      onClick={() => void openContract(row)}
                    >
                      View
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {organization?.org_name && !isTenant ? (
          <p className="text-xs text-slate-500">Organization: {organization.org_name}</p>
        ) : null}
      </BillingSection>

      <PlatformContractViewer
        open={Boolean(viewerContract)}
        contract={viewerContract}
        expanded
        allowEmail={!isTenant}
        onClose={() => setViewerContract(null)}
      />
      <PlatformInvoiceViewer
        open={Boolean(viewerInvoice)}
        invoice={viewerInvoice}
        expanded
        allowEmail={!isTenant}
        onClose={() => setViewerInvoice(null)}
      />
      <ChangeSubscriptionPlanModal
        open={changePlanOpen}
        subscription={subscription}
        organizationLabel={organization?.org_name}
        onClose={() => setChangePlanOpen(false)}
        onSaved={() => void load()}
      />
      <EditSubscriptionPeriodModal
        open={editPeriodOpen}
        subscription={subscription}
        onClose={() => setEditPeriodOpen(false)}
        onSaved={() => {
          setEditPeriodOpen(false);
          void load();
        }}
      />
    </>
  );
}
