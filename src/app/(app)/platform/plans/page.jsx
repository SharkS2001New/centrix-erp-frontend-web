"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton, SECONDARY_BTN_CLASS, SearchableSelect } from "@/components/catalog/catalog-shared";
import { PLATFORM_BILLING_MODULES } from "@/lib/platform-invoices";
import {
  LICENSE_BASIS_OPTIONS,
  PLAN_INTERVALS,
  emptyPlanForm,
  formatBillingMoney,
  licenseBasisLabel,
  licensableWorkspacesForIndustry,
  planFormToPayload,
  planModuleLabels,
  planRecordToForm,
  workspaceLabels,
} from "@/lib/platform-billing";
import { useConfirm } from "@/lib/use-confirm";
import { BACKOFFICE_SECTION_CATALOG } from "@/lib/backoffice-sections";
import { INDUSTRIES, industryById } from "@/lib/erp-industries";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export default function PlatformPlansPage() {
  const confirm = useConfirm();
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(() => emptyPlanForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, tplRes] = await Promise.all([
        apiRequest("/admin/platform-plans"),
        apiRequest("/admin/platform-invoices/saved-templates").catch(() => ({ data: [] })),
      ]);
      setPlans((plansRes.data ?? []).filter((plan) => !plan.self_serve));
      setTemplates(tplRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load plans.");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyPlanForm());
    setFormOpen(true);
  }

  function openEdit(plan) {
    setEditingId(plan.id);
    setForm(planRecordToForm(plan));
    setFormOpen(true);
  }

  function toggleModule(key) {
    setForm((prev) => {
      const set = new Set(prev.module_keys ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, module_keys: [...set] };
    });
  }

  function toggleWorkspace(id) {
    setForm((prev) => {
      const set = new Set(prev.workspace_keys ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, workspace_keys: [...set] };
    });
  }

  function toggleSection(key) {
    setForm((prev) => {
      const set = new Set(prev.section_keys ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, section_keys: [...set] };
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      notifyError("Enter a plan name.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...planFormToPayload(form), self_serve: false };
      if (editingId) {
        await apiRequest(`/admin/platform-plans/${editingId}`, { method: "PATCH", body: payload });
        notifySuccess("Plan updated.");
      } else {
        await apiRequest("/admin/platform-plans", { method: "POST", body: payload });
        notifySuccess("Plan created.");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plan) {
    const ok = await confirm({
      title: "Delete plan?",
      message: `Delete “${plan.name}”? Existing subscriptions keep their historical plan name.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/admin/platform-plans/${plan.id}`, { method: "DELETE" });
      notifySuccess("Plan deleted.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to delete plan.");
    }
  }

  return (
    <CatalogPageShell
      title="Subscription plans"
      subtitle="Each industry has its own packages. Set the monthly and yearly prices here. An organisation only sees the packages for its industry."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={loading} onClick={() => void load()}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <PrimaryButton type="button" onClick={openCreate}>
            New plan
          </PrimaryButton>
        </div>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Plans" }]} />

      <div className="theme-panel rounded-xl border shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading plans…</p>
        ) : plans.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            <p>No plans yet. Create packages like “Retail Starter” or “Wholesale Pro”.</p>
            <button type="button" className="mt-3 font-medium text-[#185FA5] hover:underline" onClick={openCreate}>
              Create first plan
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Industry</th>
                  <th className="px-5 py-3">Licence</th>
                  <th className="px-5 py-3">First / renewal</th>
                  <th className="px-5 py-3">Apps</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((plan) => {
                  const first = plan.first_payment_price ?? plan.price;
                  const renewal = plan.renewal_price ?? plan.price;
                  return (
                    <tr key={plan.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{plan.name}</p>
                        {plan.code ? <p className="font-mono text-xs text-slate-500">{plan.code}</p> : null}
                        <p className="text-xs capitalize text-slate-500">{plan.interval ?? "—"}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {industryById(plan.industry || "commerce")?.label ?? "Retail & Distribution"}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {licenseBasisLabel(plan.license_basis)}
                        {plan.seat_limit != null ? (
                          <span className="block text-xs text-slate-500">{plan.seat_limit} seats</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-slate-700">
                        <span className="block">{formatBillingMoney(first, plan.currency)}</span>
                        <span className="block text-xs text-slate-500">
                          then {formatBillingMoney(renewal, plan.currency)}
                          {plan.interval ? ` / ${plan.interval}` : ""}
                        </span>
                        {plan.monthly_price != null || plan.yearly_price != null || plan.token_pack_price != null ? (
                          <span className="mt-1 block text-xs text-slate-500">
                            Paybill{" "}
                            {plan.monthly_price != null ? `M ${formatBillingMoney(plan.monthly_price, plan.currency)}` : ""}
                            {plan.yearly_price != null ? ` · Y ${formatBillingMoney(plan.yearly_price, plan.currency)}` : ""}
                            {plan.token_pack_price != null
                              ? ` · Token ${formatBillingMoney(plan.token_pack_price, plan.currency)}/${plan.token_pack_days ?? "?"}d`
                              : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {workspaceLabels(plan.workspace_keys).slice(0, 3).join(", ") ||
                          planModuleLabels(plan.module_keys).slice(0, 3).join(", ") ||
                          "—"}
                        {(plan.workspace_keys?.length ?? plan.module_keys?.length ?? 0) > 3 ? "…" : ""}
                      </td>
                      <td className="px-5 py-3">
                        {plan.is_active === false ? (
                          <span className="text-amber-700">Inactive</span>
                        ) : (
                          <span className="text-emerald-700">Active</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="text-sm font-medium text-[#185FA5] hover:underline"
                            onClick={() => openEdit(plan)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-sm font-medium text-red-600 hover:underline"
                            onClick={() => void handleDelete(plan)}
                          >
                            Delete
                          </button>
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

      <p className="mt-4 text-xs text-slate-500">
        After plans exist, assign them under{" "}
        <Link href="/platform/subscriptions" className="font-medium text-[#185FA5] hover:underline">
          Subscriptions
        </Link>{" "}
        and convert accepted{" "}
        <Link href="/platform/contracts" className="font-medium text-[#185FA5] hover:underline">
          quotes/contracts
        </Link>{" "}
        into the first invoice. Tenant admins see first-time and renewal prices on Company profile.
      </p>

      {formOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4">
          <form
            onSubmit={(e) => void handleSave(e)}
            className="theme-modal max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border p-6 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-slate-900">{editingId ? "Edit plan" : "New plan"}</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Code</span>
                  <input className={inputClass} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="RETAIL-M" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Interval</span>
                  <SearchableSelect
  className={inputClass}
  value={form.interval}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, interval: e.target.value })))}
  options={PLAN_INTERVALS.map((row) => ({ value: row.id, label: row.label }))}
/>
                </label>
              </div>
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-slate-600">Licence basis</legend>
                <div className="space-y-2">
                  {LICENSE_BASIS_OPTIONS.map((row) => (
                    <label key={row.id} className="flex cursor-pointer gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="radio"
                        name="license_basis"
                        checked={form.license_basis === row.id}
                        onChange={() => setForm((f) => ({ ...f, license_basis: row.id }))}
                      />
                      <span>
                        <span className="font-medium text-slate-900">{row.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{row.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">First-time payment (KES)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass}
                    value={form.first_payment_price}
                    onChange={(e) => setForm((f) => ({ ...f, first_payment_price: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Renewal price (KES)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass}
                    value={form.renewal_price || form.price}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        renewal_price: e.target.value,
                        price: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Monthly Paybill (KES)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass}
                    value={form.monthly_price}
                    onChange={(e) => setForm((f) => ({ ...f, monthly_price: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Yearly Paybill (KES)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass}
                    value={form.yearly_price}
                    onChange={(e) => setForm((f) => ({ ...f, yearly_price: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Token pack (KES)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass}
                    value={form.token_pack_price}
                    onChange={(e) => setForm((f) => ({ ...f, token_pack_price: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Token pack days</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={inputClass}
                    value={form.token_pack_days}
                    onChange={(e) => setForm((f) => ({ ...f, token_pack_days: e.target.value }))}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Customers pay these amounts on the Centrix Paybill. The account number is the organisation code or the admin phone. A payment that is not the monthly or yearly price becomes tokens: 500 KES is 500 tokens. Create, update, and delete spend the token amounts on Token & usage policies. Reading is free.
              </p>
              {form.license_basis === "user" ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Seat limit</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={inputClass}
                    value={form.seat_limit}
                    onChange={(e) => setForm((f) => ({ ...f, seat_limit: e.target.value }))}
                    placeholder="Unlimited"
                  />
                </label>
              ) : null}
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Industry</span>
                <SearchableSelect
                  className={inputClass}
                  value={form.industry || "commerce"}
                  nativeEvent
                  onChange={(e) => {
                    const industry = e.target.value;
                    const allowed = new Set(licensableWorkspacesForIndustry(industry).map((ws) => ws.id));
                    setForm((f) => ({
                      ...f,
                      industry,
                      workspace_keys: (f.workspace_keys ?? []).filter((id) => allowed.has(id)),
                      section_keys: industry === "commerce" ? f.section_keys : [],
                    }));
                  }}
                  options={INDUSTRIES.map((item) => ({ value: item.id, label: item.label }))}
                />
                <span className="mt-1 block text-xs text-slate-500">This package and its prices are only offered to organisations in this industry.</span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Description</span>
                <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Plan card button text</span>
                <input
                  className={inputClass}
                  maxLength={48}
                  value={form.cta_label}
                  onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))}
                  placeholder="Pay Now"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Optional, up to 48 characters. Leave blank to use “Pay Now”.
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Auto-draft invoice template</span>
                <SearchableSelect
  className={inputClass}
  value={form.auto_invoice_template_id}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, auto_invoice_template_id: e.target.value })))}
  options={templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
/>
              </label>
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600">
                  Applications for {industryById(form.industry || "commerce")?.label ?? "this industry"}
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {licensableWorkspacesForIndustry(form.industry || "commerce").map((ws) => (
                    <li key={ws.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={(form.workspace_keys ?? []).includes(ws.id)}
                          onChange={() => toggleWorkspace(ws.id)}
                        />
                        <span>
                          <span className="font-medium">{ws.label}</span>
                          {ws.id === "admin" ? (
                            <span className="ml-1 text-xs text-emerald-700">(included free)</span>
                          ) : null}
                          <span className="mt-0.5 block text-xs text-slate-500">{ws.description}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-slate-600">Invoice billing modules (optional detail)</p>
                <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {PLATFORM_BILLING_MODULES.filter((m) => !m.free).map((mod) => (
                    <li key={mod.key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={(form.module_keys ?? []).includes(mod.key)}
                          onChange={() => toggleModule(mod.key)}
                        />
                        {mod.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">What this plan includes</p>
                <p className="mb-2 text-xs text-slate-500">
                  These lines are what the organisation sees when they choose a plan. Add a short name and a sentence of detail.
                </p>
                <div className="space-y-2">
                  {(form.feature_details ?? []).map((row, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                      <input
                        className={inputClass}
                        value={row.label}
                        placeholder="Sales & orders"
                        onChange={(e) =>
                          setForm((f) => {
                            const next = [...(f.feature_details ?? [])];
                            next[index] = { ...next[index], label: e.target.value };
                            return { ...f, feature_details: next };
                          })
                        }
                      />
                      <input
                        className={inputClass}
                        value={row.detail}
                        placeholder="Orders, invoices, and the sales reports that belong to them"
                        onChange={(e) =>
                          setForm((f) => {
                            const next = [...(f.feature_details ?? [])];
                            next[index] = { ...next[index], detail: e.target.value };
                            return { ...f, feature_details: next };
                          })
                        }
                      />
                      <button
                        type="button"
                        className="rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            feature_details: (f.feature_details ?? []).filter((_, i) => i !== index),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 text-sm font-medium text-[#185FA5]"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      feature_details: [...(f.feature_details ?? []), { label: "", detail: "" }],
                    }))
                  }
                >
                  Add a feature
                </button>
              </div>
              {(form.industry || "commerce") === "commerce" ? <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Backoffice sections this plan turns on</p>
                <p className="mb-2 text-xs text-slate-500">
                  Leave all of these off to keep the organisation&apos;s current sections. Checked sections are the only Backoffice areas this plan opens, including their reports.
                </p>
                <ul className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {BACKOFFICE_SECTION_CATALOG.map((section) => (
                    <li key={section.key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={(form.section_keys ?? []).includes(section.key)}
                          onChange={() => toggleSection(section.key)}
                        />
                        {section.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div> : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active !== false}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Plan is active (can be assigned to tenants)
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <PrimaryButton type="submit" showIcon={false} disabled={saving}>
                {saving ? "Saving…" : "Save plan"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
