"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  FilterSelect,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_STYLES,
  formatBillingDate,
  formatBillingMoney,
  isSubscriptionOverdue,
  licenseBasisLabel,
  resolveAgreementPrices,
  subscriptionStatusLabel,
} from "@/lib/platform-billing";
import {
  addCalendarDays,
  resolveOrganizationLicense,
  isLicenseExpired,
  isLicenseExpiringSoon,
} from "@/lib/organization-license";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const TRIAL_PRESETS = [7, 14, 30];
const EXTEND_PRESETS = [7, 14, 30, 90];

function emptyAssignForm() {
  return {
    organization_id: "",
    plan_id: "",
    status: "active",
    seat_count: "1",
    current_period_start: new Date().toISOString().slice(0, 10),
    current_period_end: "",
    trial_days: "14",
    invoice_id: "",
  };
}

function invoiceOptionLabel(inv) {
  const number = inv.invoice_number || `#${inv.id}`;
  const total = formatBillingMoney(inv.total, inv.currency);
  const status = inv.status ? String(inv.status) : "draft";
  return `${number} · ${total} · ${status}`;
}

export default function PlatformSubscriptionsPage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [plans, setPlans] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [orgInvoices, setOrgInvoices] = useState([]);
  const [loadingOrgInvoices, setLoadingOrgInvoices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignOpen, setAssignOpen] = useState(false);
  const [extendTarget, setExtendTarget] = useState(null);
  const [attachTarget, setAttachTarget] = useState(null);
  const [attachInvoiceId, setAttachInvoiceId] = useState("");
  const [extendDays, setExtendDays] = useState("30");
  const [extendUntil, setExtendUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => emptyAssignForm());

  const loadOrgInvoices = useCallback(async (organizationId) => {
    if (!organizationId) {
      setOrgInvoices([]);
      return;
    }
    setLoadingOrgInvoices(true);
    try {
      const res = await apiRequest("/admin/platform-invoices", {
        searchParams: { organization_id: organizationId },
        loading: false,
      });
      setOrgInvoices(res.data ?? []);
    } catch {
      setOrgInvoices([]);
    } finally {
      setLoadingOrgInvoices(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, planRes, orgRes] = await Promise.all([
        apiRequest("/admin/platform-subscriptions", {
          searchParams: statusFilter !== "all" ? { status: statusFilter } : {},
        }),
        apiRequest("/admin/platform-plans").catch(() => ({ data: [] })),
        apiRequest("/admin/organizations").catch(() => ({ data: [] })),
      ]);
      setRows(subRes.data ?? []);
      setPlans((planRes.data ?? []).filter((p) => p.is_active !== false));
      setOrganizations(orgRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load subscriptions.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (assignOpen) {
      void loadOrgInvoices(form.organization_id);
    }
  }, [assignOpen, form.organization_id, loadOrgInvoices]);

  useEffect(() => {
    if (attachTarget?.organization_id) {
      void loadOrgInvoices(attachTarget.organization_id);
    }
  }, [attachTarget, loadOrgInvoices]);

  function applyTrialDays(days, start = form.current_period_start) {
    const n = Number(days) || 14;
    setForm((f) => ({
      ...f,
      status: "trialing",
      trial_days: String(n),
      current_period_end: addCalendarDays(start || undefined, n),
    }));
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!form.organization_id || !form.plan_id) {
      notifyError("Select organization and plan.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/admin/platform-subscriptions", {
        method: "POST",
        body: {
          organization_id: Number(form.organization_id),
          plan_id: Number(form.plan_id),
          status: form.status,
          seat_count: Number(form.seat_count) || 1,
          current_period_start: form.current_period_start || null,
          current_period_end: form.current_period_end || null,
          is_trial: form.status === "trialing",
          trial_days: form.status === "trialing" ? Number(form.trial_days) || 14 : null,
          invoice_id: form.invoice_id ? Number(form.invoice_id) : null,
        },
      });
      notifySuccess(form.status === "trialing" ? "Free trial started." : "Subscription assigned.");
      setAssignOpen(false);
      setForm(emptyAssignForm());
      setOrgInvoices([]);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to assign subscription.");
    } finally {
      setSaving(false);
    }
  }

  function openExtend(sub) {
    const end = sub.current_period_end?.slice?.(0, 10) ?? sub.current_period_end ?? "";
    setExtendTarget(sub);
    setExtendDays("30");
    setExtendUntil(end ? addCalendarDays(end, 30) : addCalendarDays(undefined, 30));
  }

  function openAttachInvoice(sub) {
    setAttachTarget(sub);
    setAttachInvoiceId(sub.invoice_id ? String(sub.invoice_id) : sub.invoice?.id ? String(sub.invoice.id) : "");
  }

  async function handleAttachInvoice(e) {
    e.preventDefault();
    if (!attachTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/admin/platform-subscriptions/${attachTarget.id}`, {
        method: "PATCH",
        body: {
          invoice_id: attachInvoiceId ? Number(attachInvoiceId) : null,
        },
      });
      notifySuccess(attachInvoiceId ? "Invoice attached." : "Invoice detached.");
      setAttachTarget(null);
      setAttachInvoiceId("");
      setOrgInvoices([]);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to attach invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExtend(e) {
    e.preventDefault();
    if (!extendTarget) return;
    const until = extendUntil || addCalendarDays(extendTarget.current_period_end, Number(extendDays) || 30);
    setSaving(true);
    try {
      await apiRequest(`/admin/platform-subscriptions/${extendTarget.id}/extend`, {
        method: "POST",
        body: {
          days: Number(extendDays) || null,
          current_period_end: until,
          status:
            extendTarget.status === "expired" || extendTarget.status === "cancelled"
              ? "active"
              : extendTarget.status === "trialing"
                ? "trialing"
                : "active",
        },
      }).catch(async () =>
        apiRequest(`/admin/platform-subscriptions/${extendTarget.id}`, {
          method: "PATCH",
          body: {
            current_period_end: until,
            status:
              extendTarget.status === "expired" || extendTarget.status === "past_due"
                ? "active"
                : extendTarget.status,
          },
        }),
      );
      notifySuccess(`Licence extended to ${formatBillingDate(until)}. Users can sign in again.`);
      setExtendTarget(null);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to extend licence.");
    } finally {
      setSaving(false);
    }
  }

  async function startTrialOnRow(sub) {
    const until = addCalendarDays(undefined, 14);
    setSaving(true);
    try {
      await apiRequest(`/admin/platform-subscriptions/${sub.id}`, {
        method: "PATCH",
        body: {
          status: "trialing",
          is_trial: true,
          current_period_start: new Date().toISOString().slice(0, 10),
          current_period_end: until,
          trial_ends_at: until,
        },
      });
      notifySuccess(`14-day free trial set until ${formatBillingDate(until)}.`);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to start trial.");
    } finally {
      setSaving(false);
    }
  }

  async function draftInvoice(sub) {
    try {
      const res = await apiRequest(`/admin/platform-subscriptions/${sub.id}/draft-invoice`, {
        method: "POST",
      });
      notifySuccess(res.message ?? "Draft invoice created.");
      if (res.data?.id) {
        router.push(`/platform/invoices/${res.data.id}`);
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not draft invoice.");
    }
  }

  async function setStatus(sub, status) {
    try {
      await apiRequest(`/admin/platform-subscriptions/${sub.id}`, {
        method: "PATCH",
        body: { status },
      });
      notifySuccess("Subscription updated.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to update subscription.");
    }
  }

  return (
    <CatalogPageShell
      title="Subscriptions"
      subtitle="Assign plans, start free trials, extend licences. Expired orgs are locked out on web and mobile until extended."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={loading} onClick={() => void load()}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link
            href="/platform/plans"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Plans
          </Link>
          <PrimaryButton
            type="button"
            onClick={() => {
              setForm(emptyAssignForm());
              setAssignOpen(true);
            }}
          >
            Assign / trial
          </PrimaryButton>
        </div>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Subscriptions" }]} />

      <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Within 7 days of expiry, users see a warning on every login. After expiry the API must revoke sessions
        and block sign-in (web + mobile) until you extend the licence here.
      </p>

      <div className="mb-4">
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            ...SUBSCRIPTION_STATUSES.map((row) => ({ value: row.id, label: row.label })),
          ]}
        />
      </div>

      <div className="theme-panel rounded-xl border shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading subscriptions…</p>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            <p>No subscriptions yet. Create a plan, then assign it or start a free trial.</p>
            <div className="mt-3 flex justify-center gap-3">
              <Link href="/platform/plans" className="font-medium text-[#185FA5] hover:underline">
                Manage plans
              </Link>
              <button
                type="button"
                className="font-medium text-[#185FA5] hover:underline"
                onClick={() => {
                  setForm({ ...emptyAssignForm(), status: "trialing", trial_days: "14" });
                  setAssignOpen(true);
                }}
              >
                Start free trial
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Period / expiry</th>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Seats</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((sub) => {
                  const overdue = isSubscriptionOverdue(sub);
                  const license = resolveOrganizationLicense(sub);
                  const expired = isLicenseExpired(license) || sub.status === "expired";
                  const soon = isLicenseExpiringSoon(license);
                  const status = expired ? "expired" : overdue ? "past_due" : sub.status;
                  return (
                    <tr key={sub.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">
                          {sub.organization?.org_name ?? "—"}
                        </p>
                        {sub.organization?.company_code ? (
                          <p className="font-mono text-xs text-slate-500">{sub.organization.company_code}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-slate-800">{sub.plan?.name ?? "—"}</p>
                        {(() => {
                          const prices = resolveAgreementPrices(sub);
                          return (
                            <p className="text-xs text-slate-500">
                              First {formatBillingMoney(prices.first_payment_price, prices.currency)}
                              {" · "}
                              Renewal {formatBillingMoney(prices.renewal_price, prices.currency)}
                              {prices.interval ? ` / ${prices.interval}` : ""}
                              <span className="block">{licenseBasisLabel(prices.license_basis)}</span>
                            </p>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {formatBillingDate(sub.current_period_start)} → {formatBillingDate(sub.current_period_end)}
                        {license?.days_remaining != null ? (
                          <span
                            className={`mt-1 block text-xs ${
                              expired
                                ? "font-medium text-red-700"
                                : soon
                                  ? "font-medium text-amber-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {expired
                              ? "Expired — org locked"
                              : license.days_remaining === 0
                                ? "Expires today"
                                : `${license.days_remaining} day${license.days_remaining === 1 ? "" : "s"} left`}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {sub.invoice?.id || sub.invoice_id ? (
                          <Link
                            href={`/platform/invoices/${sub.invoice?.id ?? sub.invoice_id}`}
                            className="font-medium text-[#185FA5] hover:underline"
                          >
                            {sub.invoice?.invoice_number || `Invoice #${sub.invoice?.id ?? sub.invoice_id}`}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{sub.seat_count ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${SUBSCRIPTION_STATUS_STYLES[status] ?? SUBSCRIPTION_STATUS_STYLES.active}`}
                        >
                          {expired
                            ? "Expired"
                            : overdue
                              ? "Overdue"
                              : subscriptionStatusLabel(sub.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <button
                            type="button"
                            className="text-sm font-medium text-[#185FA5] hover:underline"
                            onClick={() => openExtend(sub)}
                          >
                            Extend licence
                          </button>
                          {sub.status !== "trialing" ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-sky-700 hover:underline"
                              disabled={saving}
                              onClick={() => void startTrialOnRow(sub)}
                            >
                              Start 14-day trial
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="text-xs font-medium text-indigo-700 hover:underline"
                            onClick={() => openAttachInvoice(sub)}
                          >
                            {sub.invoice?.id || sub.invoice_id ? "Change invoice" : "Attach invoice"}
                          </button>
                          <button
                            type="button"
                            className="text-xs text-slate-600 hover:underline"
                            onClick={() => void draftInvoice(sub)}
                          >
                            Draft next invoice
                          </button>
                          {sub.organization_id ? (
                            <Link
                              href={`/platform/organizations/${sub.organization_id}`}
                              className="text-xs text-slate-600 hover:underline"
                            >
                              Open organization
                            </Link>
                          ) : null}
                          {sub.status !== "cancelled" ? (
                            <button
                              type="button"
                              className="text-xs text-red-600 hover:underline"
                              onClick={() => void setStatus(sub, "cancelled")}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {assignOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4">
          <form
            onSubmit={(e) => void handleAssign(e)}
            className="theme-modal max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border p-6 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-slate-900">Assign plan or free trial</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Organization</span>
                <select
                  className={inputClass}
                  value={form.organization_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      organization_id: e.target.value,
                      invoice_id: "",
                    }))
                  }
                >
                  <option value="">— Select —</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.org_name} ({org.company_code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Invoice (optional)
                </span>
                <select
                  className={inputClass}
                  value={form.invoice_id}
                  disabled={!form.organization_id || loadingOrgInvoices}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_id: e.target.value }))}
                >
                  <option value="">
                    {!form.organization_id
                      ? "Select organization first"
                      : loadingOrgInvoices
                        ? "Loading invoices…"
                        : orgInvoices.length === 0
                          ? "No invoices for this org"
                          : "— None —"}
                  </option>
                  {orgInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {invoiceOptionLabel(inv)}
                    </option>
                  ))}
                </select>
                {form.organization_id ? (
                  <Link
                    href={`/platform/invoices/new?organization=${form.organization_id}`}
                    className="mt-1 inline-block text-xs font-medium text-[#185FA5] hover:underline"
                  >
                    Create invoice for this org
                  </Link>
                ) : null}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Plan</span>
                <select
                  className={inputClass}
                  value={form.plan_id}
                  onChange={(e) => setForm((f) => ({ ...f, plan_id: e.target.value }))}
                >
                  <option value="">— Select —</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · first{" "}
                      {formatBillingMoney(plan.first_payment_price ?? plan.price, plan.currency)} · renew{" "}
                      {formatBillingMoney(plan.renewal_price ?? plan.price, plan.currency)}/
                      {plan.interval}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Seats</span>
                  <input
                    type="number"
                    min="1"
                    className={inputClass}
                    value={form.seat_count}
                    onChange={(e) => setForm((f) => ({ ...f, seat_count: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
                  <select
                    className={inputClass}
                    value={form.status}
                    onChange={(e) => {
                      const status = e.target.value;
                      if (status === "trialing") {
                        applyTrialDays(form.trial_days || 14);
                      } else {
                        setForm((f) => ({ ...f, status }));
                      }
                    }}
                  >
                    {SUBSCRIPTION_STATUSES.filter((row) => row.id !== "expired").map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {form.status === "trialing" ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-600">Free trial length</p>
                  <div className="flex flex-wrap gap-2">
                    {TRIAL_PRESETS.map((days) => (
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
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Period start</span>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.current_period_start}
                    onChange={(e) => {
                      const start = e.target.value;
                      setForm((f) => {
                        if (f.status !== "trialing") {
                          return { ...f, current_period_start: start };
                        }
                        return {
                          ...f,
                          current_period_start: start,
                          current_period_end: addCalendarDays(start || undefined, Number(f.trial_days) || 14),
                        };
                      });
                    }}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Period end / expiry</span>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.current_period_end}
                    onChange={(e) => setForm((f) => ({ ...f, current_period_end: e.target.value }))}
                  />
                </label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setAssignOpen(false)}>
                Cancel
              </button>
              <PrimaryButton type="submit" showIcon={false} disabled={saving}>
                {saving ? "Saving…" : form.status === "trialing" ? "Start trial" : "Assign"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}

      {extendTarget ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4">
          <form
            onSubmit={(e) => void handleExtend(e)}
            className="theme-modal w-full max-w-md rounded-xl border p-6 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-slate-900">Extend licence</h2>
            <p className="mt-1 text-sm text-slate-500">
              {extendTarget.organization?.org_name ?? "Organization"} · current end{" "}
              {formatBillingDate(extendTarget.current_period_end)}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="mb-2 text-xs font-medium text-slate-600">Add days from current end</p>
                <div className="flex flex-wrap gap-2">
                  {EXTEND_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        String(extendDays) === String(days)
                          ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        setExtendDays(String(days));
                        setExtendUntil(
                          addCalendarDays(extendTarget.current_period_end || undefined, days),
                        );
                      }}
                    >
                      +{days} days
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">New expiry date</span>
                <input
                  type="date"
                  className={inputClass}
                  value={extendUntil}
                  onChange={(e) => setExtendUntil(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => setExtendTarget(null)}
              >
                Cancel
              </button>
              <PrimaryButton type="submit" showIcon={false} disabled={saving}>
                {saving ? "Saving…" : "Extend"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}

      {attachTarget ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4">
          <form
            onSubmit={(e) => void handleAttachInvoice(e)}
            className="theme-modal w-full max-w-md rounded-xl border p-6 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-slate-900">Attach invoice</h2>
            <p className="mt-1 text-sm text-slate-500">
              {attachTarget.organization?.org_name ?? "Organization"} — choose an invoice for this
              organization.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Invoice</span>
                <select
                  className={inputClass}
                  value={attachInvoiceId}
                  disabled={loadingOrgInvoices}
                  onChange={(e) => setAttachInvoiceId(e.target.value)}
                >
                  <option value="">
                    {loadingOrgInvoices
                      ? "Loading invoices…"
                      : orgInvoices.length === 0
                        ? "No invoices for this org"
                        : "— None —"}
                  </option>
                  {orgInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {invoiceOptionLabel(inv)}
                    </option>
                  ))}
                </select>
              </label>
              {attachTarget.organization_id ? (
                <Link
                  href={`/platform/invoices/new?organization=${attachTarget.organization_id}`}
                  className="inline-block text-xs font-medium text-[#185FA5] hover:underline"
                >
                  Create invoice for this org
                </Link>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  setAttachTarget(null);
                  setAttachInvoiceId("");
                  setOrgInvoices([]);
                }}
              >
                Cancel
              </button>
              <PrimaryButton type="submit" showIcon={false} disabled={saving || loadingOrgInvoices}>
                {saving ? "Saving…" : attachInvoiceId ? "Attach" : "Clear"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
