"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  formatBillingMoney,
  subscriptionStatusLabel,
} from "@/lib/platform-billing";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/**
 * Change the subscription package for an organization (platform admin).
 * PATCH plan_id and sync commercial terms from the selected plan.
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
  const [seatCount, setSeatCount] = useState("");
  const [endTrial, setEndTrial] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentPlanId = subscription?.plan_id ?? subscription?.plan?.id ?? null;
  const isTrialing = subscription?.status === "trialing" || subscription?.is_trial;

  useEffect(() => {
    if (!open || !subscription) return;
    setPlanId(currentPlanId ? String(currentPlanId) : "");
    setSeatCount(
      subscription.seat_count != null ? String(subscription.seat_count) : "",
    );
    setEndTrial(Boolean(isTrialing));
    setLoadingPlans(true);
    void apiRequest("/admin/platform-plans", { loading: false })
      .then((res) => {
        setPlans((res.data ?? []).filter((p) => p.is_active !== false));
      })
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }, [open, subscription, currentPlanId, isTrialing]);

  const selectedPlan = useMemo(
    () => plans.find((p) => String(p.id) === String(planId)) ?? null,
    [plans, planId],
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
      if (seatCount.trim() !== "") {
        body.seat_count = Math.max(1, Number(seatCount) || 1);
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
          Prices, seats (if set on the plan), and included applications are copied from the new
          package. The current licence period is kept.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Current:{" "}
            <span className="font-medium text-slate-800">
              {subscription.plan?.name ?? "Custom package"}
            </span>
            {" · "}
            {subscriptionStatusLabel(subscription.status)}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">New package</span>
            <SearchableSelect
              className={inputClass}
              value={planId}
              onChange={(next) => {
                setPlanId(next);
                const plan = plans.find((p) => String(p.id) === next);
                if (plan?.seat_limit != null) {
                  setSeatCount(String(plan.seat_limit));
                }
              }}
              disabled={loadingPlans || saving}
              options={plans.map((plan) => ({
                value: String(plan.id),
                label: `${plan.name} · first ${formatBillingMoney(
                  plan.first_payment_price ?? plan.price,
                  plan.currency,
                )} · renew ${formatBillingMoney(
                  plan.renewal_price ?? plan.price,
                  plan.currency,
                )}/${plan.interval}`,
              }))}
            />
          </label>

          {selectedPlan ? (
            <p className="text-xs text-slate-500">
              First payment{" "}
              {formatBillingMoney(
                selectedPlan.first_payment_price ?? selectedPlan.price,
                selectedPlan.currency,
              )}
              {" · "}
              Renewal{" "}
              {formatBillingMoney(
                selectedPlan.renewal_price ?? selectedPlan.price,
                selectedPlan.currency,
              )}
              /{selectedPlan.interval}
            </p>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Seats</span>
            <input
              type="number"
              min="1"
              className={inputClass}
              value={seatCount}
              disabled={saving}
              onChange={(e) => setSeatCount(e.target.value)}
            />
          </label>

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
                  Uncheck to keep Trialing on the new package.
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
            disabled={saving || loadingPlans || !planId}
          >
            {saving ? "Saving…" : "Change package"}
          </button>
        </div>
      </form>
    </div>
  );
}
