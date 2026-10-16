/**
 * Organization licence / subscription expiry for Centrix web + mobile clients.
 *
 * Backend contract (login, capabilities, and every authenticated API):
 * - Include `license` (or `subscription`) on `/auth/login` and `/erp/capabilities`.
 * - Free trial, unpaid, and expired licences stay signed in.
 * - Package 1 opens the screens the platform administrator allowed, starting with the dashboard.
 * - An expired licence can still open products, customers, suppliers, and sales reports.
 * - Every other API returns `organization_license_upgrade_required` until they pay.
 */

import { formatBillingDate } from "@/lib/platform-billing";

/** Days before expiry when login + in-app warnings always show. */
export const LICENSE_WARNING_DAYS = 7;

/** API error codes that mean the org licence is expired (web + mobile). */
export const LICENSE_EXPIRED_API_CODES = [
  "organization_license_expired",
  "organization_subscription_required",
  "license_expired",
  "subscription_expired",
  "organization_subscription_expired",
];

const LICENSE_DISMISS_KEY = "centrix_license_warning_dismissed";

/**
 * Date-only values cover that whole calendar day.
 * A value with an hour is the exact minute the licence opens or closes.
 */
export function parseLicenceInstant(value, { dateOnly = "end" } = {}) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T${dateOnly === "start" ? "00:00:00" : "23:59:59"}`);
  }
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateEnd(value) {
  return parseLicenceInstant(value, { dateOnly: "end" });
}

/** Where the clock sits against the licence window. */
export function licenceBoundary(license, now = Date.now()) {
  if (!license) return "inside";
  const start = parseLicenceInstant(license.starts_at, { dateOnly: "start" });
  const end = parseLicenceInstant(license.expires_at_raw || license.expires_at, { dateOnly: "end" });
  if (start && start.getTime() > now) return "before";
  if (end && end.getTime() <= now) return "after";
  return "inside";
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** @param {Date} end */
export function daysUntilDate(end, from = new Date()) {
  if (!end) return null;
  const ms = startOfLocalDay(end).getTime() - startOfLocalDay(from).getTime();
  return Math.ceil(ms / 86_400_000);
}

export function addCalendarDays(isoDate, days) {
  const base = isoDate ? String(isoDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Normalize licence payload from capabilities, login, or subscription record.
 * @param {object | null | undefined} source
 */
export function resolveOrganizationLicense(source = null) {
  if (!source || typeof source !== "object") return null;

  const raw =
    source.license ??
    source.organisation_license ??
    source.organization_license ??
    source.subscription ??
    (source.status || source.expires_at || source.current_period_end || source.trial_ends_at
      ? source
      : null);

  if (!raw || typeof raw !== "object") return null;

  const expiresAt =
    raw.expires_at ??
    raw.license_expires_at ??
    raw.trial_ends_at ??
    raw.current_period_end ??
    null;
  const startsAt = raw.starts_at ?? raw.current_period_start ?? null;
  const end = parseDateEnd(expiresAt);
  const start = parseLicenceInstant(startsAt, { dateOnly: "start" });
  const nowMs = Date.now();
  const statusRaw = String(raw.status ?? "").toLowerCase() || null;
  const computedDays = end != null ? daysUntilDate(end) : null;
  const daysRemaining =
    raw.days_remaining != null && Number.isFinite(Number(raw.days_remaining))
      ? Number(raw.days_remaining)
      : computedDays;
  const warningDays =
    raw.warning_days != null && Number.isFinite(Number(raw.warning_days))
      ? Number(raw.warning_days)
      : LICENSE_WARNING_DAYS;

  let status = statusRaw;
  if (!status && end) {
    status = daysRemaining != null && daysRemaining < 0 ? "expired" : "active";
  }
  if (
    status &&
    ["active", "trialing", "past_due"].includes(status) &&
    ((end && end.getTime() <= nowMs) || (daysRemaining != null && daysRemaining < 0))
  ) {
    status = "expired";
  }
  if (
    status &&
    ["active", "trialing", "past_due"].includes(status) &&
    start &&
    start.getTime() > nowMs
  ) {
    status = "scheduled";
  }

  const isTrial = Boolean(raw.is_trial || status === "trialing");

  return {
    status: status || (end ? "active" : "missing"),
    starts_at: startsAt ? String(startsAt) : null,
    expires_at: expiresAt ? String(expiresAt) : null,
    expires_at_raw: expiresAt,
    is_trial: isTrial,
    days_remaining: daysRemaining,
    warning_days: warningDays,
    plan_name: raw.plan?.name ?? raw.plan_name ?? null,
    access: ["free", "expired", "full", "token", "trial"].includes(raw.access) ? raw.access : null,
    tokens_enabled: raw.tokens_enabled !== false,
    token_balance: raw.token_balance != null ? Number(raw.token_balance) : 0,
    sale_tokens: raw.sale_tokens != null ? Number(raw.sale_tokens) : Number(raw.write_costs?.create ?? 1),
    write_costs: {
      create: Number(raw.write_costs?.create ?? 1),
      update: Number(raw.write_costs?.update ?? 1),
      delete: Number(raw.write_costs?.delete ?? 1),
    },
    modules: Array.isArray(raw.modules) ? raw.modules.map((key) => String(key)) : [],
    paybill: raw.paybill && typeof raw.paybill === "object" ? raw.paybill : null,
    offers: Array.isArray(raw.offers) ? raw.offers : [],
    plans: Array.isArray(raw.plans) ? raw.plans : [],
    duration_discount:
      raw.duration_discount && typeof raw.duration_discount === "object" ? raw.duration_discount : null,
    free_plan: raw.free_plan && typeof raw.free_plan === "object" ? raw.free_plan : null,
    billing_cycle: raw.billing_cycle === "yearly" || raw.billing_cycle === "monthly" ? raw.billing_cycle : null,
    plan_id: raw.plan_id != null ? Number(raw.plan_id) : null,
    renewal_amount: raw.renewal_amount != null && Number(raw.renewal_amount) > 0 ? Number(raw.renewal_amount) : null,
  };
}

/** A paid yearly organisation. Trials still choose a plan. */
export function isYearlyLicence(license) {
  if (!license || license.is_trial || license.status === "trialing") return false;
  return license.billing_cycle === "yearly";
}

/** Yearly organisations renew only while the licence is counting down or has ended. */
export function yearlyRenewalOpen(license) {
  if (!isYearlyLicence(license)) return false;
  const mode = licenseAccessMode(license);
  if (mode === "trial" || mode === "free" || mode === "token") return false;
  return isLicenseExpiringSoon(license) || mode === "expired";
}

/** Extract licence from capabilities and/or organization objects. */
export function licenseFromAuthState({ capabilities = null, organization = null } = {}) {
  return (
    resolveOrganizationLicense(capabilities) ||
    resolveOrganizationLicense(organization) ||
    resolveOrganizationLicense(organization?.subscription) ||
    null
  );
}

/** Paid licence, active free trial, unpaid, or an expired licence that can still sign in. */
export function licenseAccessMode(license) {
  const boundary = licenceBoundary(license);
  if (boundary === "before") return "expired";
  if (boundary === "after" && license?.access !== "token") return "expired";
  if (["full", "free", "expired", "token", "trial"].includes(license?.access)) {
    return license.access;
  }
  if (!license) return "full";
  if (license.status === "missing") return "free";
  if (isLicenseExpired(license)) return "expired";
  if (license.is_trial || license.status === "trialing") return "trial";
  return "full";
}

export function licenceNeedsPayment(license) {
  const mode = licenseAccessMode(license);
  return mode === "free" || mode === "expired";
}

/** Package 1 while unpaid or still on the free trial. */
export function usesPackageOne(license) {
  const mode = licenseAccessMode(license);
  return mode === "free" || mode === "trial";
}

/** External POS cannot run on tokens. Offline sales upload later, so the till needs a monthly or yearly period. */
export const EXTERNAL_POS_SUBSCRIPTION_MESSAGE =
  "External POS needs a monthly or yearly subscription. Token billing cannot run this till, because sales are taken offline and uploaded later.";

export function externalPosRequiresDatedSubscription(license) {
  return licenseAccessMode(license) === "token";
}

const LIMITED_SALES_REPORTS = new Set([
  "daily-sales",
  "sales-by-product",
  "sales-by-supplier",
  "sales-by-user",
  "sales-by-customer",
  "sales-by-channel",
  "sales-pipeline",
  "vat-collected",
  "category-sales",
  "discount-summary",
  "payment-collection",
  "credit-outstanding",
  "till-sessions",
  "eod-cashier",
  "eod-report",
  "returns",
]);

const LICENCE_RETURN_KEY = "centrix_subscribe_return";

/** Every module opens the subscription overlay when the user wants to pay. */
export function licencePlanPath() {
  return "/subscribe";
}

/** Remember the module page to reopen when the subscription overlay is closed. */
export function rememberLicenceReturn(pathname) {
  if (typeof window === "undefined") return;
  const path = String(pathname || "").split("?")[0].replace(/\/$/, "") || "/";
  if (path === "/subscribe" || path.startsWith("/subscribe")) return;
  try {
    window.sessionStorage.setItem(LICENCE_RETURN_KEY, path);
  } catch {
    /* ignore private-mode storage failures */
  }
}

export function takeLicenceReturnPath() {
  if (typeof window === "undefined") return null;
  try {
    const path = window.sessionStorage.getItem(LICENCE_RETURN_KEY);
    window.sessionStorage.removeItem(LICENCE_RETURN_KEY);
    return path || null;
  } catch {
    return null;
  }
}

const FREE_PLAN_SHELL = ["/subscribe", "/billing", "/choose-workspace", "/profile"];

/** Pages Package 1 may open. Expired organisations keep the wider limited list. */
export function isFreePlanPath(pathname, license) {
  const path = String(pathname || "").split("?")[0].replace(/\/$/, "") || "/";
  if (FREE_PLAN_SHELL.some((shell) => path === shell || path.startsWith(`${shell}/`))) return true;
  const rules = Array.isArray(license?.free_plan?.rules) ? license.free_plan.rules : [];
  const list = rules.length > 0 ? rules : [{ path: "/dashboard", exact: true }];
  return list.some((rule) => {
    const target = String(rule?.path || "");
    if (!target) return false;
    if (rule.exact) return path === target;
    return path === target || path.startsWith(`${target}/`);
  });
}

/** First screen Package 1 opens, used when the subscription overlay is closed. */
export function freePlanHome(license) {
  const rules = Array.isArray(license?.free_plan?.rules) ? license.free_plan.rules : [];
  const first = rules.map((rule) => String(rule?.path || "")).find(Boolean);
  return first || "/dashboard";
}

/** Pages a free or expired organisation may open. Everything else goes to the payment screen. */
export function isLimitedLicencePath(pathname) {
  const path = String(pathname || "").split("?")[0].replace(/\/$/, "") || "/";
  if (path === "/subscribe" || path === "/billing") return true;
  if (path === "/products" || path.startsWith("/products/")) return true;
  if (path === "/customers" || path.startsWith("/customers/")) return true;
  if (path === "/suppliers" || /^\/suppliers\/\d+$/.test(path)) return true;
  if (path === "/reports") return true;
  const report = path.match(/^\/reports\/([^/]+)$/);
  return Boolean(report && LIMITED_SALES_REPORTS.has(report[1]));
}

export function isLicenseExpired(license) {
  if (!license) return false;
  if (["missing", "expired", "cancelled", "inactive"].includes(license.status)) return true;
  if (license.days_remaining != null && license.days_remaining < 0) return true;
  if (
    license.status &&
    !["active", "trialing", "past_due"].includes(license.status)
  ) {
    return true;
  }
  return false;
}

/** True when not expired and within the warning window (default 7 days). */
export function isLicenseExpiringSoon(license) {
  if (!license || isLicenseExpired(license)) return false;
  if (license.days_remaining == null) return false;
  return license.days_remaining <= (license.warning_days ?? LICENSE_WARNING_DAYS);
}

/**
 * Platform subscriptions table: show "Extend licence" for trials, expiry, or overdue.
 * @param {object | null | undefined} sub
 * @param {ReturnType<typeof resolveOrganizationLicense> | null} license
 * @param {{ expired?: boolean, overdue?: boolean, soon?: boolean }} flags
 */
export function canExtendPlatformLicence(sub, license, { expired = false, overdue = false, soon = false } = {}) {
  if (!sub) return false;
  if (expired || overdue) return true;
  if (sub.status === "past_due" || sub.status === "expired") return true;
  if (sub.status === "trialing" || license?.is_trial) return true;
  if (soon) return true;
  return false;
}

/**
 * Platform subscriptions table: offer a free trial only when there is no healthy active licence.
 * @param {object | null | undefined} sub
 * @param {ReturnType<typeof resolveOrganizationLicense> | null} license
 * @param {{ expired?: boolean }} flags
 */
export function canStartPlatformTrial(sub, license, { expired = false } = {}) {
  if (!sub) return false;
  if (sub.status === "trialing" || license?.is_trial) return false;
  if (sub.status === "cancelled") return true;
  if (expired || sub.status === "expired") return true;
  return false;
}

export function licenseExpiryLabel(license) {
  if (!license?.expires_at) return "—";
  return formatLicenceWhen(license.expires_at);
}

function formatLicenceWhen(value) {
  const raw = String(value);
  const instant = parseLicenceInstant(raw, { dateOnly: "end" });
  if (!instant) return formatBillingDate(value);
  const date = formatBillingDate(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return date;
  const time = instant.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export function licenseWarningMessage(license) {
  if (!license) return "";
  const when = licenseExpiryLabel(license);
  const days = license.days_remaining;
  const trial = license.is_trial ? "trial " : "";
  if (days === 0) {
    return `Your Centrix ${trial}licence expires today (${when}). Renew or contact your administrator to avoid losing access.`;
  }
  if (license.status === "scheduled" && license.starts_at) {
    return `Your Centrix ${trial}licence opens at ${formatLicenceWhen(license.starts_at)}.`;
  }
  if (days === 1) {
    return `Your Centrix ${trial}licence expires tomorrow (${when}). Renew soon to keep using the system.`;
  }
  return `Your Centrix ${trial}licence expires in ${days} days (${when}). Renew before then to avoid being signed out.`;
}

export function licenseExpiredMessage(license) {
  if (license?.status === "scheduled" && license.starts_at) {
    return `This Centrix licence opens at ${formatLicenceWhen(license.starts_at)}. The rest of the system stays closed until then.`;
  }
  if (license?.status === "missing") {
    return "This organization does not have an active Centrix subscription. The system is locked until a plan is activated.";
  }
  const when = license?.expires_at ? ` (ended ${licenseExpiryLabel(license)})` : "";
  return `This organization’s Centrix licence has expired${when}. The system is locked until the licence is renewed or extended.`;
}

export function isLicenseExpiredApiCode(code) {
  return LICENSE_EXPIRED_API_CODES.includes(String(code ?? ""));
}

/** @param {unknown} error */
export function isLicenseExpiredApiError(error) {
  if (!error || typeof error !== "object") return false;
  const status = error.status;
  if (status !== 401 && status !== 403) return false;
  if (isLicenseExpiredApiCode(error.body?.code)) return true;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    msg.includes("licence expired") ||
    msg.includes("license expired") ||
    msg.includes("subscription expired") ||
    msg.includes("active centrix subscription") ||
    msg.includes("does not have an active")
  );
}

export function wasLicenseWarningDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(LICENSE_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissLicenseWarning() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LICENSE_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearLicenseWarningDismissed() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LICENSE_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}
