"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
import { formatBillingDateTime, toLicenceDateTimeLocal } from "@/lib/platform-billing";
import { periodEndForPlanInterval } from "@/lib/provision-subscription";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/**
 * Edit the date and hour this subscription opens and closes.
 */
export function EditSubscriptionPeriodModal({
  subscription,
  open,
  onClose,
  onSaved,
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !subscription) return;
    setStart(toLicenceDateTimeLocal(subscription.current_period_start));
    setEnd(toLicenceDateTimeLocal(subscription.current_period_end || subscription.trial_ends_at, { end: true }));
  }, [open, subscription]);

  if (!open || !subscription) return null;

  const orgName = subscription.organization?.org_name ?? "Organization";
  const planName = subscription.plan?.name ?? "Custom package";
  const planInterval = subscription.plan?.interval;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!start || !end) {
      notifyError("Start and end dates are required.");
      return;
    }
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      notifyError("End must be after the start, including the hour.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        current_period_start: start,
        current_period_end: end,
      };
      if (subscription.is_trial) {
        body.trial_ends_at = end;
      }
      // Reactivate if the new end is still in the future and licence was expired.
      if (
        new Date(end).getTime() > Date.now() &&
        ["expired", "past_due", "cancelled"].includes(subscription.status)
      ) {
        body.status = subscription.is_trial ? "trialing" : "active";
      }

      await apiRequest(`/admin/platform-subscriptions/${subscription.id}`, {
        method: "PATCH",
        body,
      });
      notifySuccess(
        `Period updated: ${formatBillingDateTime(start)} → ${formatBillingDateTime(end)}.`,
      );
      onSaved?.();
      onClose?.();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to update period.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="theme-modal w-full max-w-md rounded-xl border p-6 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-slate-900">Edit date and hour</h2>
        <p className="mt-1 text-sm text-slate-500">
          {orgName} · {planName}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          The system opens at the start hour and closes at the end hour. You can set a window as short as one hour.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Opens</span>
            <input
              type="datetime-local"
              className={inputClass}
              value={start}
              required
              onChange={(e) => {
                const nextStart = e.target.value;
                setStart(nextStart);
                if (planInterval && nextStart && (!end || end <= nextStart)) {
                  setEnd(toLicenceDateTimeLocal(periodEndForPlanInterval(nextStart, planInterval), { end: true }));
                }
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Closes</span>
            <input
              type="datetime-local"
              className={inputClass}
              value={end}
              required
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {planInterval ? (
            <button
              type="button"
              className="text-xs font-medium text-[#185FA5] hover:underline"
              onClick={() => {
                if (!start) return;
                setEnd(toLicenceDateTimeLocal(periodEndForPlanInterval(start, planInterval), { end: true }));
              }}
            >
              Fill end from plan interval ({planInterval})
            </button>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            onClick={() => onClose?.()}
            disabled={saving}
          >
            Cancel
          </button>
          <PrimaryButton type="submit" showIcon={false} disabled={saving}>
            {saving ? "Saving…" : "Save period"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
