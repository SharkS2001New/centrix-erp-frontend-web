/**
 * Organization licence / subscription expiry for Centrix web + mobile clients.
 *
 * Backend contract (login, capabilities, and every authenticated API):
 * - Include `license` (or `subscription`) on `/auth/login` and `/erp/capabilities`.
 * - When expired: reject login and revoke active sessions with HTTP 401/403 and
 *   `code` one of LICENSE_EXPIRED_API_CODES (all users, including mobile apps).
 * - Mobile apps must treat the same codes as hard logout / block sign-in.
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

function parseDateEnd(value) {
  if (!value) return null;
  const raw = String(value);
  const d = new Date(raw.includes("T") ? raw : `${raw.slice(0, 10)}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d;
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
  const end = parseDateEnd(expiresAt);
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
    daysRemaining != null &&
    daysRemaining < 0
  ) {
    status = "expired";
  }

  const isTrial = Boolean(raw.is_trial || status === "trialing");

  return {
    status: status || (end ? "active" : "missing"),
    expires_at: expiresAt ? String(expiresAt).slice(0, 10) : null,
    expires_at_raw: expiresAt,
    is_trial: isTrial,
    days_remaining: daysRemaining,
    warning_days: warningDays,
    plan_name: raw.plan?.name ?? raw.plan_name ?? null,
  };
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

export function licenseExpiryLabel(license) {
  if (!license?.expires_at) return "—";
  return formatBillingDate(license.expires_at);
}

export function licenseWarningMessage(license) {
  if (!license) return "";
  const when = licenseExpiryLabel(license);
  const days = license.days_remaining;
  const trial = license.is_trial ? "trial " : "";
  if (days === 0) {
    return `Your Centrix ${trial}licence expires today (${when}). Renew or contact your administrator to avoid losing access.`;
  }
  if (days === 1) {
    return `Your Centrix ${trial}licence expires tomorrow (${when}). Renew soon to keep using the system.`;
  }
  return `Your Centrix ${trial}licence expires in ${days} days (${when}). Renew before then to avoid being signed out.`;
}

export function licenseExpiredMessage(license) {
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
