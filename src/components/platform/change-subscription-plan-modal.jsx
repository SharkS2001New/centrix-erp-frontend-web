"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  commercialTermsFromPlan,
  formatBillingMoney,
  organizationIndustryLabel,
  planBillingLabel,
  plansForOrganizationIndustry,
  platformPlanOptionLabel,
  subscriptionStatusLabel,
} from "@/lib/platform-billing";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/**
 * Change the subscription package for an organization (platform admin).
 * Only packages for that organisation's industry are offered.
 * Seats and commercial terms come from the selected package.
 */
export function ChangeSubscriptionPlanModal({
  open,
  subscription,
  organizationLabel,
  onClose,
  onSaved,
}) {
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [planId, setPlanId] = useState("");
  const [endTrial, setEndTrial] = useState(false);
  const [saving, setSaving] = useState(false);

  const organization = subscription?.organization ?? null;
  const currentPlanId = subscription?.plan_id ?? subscription?.plan?.id ?? null;
  const isTrialing = subscription?.status === "trialing" || subscription?.is_trial;
  const industryLabel = organizationIndustryLabel(organization);

  const orgProfile = organization?.deployment_profile ?? "";
  const orgIndustry = organization?.industry ?? "";

  useEffect(() => {
    if (!open || !subscription) return;
    setPlanId(currentPlanId ? String(currentPlanId) : "");
    setEndTrial(false);
    setLoadingPlans(true);
    const org = subscription.organization ?? null;
    void apiRequest("/admin/platform-plans", { loading: false })
      .then((res) => {
        const active = (res.data ?? []).filter((plan) => plan.is_active !== false);
        setPlans(
          plansForOrganizationIndustry(active, org, { keepPlanId: currentPlanId }),
        );
      })
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }, [open, subscription, currentPlanId, orgProfile, orgIndustry]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => String(plan.id) === String(planId)) ?? null,
    [plans, planId],
  );

  const terms = useMemo(
    () => (selectedPlan ? commercialTermsFromPlan(selectedPlan) : null),
    [selectedPlan],
  );

  if (!open || !subscription) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!planId) {
      notifyError("Select a subscription package.");
      return;
    }
    if (String(planId) === String(currentPlanId) && !endTrial) {
      notifyError("Pick a different plan, or end the trial to activate this package.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        plan_id: Number(planId),
        sync_from_plan: true,
      };
      if (terms) {
        body.seat_count = terms.seat_count;
      }
      if (endTrial && isTrialing) {
        body.status = "active";
        body.is_trial = false;
        body.trial_ends_at = null;
      }

      const res = await apiRequest(`/admin/platform-subscriptions/${subscription.id}`, {
        method: "PATCH",
        body,
      });
      notifySuccess(res.message ?? "Subscription package updated.");
      onSaved?.(res.data ?? null);
      onClose?.();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not change package.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="theme-modal max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border p-6 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-slate-900">Change subscription package</h2>
        <p className="mt-1 text-xs text-slate-500">
          {organizationLabel
            ? `Update the plan for ${organizationLabel}.`
            : "Update the plan for this organization."}{" "}
          Only {industryLabel} packages are listed. Prices, seats, and included modules are copied
          from the new package. The current licence period is kept.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Current:{" "}
            <span className="font-medium text-slate-800">
              {subscription.plan?.name ?? "Custom package"}
            </span>
            {" · "}
            {subscriptionStatusLabel(subscription.status)}
            <span className="mt-0.5 block text-slate-500">{industryLabel}</span>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">New package</span>
            <SearchableSelect
              className={inputClass}
              value={planId}
              onChange={(next) => setPlanId(next)}
              disabled={loadingPlans || saving || plans.length === 0}
              placeholder={
                loadingPlans
                  ? "Loading packages…"
                  : plans.length === 0
                    ? `No ${industryLabel} packages`
                    : "— Select —"
              }
              options={plans.map((plan) => ({
                value: String(plan.id),
                label: platformPlanOptionLabel(plan),
              }))}
            />
            {plans.length === 0 && !loadingPlans ? (
              <p className="mt-1 text-xs text-slate-500">
                Create a {industryLabel} package on{" "}
                <Link href="/platform/self-serve-plans" className="font-medium text-[#185FA5] hover:underline">
                  Self-serve plans
                </Link>
                .
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Showing {plans.length} package{plans.length === 1 ? "" : "s"} for {industryLabel}.
              </p>
            )}
          </label>

          {selectedPlan && terms ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <p>
                <span className="font-medium text-slate-800">{planBillingLabel(selectedPlan)}</span>
                {" · "}
                {terms.seat_count} seat{terms.seat_count === 1 ? "" : "s"}
              </p>
              <p className="mt-1">
                First payment{" "}
                {formatBillingMoney(terms.first_payment_price, selectedPlan.currency)}
                {" · "}
                Renewal{" "}
                {formatBillingMoney(terms.renewal_price, selectedPlan.currency)}
                /{terms.billing_cycle === "yearly" ? "year" : "month"}
              </p>
              <p className="mt-1 text-slate-500">Seats and amounts come from this package.</p>
            </div>
          ) : null}

          {isTrialing ? (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300"
                checked={endTrial}
                disabled={saving}
                onChange={(e) => setEndTrial(e.target.checked)}
              />
              <span>
                End trial and set status to <strong>Active</strong>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Leave unchecked to keep Trialing on the new package.
                </span>
              </span>
            </label>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={saving}
            onClick={() => onClose?.()}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144e8a] disabled:opacity-50"
            disabled={saving || loadingPlans || !planId || plans.length === 0}
          >
            {saving ? "Saving…" : "Change package"}
          </button>
        </div>
      </form>
    </div>
  );
}
