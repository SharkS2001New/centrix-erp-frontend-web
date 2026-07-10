"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { PLATFORM_BILLING_MODULES, DEFAULT_PLATFORM_SELLER } from "@/lib/platform-invoices";
import {
  CONTRACT_KINDS,
  CONTRACT_STATUSES,
  LICENSE_BASIS_OPTIONS,
  LICENSABLE_WORKSPACES,
  contractFormToPayload,
  emptyContractForm,
  contractRecordToForm,
  defaultKenyaPlatformContractTerms,
  formatBillingMoney,
  resolveAgreementPrices,
} from "@/lib/platform-billing";
import { buildPlatformContractHtml, printPlatformContract } from "@/lib/platform-contract-print";
import { PlatformContractViewer } from "@/components/platform/platform-contract-viewer";
import { PlatformAiEmailAssist } from "@/components/platform/platform-ai-email-assist";
import { PLATFORM_MAIL_DEFAULTS } from "@/lib/platform-mail-settings";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function ContractEditor({ contractId = null }) {
  const router = useRouter();
  const isEdit = Boolean(contractId);
  const [form, setForm] = useState(() => emptyContractForm());
  const [organizations, setOrganizations] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [savedId, setSavedId] = useState(contractId);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const loadRefs = useCallback(async () => {
    const [orgRes, planRes] = await Promise.all([
      apiRequest("/admin/organizations").catch(() => ({ data: [] })),
      apiRequest("/admin/platform-plans").catch(() => ({ data: [] })),
    ]);
    setOrganizations(orgRes.data ?? []);
    setPlans(planRes.data ?? []);
  }, []);

  const loadContract = useCallback(async () => {
    if (!contractId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/platform-contracts/${contractId}`);
      setForm(contractRecordToForm(res.data ?? res));
      setSavedId(contractId);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load contract.");
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void loadRefs();
    if (contractId) void loadContract();
  }, [contractId, loadContract, loadRefs]);

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

  function applyPlan(planId) {
    const plan = plans.find((row) => String(row.id) === String(planId));
    setForm((prev) => ({
      ...prev,
      plan_id: planId,
      license_basis: plan?.license_basis === "user" ? "user" : prev.license_basis || "org",
      amount: plan?.renewal_price != null || plan?.price != null
        ? String(plan.renewal_price ?? plan.price)
        : prev.amount,
      renewal_price:
        plan?.renewal_price != null || plan?.price != null
          ? String(plan.renewal_price ?? plan.price)
          : prev.renewal_price,
      first_payment_price:
        plan?.first_payment_price != null || plan?.price != null
          ? String(plan.first_payment_price ?? plan.price)
          : prev.first_payment_price,
      currency: plan?.currency ?? prev.currency,
      module_keys: plan?.module_keys ? [...plan.module_keys] : prev.module_keys,
      workspace_keys: plan?.workspace_keys ? [...plan.workspace_keys] : prev.workspace_keys,
      seat_count: plan?.seat_limit != null ? String(plan.seat_limit) : prev.seat_count,
      title:
        prev.title ||
        (plan ? `${plan.name} ${prev.kind === "quote" ? "quote" : "contract"}` : prev.title),
    }));
  }

  function regenerateTerms() {
    setForm((prev) => ({
      ...prev,
      terms: defaultKenyaPlatformContractTerms({
        licenseBasis: prev.license_basis,
        interval: plans.find((p) => String(p.id) === String(prev.plan_id))?.interval ?? "monthly",
        firstPayment: prev.first_payment_price || prev.amount,
        renewalPayment: prev.renewal_price || prev.amount,
        currency: prev.currency || "KES",
      }),
    }));
    notifySuccess("Kenya SaaS terms regenerated — review before sending.");
  }

  const previewRecord = useMemo(() => {
    const org = organizations.find((row) => String(row.id) === String(form.organization_id));
    const plan = plans.find((row) => String(row.id) === String(form.plan_id));
    const payload = contractFormToPayload(form);
    return {
      ...payload,
      id: savedId,
      organization: org,
      plan,
      seller: DEFAULT_PLATFORM_SELLER,
      customer_name: form.customer_name || org?.org_name,
      customer_email: form.customer_email || org?.org_email,
      customer_phone: form.customer_phone || org?.primary_tel,
      customer_address: form.customer_address || org?.org_address,
      customer_tax_pin: form.customer_tax_pin || org?.org_pin,
    };
  }, [form, organizations, plans, savedId]);

  const previewHtml = useMemo(
    () => buildPlatformContractHtml(previewRecord),
    [previewRecord],
  );

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!form.title.trim()) {
      notifyError("Enter a title.");
      return null;
    }
    setSaving(true);
    try {
      const payload = contractFormToPayload(form);
      const res = isEdit || savedId
        ? await apiRequest(`/admin/platform-contracts/${savedId || contractId}`, {
            method: "PATCH",
            body: payload,
          })
        : await apiRequest("/admin/platform-contracts", { method: "POST", body: payload });
      notifySuccess(res.message ?? "Saved.");
      const id = res.data?.id ?? savedId ?? contractId;
      if (res.data) setForm(contractRecordToForm(res.data));
      if (id) {
        setSavedId(id);
        if (!isEdit && !contractId) router.replace(`/platform/contracts/${id}`);
      }
      return id;
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function fillTemplate(template, vars) {
    return String(template ?? "").replace(/\{(\w+)\}/g, (_, key) =>
      vars[key] != null && vars[key] !== "" ? String(vars[key]) : `{${key}}`,
    );
  }

  function openEmailComposer() {
    const org = organizations.find((row) => String(row.id) === String(form.organization_id));
    const to = form.customer_email?.trim() || org?.org_email || "";
    const prices = resolveAgreementPrices(contractFormToPayload(form));
    const vars = {
      kind: form.kind === "quote" ? "quote" : "contract",
      title: form.title || "Centrix agreement",
      reference: form.reference || "—",
      customer_name: form.customer_name || org?.org_name || "Customer",
      first_payment: formatBillingMoney(prices.first_payment_price, prices.currency),
      renewal_payment: formatBillingMoney(prices.renewal_price, prices.currency),
      from_name: PLATFORM_MAIL_DEFAULTS.from_name,
    };
    setEmailTo(to);
    setEmailSubject(fillTemplate(PLATFORM_MAIL_DEFAULTS.contract_email_subject, vars));
    setEmailBody(fillTemplate(PLATFORM_MAIL_DEFAULTS.contract_email_body, vars));
    setEmailOpen(true);
  }

  async function handleSendEmail() {
    if (!emailTo.trim()) {
      notifyError("Enter a recipient email.");
      return;
    }
    let id = savedId || contractId;
    if (!id) {
      id = await handleSave();
      if (!id) return;
    }
    setEmailing(true);
    try {
      const res = await apiRequest(`/admin/platform-contracts/${id}/email`, {
        method: "POST",
        body: {
          to: emailTo.trim(),
          subject: emailSubject.trim() || undefined,
          body: emailBody.trim() || undefined,
        },
      });
      notifySuccess(res.message ?? `Sent to ${emailTo.trim()}.`);
      if (form.status === "draft") {
        setForm((f) => ({ ...f, status: "sent" }));
      }
      setEmailOpen(false);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to send email. Check Platform → Email.");
    } finally {
      setEmailing(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AppBreadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Contracts & quotes", href: "/platform/contracts" },
            { label: isEdit ? "Edit" : "New quote" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => printPlatformContract(previewRecord)}
          >
            Print / PDF
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setViewerOpen(true)}
          >
            Expand preview
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={emailing || saving}
            onClick={openEmailComposer}
          >
            Send email
          </button>
          <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <section className="theme-panel space-y-4 rounded-xl border p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <select className={inputClass} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                  {CONTRACT_KINDS.map((row) => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select className={inputClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  {CONTRACT_STATUSES.map((row) => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Title">
                  <input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                </Field>
              </div>
              <Field label="Organization (optional until provision)">
                <select
                  className={inputClass}
                  value={form.organization_id}
                  onChange={(e) => {
                    const org = organizations.find((row) => String(row.id) === e.target.value);
                    setForm((f) => ({
                      ...f,
                      organization_id: e.target.value,
                      customer_name: f.customer_name || org?.org_name || "",
                      customer_email: f.customer_email || org?.org_email || "",
                      customer_phone: f.customer_phone || org?.primary_tel || "",
                      customer_address: f.customer_address || org?.org_address || "",
                      customer_tax_pin: f.customer_tax_pin || org?.org_pin || "",
                    }));
                  }}
                >
                  <option value="">— Prospect / not provisioned —</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.org_name} ({org.company_code})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Plan">
                <select className={inputClass} value={form.plan_id} onChange={(e) => applyPlan(e.target.value)}>
                  <option value="">— Custom agreement —</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reference">
                <input className={inputClass} value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Q-2026-001" />
              </Field>
              <Field label="Licence basis">
                <select
                  className={inputClass}
                  value={form.license_basis}
                  onChange={(e) => setForm((f) => ({ ...f, license_basis: e.target.value }))}
                >
                  {LICENSE_BASIS_OPTIONS.map((row) => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="First-time payment (KES)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={form.first_payment_price}
                  onChange={(e) => setForm((f) => ({ ...f, first_payment_price: e.target.value }))}
                />
              </Field>
              <Field label="Renewal price (KES)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={form.renewal_price || form.amount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      renewal_price: e.target.value,
                      amount: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Seats">
                <input type="number" min="1" className={inputClass} value={form.seat_count} onChange={(e) => setForm((f) => ({ ...f, seat_count: e.target.value }))} />
              </Field>
              <Field label="Start date">
                <input type="date" className={inputClass} value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              </Field>
              <Field label="Valid until">
                <input type="date" className={inputClass} value={form.valid_until} onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))} />
              </Field>
              <Field label="End date">
                <input type="date" className={inputClass} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              </Field>
            </div>
          </section>

          <section className="theme-panel space-y-4 rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Customer (prospect)</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer name">
                <input className={inputClass} value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} />
              </Field>
              <Field label="Email (for send)">
                <input type="email" className={inputClass} value={form.customer_email} onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <input className={inputClass} value={form.customer_phone} onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))} />
              </Field>
              <Field label="KRA PIN">
                <input className={inputClass} value={form.customer_tax_pin} onChange={(e) => setForm((f) => ({ ...f, customer_tax_pin: e.target.value }))} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <textarea className={inputClass} rows={2} value={form.customer_address} onChange={(e) => setForm((f) => ({ ...f, customer_address: e.target.value }))} />
                </Field>
              </div>
            </div>
          </section>

          <section className="theme-panel space-y-3 rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Licensed Centrix applications</h2>
            <ul className="grid gap-1 sm:grid-cols-2">
              {LICENSABLE_WORKSPACES.map((ws) => (
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
                        <span className="ml-1 text-xs text-emerald-700">free</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="pt-2 text-xs font-medium text-slate-600">Invoice modules (optional)</p>
            <ul className="grid gap-1 sm:grid-cols-2">
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
          </section>

          <section className="theme-panel space-y-3 rounded-xl border p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Terms and conditions</h2>
              <button
                type="button"
                className="text-sm font-medium text-[#185FA5] hover:underline"
                onClick={regenerateTerms}
              >
                Regenerate Kenya SaaS terms
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Default clauses cover parties, licence, fees, VAT, Data Protection Act 2019, and Kenyan governing law. Edit freely for the commercial agreement.
            </p>
            <textarea
              className={inputClass}
              rows={14}
              value={form.terms}
              onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
            />
            <Field label="Notes">
              <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </Field>
          </section>
        </form>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <section className="theme-panel overflow-hidden rounded-xl border shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Live preview</h2>
              <p className="text-xs text-slate-500">Updates as you edit — matches print / PDF output.</p>
            </div>
            <iframe
              title="Contract preview"
              className="h-[min(80vh,900px)] w-full border-0 bg-white"
              srcDoc={previewHtml}
            />
          </section>
        </div>
      </div>

      <PlatformContractViewer
        open={viewerOpen}
        contract={previewRecord}
        expanded
        onClose={() => setViewerOpen(false)}
      />

      {emailOpen ? (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="theme-modal max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-900">Send contract / quote email</h2>
            <p className="mt-1 text-xs text-slate-500">
              Edit the message, optionally improve it with platform AI, then send via Platform → Email SMTP.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
                <input
                  type="email"
                  className={inputClass}
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
              </label>
              <PlatformAiEmailAssist
                subject={emailSubject}
                body={emailBody}
                onApply={({ subject, body }) => {
                  setEmailSubject(subject);
                  setEmailBody(body);
                }}
              />
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Subject</span>
                <input
                  className={inputClass}
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Body</span>
                <textarea
                  className={inputClass}
                  rows={10}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => setEmailOpen(false)}
              >
                Cancel
              </button>
              <PrimaryButton type="button" showIcon={false} disabled={emailing} onClick={() => void handleSendEmail()}>
                {emailing ? "Sending…" : "Send now"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PlatformContractEditorPage({ contractId = null }) {
  return (
    <CatalogPageShell
      title={contractId ? "Edit contract / quote" : "New quote"}
      subtitle="Kenya-aligned commercial terms, live preview, PDF print, and email via Platform → Email."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Contracts & quotes", href: "/platform/contracts" },
          { label: contractId ? "Edit" : "New" },
        ]}
      />
      <ContractEditor contractId={contractId} />
    </CatalogPageShell>
  );
}
