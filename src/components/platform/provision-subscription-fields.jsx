"use client";

import Link from "next/link";
import {
  PROVISION_LICENSE_MODES,
  PROVISION_TRIAL_PRESETS,
  periodEndForPlanInterval,
} from "@/lib/provision-subscription";
import { addCalendarDays } from "@/lib/organization-license";
import {
  formatBillingMoney,
  licenseBasisLabel,
} from "@/lib/platform-billing";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

/**
 * Licence / subscription block for Register organization.
 */
export function ProvisionSubscriptionFields({
  form,
  onChange,
  plans = [],
  plansLoading = false,
}) {
  const selectedPlan = plans.find((row) => String(row.id) === String(form.plan_id));
  const isTrial = form.license_mode === "trial";
  const needsPlan = form.license_mode === "plan" || (isTrial && plans.length > 0);

  function patch(partial) {
    onChange({ ...form, ...partial });
  }

  function setMode(license_mode) {
    const start = form.current_period_start || new Date().toISOString().slice(0, 10);
    if (license_mode === "trial") {
      const days = Number(form.trial_days) || 14;
      patch({
        license_mode,
        status: "trialing",
        trial_days: String(days),
        current_period_end: addCalendarDays(start, days),
      });
      return;
    }
    if (license_mode === "plan") {
      const plan = selectedPlan || plans[0];
      patch({
        license_mode,
        status: "active",
        plan_id: form.plan_id || (plan ? String(plan.id) : ""),
        current_period_end: periodEndForPlanInterval(start, plan?.interval),
      });
      return;
    }
    patch({ license_mode, status: "active" });
  }

  function applyTrialDays(days) {
    const start = form.current_period_start || new Date().toISOString().slice(0, 10);
    const n = Number(days) || 14;
    patch({
      trial_days: String(n),
      current_period_end: addCalendarDays(start, n),
    });
  }

  function applyPlan(planId) {
    const plan = plans.find((row) => String(row.id) === String(planId));
    const start = form.current_period_start || new Date().toISOString().slice(0, 10);
    patch({
      plan_id: planId,
      seat_count:
        plan?.seat_limit != null && form.license_mode === "plan"
          ? String(plan.seat_limit)
          : form.seat_count,
      current_period_end:
        form.license_mode === "trial"
          ? form.current_period_end
          : periodEndForPlanInterval(start, plan?.interval),
    });
  }

  return (
    <section className="theme-panel rounded-xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Licence & subscription</h2>
          <p className="mt-1 text-xs text-slate-500">
            Created with the organization so expiry, trials, and lockout apply from day one.
          </p>
        </div>
        <Link href="/platform/plans" className="text-xs font-medium text-[#185FA5] hover:underline">
          Manage plans
        </Link>
      </div>

      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">Licence mode</legend>
        {PROVISION_LICENSE_MODES.map((mode) => (
          <label
            key={mode.id}
            className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 text-sm ${
              form.license_mode === mode.id
                ? "border-indigo-400 bg-indigo-50/70 dark:border-indigo-600 dark:bg-indigo-950/30"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-700"
            }`}
          >
            <input
              type="radio"
              name="license_mode"
              className="mt-1"
              checked={form.license_mode === mode.id}
              onChange={() => setMode(mode.id)}
            />
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{mode.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{mode.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {form.license_mode === "none" ? null : (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {plansLoading ? (
            <p className="text-sm text-slate-500">Loading plans…</p>
          ) : plans.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No active plans yet.{" "}
              <Link href="/platform/plans" className="font-medium underline">
                Create a plan
              </Link>{" "}
              first, or choose “No licence yet”.
            </p>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                {isTrial ? "Plan (optional for trial)" : "Plan"}
              </span>
              <select
                className={inputClass}
                value={form.plan_id}
                required={form.license_mode === "plan"}
                onChange={(e) => applyPlan(e.target.value)}
              >
                <option value="">{isTrial ? "— Custom trial (no plan) —" : "— Select plan —"}</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · first{" "}
                    {formatBillingMoney(plan.first_payment_price ?? plan.price, plan.currency)} · renew{" "}
                    {formatBillingMoney(plan.renewal_price ?? plan.price, plan.currency)}/
                    {plan.interval}
                  </option>
                ))}
              </select>
              {selectedPlan ? (
                <span className="mt-1 block text-xs text-slate-500">
                  {licenseBasisLabel(selectedPlan.license_basis)}
                  {selectedPlan.seat_limit != null ? ` · ${selectedPlan.seat_limit} seats` : ""}
                </span>
              ) : null}
            </label>
          )}

          {isTrial ? (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Trial length</p>
              <div className="flex flex-wrap gap-2">
                {PROVISION_TRIAL_PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      String(form.trial_days) === String(days)
                        ? "border-sky-500 bg-sky-50 text-sky-800"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={() => applyTrialDays(days)}
                  >
                    {days} days
                  </button>
                ))}
              </div>
              <label className="mt-2 block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Custom days</span>
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={form.trial_days}
                  onChange={(e) => applyTrialDays(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Seats</span>
              <input
                type="number"
                min="1"
                className={inputClass}
                value={form.seat_count}
                onChange={(e) => patch({ seat_count: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Starts</span>
              <input
                type="date"
                className={inputClass}
                value={form.current_period_start}
                onChange={(e) => {
                  const start = e.target.value;
                  const end = isTrial
                    ? addCalendarDays(start, Number(form.trial_days) || 14)
                    : periodEndForPlanInterval(start, selectedPlan?.interval);
                  patch({ current_period_start: start, current_period_end: end });
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Expires</span>
              <input
                type="date"
                className={inputClass}
                value={form.current_period_end}
                onChange={(e) => patch({ current_period_end: e.target.value })}
                required={needsPlan || isTrial}
              />
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
