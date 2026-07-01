"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  PLATFORM_INVOICE_DESIGN_TEMPLATES,
  PLATFORM_INVOICE_STATUSES,
  calculateInvoiceTotals,
  emptyPlatformInvoiceForm,
  invoiceFormToPayload,
  invoiceRecordToForm,
  lineItemFromModuleSummary,
  recalcLineItemAmount,
} from "@/lib/platform-invoices";
import { buildPlatformInvoiceHtml, printPlatformInvoice } from "@/lib/platform-invoice-print";

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function PlatformInvoiceEditor({ invoiceId = null, onSaved }) {
  const isEdit = Boolean(invoiceId);
  const [form, setForm] = useState(() => emptyPlatformInvoiceForm());
  const [organizations, setOrganizations] = useState([]);
  const [moduleSummaries, setModuleSummaries] = useState([]);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");

  const totals = useMemo(
    () => calculateInvoiceTotals(form.line_items, form.tax_rate),
    [form.line_items, form.tax_rate],
  );

  const previewHtml = useMemo(() => buildPlatformInvoiceHtml({ ...form, ...totals }), [form, totals]);

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/organizations");
      setOrganizations(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load organizations.");
    }
  }, []);

  const loadSavedTemplates = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/platform-invoices/saved-templates");
      setSavedTemplates(res.data ?? []);
    } catch {
      setSavedTemplates([]);
    }
  }, []);

  const loadBillingContext = useCallback(async (organizationId) => {
    try {
      const query = organizationId ? `?organization_id=${organizationId}` : "";
      const res = await apiRequest(`/admin/platform-invoices/billing-context${query}`);
      const summaries = res.module_summaries ?? [];
      setModuleSummaries(summaries);
      if (res.bill_to) {
        setForm((prev) => ({
          ...prev,
          bill_to_name: res.bill_to.name ?? prev.bill_to_name,
          bill_to_email: res.bill_to.email ?? prev.bill_to_email,
          bill_to_phone: res.bill_to.phone ?? prev.bill_to_phone,
          bill_to_address: res.bill_to.address ?? prev.bill_to_address,
          bill_to_tax_pin: res.bill_to.tax_pin ?? prev.bill_to_tax_pin,
          bill_to_company_code: res.bill_to.company_code ?? prev.bill_to_company_code,
          seller: res.seller ?? prev.seller,
        }));
      }
      return summaries;
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load billing context.");
      return [];
    }
  }, []);

  const loadInvoice = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/platform-invoices/${invoiceId}`);
      const record = res.data;
      setForm(invoiceRecordToForm(record));
      await loadBillingContext(record.organization_id ?? "");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load invoice.");
    } finally {
      setLoading(false);
    }
  }, [invoiceId, loadBillingContext]);

  useEffect(() => {
    void loadOrganizations();
    void loadSavedTemplates();
    if (!invoiceId) {
      void loadBillingContext("");
    } else {
      void loadInvoice();
    }
  }, [invoiceId, loadBillingContext, loadInvoice, loadOrganizations, loadSavedTemplates]);

  function updateForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleOrganizationChange(organizationId) {
    updateForm({ organization_id: organizationId, selected_modules: [], line_items: [] });
    await loadBillingContext(organizationId || "");
  }

  function toggleModule(summary, checked) {
    setForm((prev) => {
      const selected = new Set(prev.selected_modules ?? []);
      let lineItems = [...(prev.line_items ?? [])];
      if (checked) {
        selected.add(summary.key);
        if (!lineItems.some((row) => row.module_key === summary.key)) {
          lineItems.push(lineItemFromModuleSummary(summary, true));
        } else {
          lineItems = lineItems.map((row) =>
            row.module_key === summary.key ? { ...row, included: true } : row,
          );
        }
      } else {
        selected.delete(summary.key);
        lineItems = lineItems.map((row) =>
          row.module_key === summary.key ? { ...row, included: false } : row,
        );
      }
      return { ...prev, selected_modules: [...selected], line_items: lineItems };
    });
  }

  function updateLineItem(index, patch) {
    setForm((prev) => {
      const lineItems = [...(prev.line_items ?? [])];
      lineItems[index] = recalcLineItemAmount({ ...lineItems[index], ...patch });
      return { ...prev, line_items: lineItems };
    });
  }

  function addCustomLine() {
    setForm((prev) => ({
      ...prev,
      line_items: [
        ...(prev.line_items ?? []),
        { module_key: null, description: "", quantity: 1, unit_price: 0, amount: 0, included: true },
      ],
    }));
  }

  function removeLine(index) {
    setForm((prev) => ({
      ...prev,
      line_items: (prev.line_items ?? []).filter((_, i) => i !== index),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = invoiceFormToPayload(form);
      const res = isEdit
        ? await apiRequest(`/admin/platform-invoices/${invoiceId}`, { method: "PATCH", body: payload })
        : await apiRequest("/admin/platform-invoices", { method: "POST", body: payload });
      notifySuccess(res.message ?? "Invoice saved.");
      onSaved?.(res.data);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to save invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      notifyError("Enter a template name.");
      return;
    }
    try {
      await apiRequest("/admin/platform-invoices/saved-templates", {
        method: "POST",
        body: {
          name: templateName.trim(),
          description: templateDescription.trim() || null,
          template_id: form.template_id,
          line_items: form.line_items,
          selected_modules: form.selected_modules,
          notes: form.notes,
          terms: form.terms,
          tax_rate: form.tax_rate,
        },
      });
      notifySuccess("Template saved.");
      setSaveTemplateOpen(false);
      setTemplateName("");
      setTemplateDescription("");
      await loadSavedTemplates();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to save template.");
    }
  }

  function applySavedTemplate(templateId) {
    const template = savedTemplates.find((row) => String(row.id) === String(templateId));
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      template_id: template.template_id ?? prev.template_id,
      line_items: (template.line_items ?? []).map((row) => ({ ...row })),
      selected_modules: template.selected_modules ?? [],
      notes: template.notes ?? prev.notes,
      terms: template.terms ?? prev.terms,
      tax_rate: template.tax_rate ?? prev.tax_rate,
    }));
    notifySuccess(`Applied template “${template.name}”.`);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading invoice…</p>;
  }

  const activeLines = (form.line_items ?? []).filter((row) => row.included !== false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminBreadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Invoices", href: "/platform/invoices" },
            { label: isEdit ? form.invoice_number || "Edit" : "New invoice" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => printPlatformInvoice({ ...form, ...totals })}
          >
            Print / PDF
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setSaveTemplateOpen(true)}
          >
            Save as template
          </button>
          <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save invoice"}
          </PrimaryButton>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Invoice details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Tenant organization">
                <select
                  className={inputClass}
                  value={form.organization_id}
                  onChange={(e) => void handleOrganizationChange(e.target.value)}
                >
                  <option value="">— Select tenant —</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.org_name} ({org.company_code})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Design template">
                <select
                  className={inputClass}
                  value={form.template_id}
                  onChange={(e) => updateForm({ template_id: e.target.value })}
                >
                  {PLATFORM_INVOICE_DESIGN_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(e) => updateForm({ status: e.target.value })}
                >
                  {PLATFORM_INVOICE_STATUSES.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice number">
                <input
                  className={inputClass}
                  value={form.invoice_number}
                  onChange={(e) => updateForm({ invoice_number: e.target.value })}
                  placeholder="Auto-generated if empty"
                />
              </Field>
              <Field label="Issue date">
                <input
                  type="date"
                  className={inputClass}
                  value={form.issue_date}
                  onChange={(e) => updateForm({ issue_date: e.target.value })}
                />
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  className={inputClass}
                  value={form.due_date}
                  onChange={(e) => updateForm({ due_date: e.target.value })}
                />
              </Field>
              <Field label="VAT rate (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className={inputClass}
                  value={form.tax_rate}
                  onChange={(e) => updateForm({ tax_rate: e.target.value })}
                />
              </Field>
              {savedTemplates.length > 0 ? (
                <Field label="Load saved template">
                  <select
                    className={inputClass}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) applySavedTemplate(e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="">— Choose template —</option>
                    {savedTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {PLATFORM_INVOICE_DESIGN_TEMPLATES.find((t) => t.id === form.template_id)?.description}
            </p>
          </section>

          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Bill to</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Organization name" className="sm:col-span-2">
                <input className={inputClass} value={form.bill_to_name} onChange={(e) => updateForm({ bill_to_name: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className={inputClass} value={form.bill_to_email} onChange={(e) => updateForm({ bill_to_email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className={inputClass} value={form.bill_to_phone} onChange={(e) => updateForm({ bill_to_phone: e.target.value })} />
              </Field>
              <Field label="Company code">
                <input className={inputClass} value={form.bill_to_company_code} onChange={(e) => updateForm({ bill_to_company_code: e.target.value })} />
              </Field>
              <Field label="Tax PIN">
                <input className={inputClass} value={form.bill_to_tax_pin} onChange={(e) => updateForm({ bill_to_tax_pin: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <textarea className={inputClass} rows={3} value={form.bill_to_address} onChange={(e) => updateForm({ bill_to_address: e.target.value })} />
              </Field>
            </div>
          </section>

          {moduleSummaries.length > 0 ? (
            <section className="theme-panel rounded-xl border p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Enabled modules</h2>
              <p className="mt-1 text-xs text-slate-500">
                Check modules to add billing lines. Amounts are suggestions — edit line items below.
              </p>
              <ul className="mt-4 space-y-3">
                {moduleSummaries.map((summary) => {
                  const checked = (form.selected_modules ?? []).includes(summary.key);
                  return (
                    <li key={summary.key} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                        checked={checked}
                        onChange={(e) => toggleModule(summary, e.target.checked)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{summary.label}</p>
                        <p className="mt-0.5 text-xs text-slate-600">{summary.description}</p>
                        <p className="mt-1 text-xs font-medium text-indigo-700">
                          Suggested: {form.currency} {Number(summary.default_amount ?? 0).toLocaleString()} / {summary.billing_period}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
              <button type="button" className="text-sm font-medium text-indigo-600 hover:text-indigo-800" onClick={addCustomLine}>
                + Add line
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {(form.line_items ?? []).map((row, index) => (
                <div
                  key={`${row.module_key ?? "custom"}-${index}`}
                  className={`rounded-lg border p-3 ${row.included === false ? "border-dashed opacity-50" : "border-slate-200"}`}
                >
                  <div className="grid gap-3 sm:grid-cols-12">
                    <Field label="Description" className="sm:col-span-6">
                      <input
                        className={inputClass}
                        value={row.description ?? ""}
                        onChange={(e) => updateLineItem(index, { description: e.target.value })}
                      />
                    </Field>
                    <Field label="Qty" className="sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={inputClass}
                        value={row.quantity ?? 1}
                        onChange={(e) => updateLineItem(index, { quantity: e.target.value })}
                      />
                    </Field>
                    <Field label="Unit price" className="sm:col-span-3">
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass}
                        value={row.unit_price ?? 0}
                        onChange={(e) => updateLineItem(index, { unit_price: e.target.value })}
                      />
                    </Field>
                    <div className="flex items-end sm:col-span-1">
                      <button
                        type="button"
                        className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove line"
                        onClick={() => removeLine(index)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Line total: {form.currency} {Number(row.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
              {!activeLines.length ? (
                <p className="text-sm text-slate-500">No active line items. Select modules or add a custom line.</p>
              ) : null}
            </div>
            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{form.currency} {totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span>VAT</span><span>{form.currency} {totals.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="mt-1 flex justify-between font-semibold text-slate-900"><span>Total</span><span>{form.currency} {totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>
          </section>

          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <div className="grid gap-4">
              <Field label="Notes">
                <textarea className={inputClass} rows={3} value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} />
              </Field>
              <Field label="Terms">
                <textarea className={inputClass} rows={3} value={form.terms} onChange={(e) => updateForm({ terms: e.target.value })} />
              </Field>
            </div>
          </section>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <section className="theme-panel overflow-hidden rounded-xl border shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Live preview</h2>
              <p className="text-xs text-slate-500">Updates as you edit — matches print output.</p>
            </div>
            <iframe
              title="Invoice preview"
              className="h-[min(80vh,900px)] w-full border-0 bg-white"
              srcDoc={previewHtml}
            />
          </section>
        </div>
      </div>

      {saveTemplateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Save invoice template</h3>
            <p className="mt-1 text-sm text-slate-500">Reuse line items, notes, and design for future invoices.</p>
            <div className="mt-4 space-y-3">
              <Field label="Template name">
                <input className={inputClass} value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              </Field>
              <Field label="Description (optional)">
                <input className={inputClass} value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setSaveTemplateOpen(false)}>
                Cancel
              </button>
              <PrimaryButton type="button" showIcon={false} onClick={() => void handleSaveTemplate()}>
                Save template
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PlatformInvoiceEditorPage({ invoiceId = null }) {
  return (
    <CatalogPageShell
      title={invoiceId ? "Edit platform invoice" : "New platform invoice"}
      subtitle="Bill tenant organizations with professional templates, module summaries, and live preview."
    >
      <PlatformInvoiceEditor
        invoiceId={invoiceId}
        onSaved={(record) => {
          if (!invoiceId && record?.id) {
            window.location.href = `/platform/invoices/${record.id}`;
          }
        }}
      />
    </CatalogPageShell>
  );
}
