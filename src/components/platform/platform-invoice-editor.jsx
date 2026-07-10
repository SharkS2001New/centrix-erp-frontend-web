"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import {
  PLATFORM_BILLING_MODULE_GROUPS,
  PLATFORM_INVOICE_DESIGN_TEMPLATES,
  PLATFORM_INVOICE_STATUSES,
  buildPlatformBillingSummaries,
  calculateInvoiceTotals,
  emptyPlatformInvoiceForm,
  invoiceFormToPayload,
  invoiceRecordToForm,
  lineItemFromModuleSummary,
  lineItemsFromBillingKeys,
  normalizeInvoiceOptions,
  normalizeSeller,
  recalcLineItemAmount,
  resolveEnabledBillingModuleKeys,
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

async function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export function PlatformInvoiceEditor({ invoiceId = null, onSaved }) {
  const isEdit = Boolean(invoiceId);
  const searchParams = useSearchParams();
  const presetTemplateId = searchParams.get("template")?.trim() ?? "";
  const [form, setForm] = useState(() => emptyPlatformInvoiceForm());
  const [organizations, setOrganizations] = useState([]);
  const [moduleSummaries, setModuleSummaries] = useState([]);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [presetTemplateApplied, setPresetTemplateApplied] = useState(false);

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

  const loadBillingContext = useCallback(async (organizationId, options = {}) => {
    const {
      syncBillTo = true,
      syncSeller = true,
      autoSelectModules = Boolean(organizationId),
    } = options;
    try {
      const query = organizationId ? `?organization_id=${organizationId}` : "";
      const res = await apiRequest(`/admin/platform-invoices/billing-context${query}`);
      const summaries = buildPlatformBillingSummaries(res.module_summaries ?? []);
      setModuleSummaries(summaries);

      const enabledKeys = organizationId ? resolveEnabledBillingModuleKeys(res) : [];

      setForm((prev) => {
        const next = { ...prev };
        if (syncBillTo && res.bill_to) {
          next.bill_to_name = res.bill_to.name ?? prev.bill_to_name;
          next.bill_to_email = res.bill_to.email ?? prev.bill_to_email;
          next.bill_to_phone = res.bill_to.phone ?? prev.bill_to_phone;
          next.bill_to_address = res.bill_to.address ?? prev.bill_to_address;
          next.bill_to_tax_pin = res.bill_to.tax_pin ?? prev.bill_to_tax_pin;
          next.bill_to_company_code = res.bill_to.company_code ?? prev.bill_to_company_code;
        }
        if (syncSeller) {
          // Prefer Alpac defaults; only fill blanks from API context.
          const contextSeller = res.seller ?? res.bill_from ?? {};
          next.seller = normalizeSeller({
            ...contextSeller,
            name: contextSeller.name || prev.seller?.name,
            email: contextSeller.email || prev.seller?.email,
            phone: contextSeller.phone || prev.seller?.phone,
            address: contextSeller.address || prev.seller?.address,
            tax_pin: contextSeller.tax_pin || prev.seller?.tax_pin,
          });
        }
        if (autoSelectModules) {
          next.selected_modules = enabledKeys;
          next.line_items = lineItemsFromBillingKeys(enabledKeys, summaries);
        }
        return next;
      });
      return summaries;
    } catch (e) {
      // Still show catalog modules if billing-context fails.
      const fallback = buildPlatformBillingSummaries([]);
      setModuleSummaries(fallback);
      notifyError(e instanceof ApiError ? e.message : "Failed to load billing context.");
      return fallback;
    }
  }, []);

  const loadInvoice = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/platform-invoices/${invoiceId}`);
      const record = res.data;
      setForm(invoiceRecordToForm(record));
      await loadBillingContext(record.organization_id ?? "", {
        syncBillTo: false,
        syncSeller: false,
        autoSelectModules: false,
      });
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
      void loadBillingContext("", { syncBillTo: false, syncSeller: false, autoSelectModules: false });
    } else {
      void loadInvoice();
    }
  }, [invoiceId, loadBillingContext, loadInvoice, loadOrganizations, loadSavedTemplates]);

  function updateForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function updateSeller(patch) {
    setForm((prev) => ({
      ...prev,
      seller: normalizeSeller({ ...prev.seller, ...patch }),
    }));
  }

  function updateInvoiceOptions(patch) {
    setForm((prev) => ({
      ...prev,
      invoice_options: normalizeInvoiceOptions({ ...prev.invoice_options, ...patch }),
    }));
  }

  async function handleLogoUpload(event, targetKey) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notifyError("Please choose an image file.");
      return;
    }
    try {
      const dataUrl = await imageFileToDataUrl(file);
      updateInvoiceOptions({ [targetKey]: dataUrl });
      notifySuccess("Logo uploaded.");
    } catch {
      notifyError("Could not upload logo.");
    }
  }

  async function handleOrganizationChange(organizationId) {
    updateForm({ organization_id: organizationId, selected_modules: [], line_items: [] });
    // Refresh Bill to + auto-tick this tenant's enabled modules onto the invoice.
    await loadBillingContext(organizationId || "", {
      syncBillTo: true,
      syncSeller: false,
      autoSelectModules: Boolean(organizationId),
    });
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
      const saved = res.data;
      if (saved) {
        setForm((prev) => {
          const next = invoiceRecordToForm(saved);
          // If the API omits seller, keep what the user just saved in the form.
          if (!(saved.seller ?? saved.bill_from)) {
            next.seller = prev.seller;
          }
          return next;
        });
      }
      onSaved?.(saved);
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
          invoice_options: form.invoice_options,
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

  useEffect(() => {
    if (isEdit || presetTemplateApplied || !presetTemplateId || !savedTemplates.length) return;
    const template = savedTemplates.find((row) => String(row.id) === String(presetTemplateId));
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      template_id: template.template_id ?? prev.template_id,
      invoice_options: normalizeInvoiceOptions(template.invoice_options ?? prev.invoice_options),
      line_items: (template.line_items ?? []).map((row) => ({ ...row })),
      selected_modules: template.selected_modules ?? [],
      notes: template.notes ?? prev.notes,
      terms: template.terms ?? prev.terms,
      tax_rate: template.tax_rate ?? prev.tax_rate,
    }));
    setPresetTemplateApplied(true);
    notifySuccess(`Applied template “${template.name}”.`);
  }, [isEdit, presetTemplateApplied, presetTemplateId, savedTemplates]);

  function applySavedTemplate(templateId) {
    const template = savedTemplates.find((row) => String(row.id) === String(templateId));
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      template_id: template.template_id ?? prev.template_id,
      invoice_options: normalizeInvoiceOptions(template.invoice_options ?? prev.invoice_options),
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
  const seller = normalizeSeller(form.seller);
  const invoiceOptions = normalizeInvoiceOptions(form.invoice_options);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AppBreadcrumb
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
              <Field label="Saved template">
                <select
                  className={inputClass}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) applySavedTemplate(e.target.value);
                    e.target.value = "";
                  }}
                >
                  <option value="">— Load saved template —</option>
                  {savedTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
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
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {PLATFORM_INVOICE_DESIGN_TEMPLATES.find((t) => t.id === form.template_id)?.description}
              {" · "}
              <a href="/platform/invoice-templates" className="font-medium text-[#185FA5] hover:underline">
                Manage templates
              </a>
            </p>
          </section>

          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Bill from</h2>
            <p className="mt-1 text-xs text-slate-500">
              Your company details on the invoice (defaults to ALPAC SOFTWARE SOLUTIONS).
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Organization name" className="sm:col-span-2">
                <input className={inputClass} value={seller.name} onChange={(e) => updateSeller({ name: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className={inputClass} value={seller.email} onChange={(e) => updateSeller({ email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className={inputClass} value={seller.phone} onChange={(e) => updateSeller({ phone: e.target.value })} />
              </Field>
              <Field label="Tax PIN">
                <input className={inputClass} value={seller.tax_pin} onChange={(e) => updateSeller({ tax_pin: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <textarea className={inputClass} rows={3} value={seller.address} onChange={(e) => updateSeller({ address: e.target.value })} />
              </Field>
            </div>
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

          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Branding &amp; display</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Header branding">
                <select
                  className={inputClass}
                  value={invoiceOptions.brand_mode}
                  onChange={(e) => updateInvoiceOptions({ brand_mode: e.target.value })}
                >
                  <option value="name">Name only</option>
                  <option value="logo">Logo only</option>
                  <option value="both">Logo and name</option>
                </select>
              </Field>
              <Field label="Brand name">
                <input
                  className={inputClass}
                  value={invoiceOptions.brand_name}
                  onChange={(e) => updateInvoiceOptions({ brand_name: e.target.value })}
                />
              </Field>
              <Field label="Brand logo" className="sm:col-span-2">
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm text-slate-600"
                  onChange={(e) => void handleLogoUpload(e, "brand_logo_url")}
                />
                {invoiceOptions.brand_logo_url ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-red-600 hover:text-red-800"
                    onClick={() => updateInvoiceOptions({ brand_logo_url: "" })}
                  >
                    Remove brand logo
                  </button>
                ) : null}
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={invoiceOptions.show_quantity !== false}
                  onChange={(e) => updateInvoiceOptions({ show_quantity: e.target.checked })}
                />
                Show quantity column on invoice
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={Boolean(invoiceOptions.show_payment_details)}
                  onChange={(e) => updateInvoiceOptions({ show_payment_details: e.target.checked })}
                />
                Show payment details
              </label>
              {invoiceOptions.show_payment_details ? (
                <Field label="Payment details" className="sm:col-span-2">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={invoiceOptions.payment_details}
                    onChange={(e) => updateInvoiceOptions({ payment_details: e.target.value })}
                    placeholder="Bank name, account number, paybill, etc."
                  />
                </Field>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={Boolean(invoiceOptions.show_etims_invoice_no)}
                  onChange={(e) => updateInvoiceOptions({ show_etims_invoice_no: e.target.checked })}
                />
                Show eTIMS KRA invoice number
              </label>
              {invoiceOptions.show_etims_invoice_no ? (
                <Field label="eTIMS KRA invoice no." className="sm:col-span-2">
                  <input
                    className={inputClass}
                    value={invoiceOptions.etims_invoice_no}
                    onChange={(e) => updateInvoiceOptions({ etims_invoice_no: e.target.value })}
                    placeholder="KRA-approved invoice reference"
                  />
                </Field>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={invoiceOptions.watermark_enabled !== false}
                  onChange={(e) => updateInvoiceOptions({ watermark_enabled: e.target.checked })}
                />
                Show anti-fraud watermark
              </label>
              {invoiceOptions.watermark_enabled !== false ? (
                <>
                  <Field label="Watermark style">
                    <select
                      className={inputClass}
                      value={invoiceOptions.watermark_mode}
                      onChange={(e) => updateInvoiceOptions({ watermark_mode: e.target.value })}
                    >
                      <option value="name">CentrixERP name</option>
                      <option value="text">Custom text</option>
                      <option value="logo">Logo image</option>
                    </select>
                  </Field>
                  {invoiceOptions.watermark_mode === "text" ? (
                    <Field label="Watermark text">
                      <input
                        className={inputClass}
                        value={invoiceOptions.watermark_text}
                        onChange={(e) => updateInvoiceOptions({ watermark_text: e.target.value })}
                      />
                    </Field>
                  ) : null}
                  {invoiceOptions.watermark_mode === "logo" ? (
                    <Field label="Watermark logo" className="sm:col-span-2">
                      <input
                        type="file"
                        accept="image/*"
                        className="block w-full text-sm text-slate-600"
                        onChange={(e) => void handleLogoUpload(e, "watermark_logo_url")}
                      />
                      {invoiceOptions.watermark_logo_url ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-red-600 hover:text-red-800"
                          onClick={() => updateInvoiceOptions({ watermark_logo_url: "" })}
                        >
                          Remove watermark logo
                        </button>
                      ) : null}
                    </Field>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          {moduleSummaries.length > 0 ? (
            <section className="theme-panel rounded-xl border p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Workspace modules</h2>
              <p className="mt-1 text-xs text-slate-500">
                Aligned to Centrix workspaces. Choosing a tenant auto-selects their enabled modules
                (and free Administration). Amounts are market suggestions — edit line items below.
              </p>
              <div className="mt-4 space-y-5">
                {PLATFORM_BILLING_MODULE_GROUPS.map((group) => {
                  const rows = moduleSummaries.filter((summary) => summary.group === group.id);
                  if (!rows.length) return null;
                  return (
                    <div key={group.id}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {group.label}
                      </p>
                      <ul className="space-y-3">
                        {rows.map((summary) => {
                          const checked = (form.selected_modules ?? []).includes(summary.key);
                          return (
                            <li
                              key={summary.key}
                              className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40"
                            >
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-slate-300"
                                checked={checked}
                                onChange={(e) => toggleModule(summary, e.target.checked)}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {summary.label}
                                  {summary.free ? (
                                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                                      Free
                                    </span>
                                  ) : null}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                                  {summary.description}
                                </p>
                                <p className="mt-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                                  {summary.free
                                    ? "Included free of charge"
                                    : `Suggested: ${form.currency} ${Number(summary.default_amount ?? 0).toLocaleString()} / ${summary.billing_period}`}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
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
                    <Field label="Qty" className={`sm:col-span-2 ${invoiceOptions.show_quantity === false ? "opacity-50" : ""}`}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={inputClass}
                        value={row.quantity ?? 1}
                        disabled={invoiceOptions.show_quantity === false}
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
      <Suspense fallback={<p className="text-sm text-slate-500">Loading invoice…</p>}>
        <PlatformInvoiceEditor
          invoiceId={invoiceId}
          onSaved={(record) => {
            if (!invoiceId && record?.id) {
              window.location.href = `/platform/invoices/${record.id}`;
            }
          }}
        />
      </Suspense>
    </CatalogPageShell>
  );
}
