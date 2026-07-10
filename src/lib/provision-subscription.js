import { addCalendarDays } from "@/lib/organization-license";

/** How the new org gets a licence at registration. */
export const PROVISION_LICENSE_MODES = [
  {
    id: "trial",
    label: "Free trial",
    description: "Org can use Centrix until the trial end date, then locks until extended.",
  },
  {
    id: "plan",
    label: "Paid plan",
    description: "Assign a subscription plan with first-time and renewal pricing.",
  },
  {
    id: "none",
    label: "No licence yet",
    description: "Create the org only. Assign a plan later under Subscriptions (org stays unlocked until a licence exists).",
  },
];

export const PROVISION_TRIAL_PRESETS = [7, 14, 30];

export function emptyProvisionSubscriptionForm(overrides = {}) {
  const start = new Date().toISOString().slice(0, 10);
  return {
    license_mode: "trial",
    plan_id: "",
    status: "trialing",
    seat_count: "1",
    trial_days: "14",
    current_period_start: start,
    current_period_end: addCalendarDays(start, 14),
    ...overrides,
  };
}

export function periodEndForPlanInterval(start, interval) {
  const days = interval === "annual" ? 365 : 30;
  return addCalendarDays(start || undefined, days);
}

/**
 * Build subscription fields for POST /admin/organizations/provision
 * and/or POST /admin/platform-subscriptions.
 */
export function buildProvisionSubscriptionPayload(form, plans = []) {
  if (!form || form.license_mode === "none") {
    return null;
  }

  const plan = plans.find((row) => String(row.id) === String(form.plan_id));
  const start = form.current_period_start || new Date().toISOString().slice(0, 10);
  const isTrial = form.license_mode === "trial" || form.status === "trialing";

  let end = form.current_period_end;
  if (!end) {
    end = isTrial
      ? addCalendarDays(start, Number(form.trial_days) || 14)
      : periodEndForPlanInterval(start, plan?.interval);
  }

  const payload = {
    plan_id: form.plan_id ? Number(form.plan_id) : null,
    status: isTrial ? "trialing" : form.status || "active",
    seat_count: Number(form.seat_count) || 1,
    current_period_start: start,
    current_period_end: end,
    is_trial: isTrial,
    trial_days: isTrial ? Number(form.trial_days) || 14 : null,
    trial_ends_at: isTrial ? end : null,
  };

  if (isTrial && !payload.plan_id && plan) {
    payload.plan_id = Number(plan.id);
  }

  return payload;
}

/** Assign subscription after provision if the API did not create one. */
export async function ensureSubscriptionAfterProvision({
  apiRequest,
  organizationId,
  subscriptionPayload,
  provisionResponse,
}) {
  if (!organizationId || !subscriptionPayload) {
    return provisionResponse?.subscription ?? null;
  }

  const existing =
    provisionResponse?.subscription ??
    provisionResponse?.data?.subscription ??
    null;
  if (existing?.id) return existing;

  const res = await apiRequest("/admin/platform-subscriptions", {
    method: "POST",
    body: {
      organization_id: Number(organizationId),
      ...subscriptionPayload,
    },
  });
  return res.data ?? res.subscription ?? res;
}
